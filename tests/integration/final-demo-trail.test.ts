import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, expect, it } from "vitest";
import { mintAgent } from "@/lib/agents/tokens";
import { connectDb, type Db } from "@/lib/db/client";
import { demoSnapshot, DEMO_MERCHANT_NAME, MUSE_AGENT_ID } from "@/lib/demo/snapshot";
import { methodNotAllowed, mcpPostHandler } from "@/lib/mcp/http";
import { buyerRequest } from "../../sim/buyers/buyer";
import { BUYERS } from "../../sim/buyers/intents";
import { sourceOffer, type SourceContext } from "../../sim/buyers/recording";
import { mcpConnector } from "../../sim/buyers/run";
import { Recording, runScene } from "../../sim/buyers/scene";
import { createTestDatabase, type TestDatabase } from "../support/db";

// The S7 scene end to end on a local database: the scene command's own MCP connector speaks
// streamable HTTP to the route's handler, which runs as a runtime-role login; the clock is the
// test's and the scene's sleep moves it, so the deadline passes inside the run.

let t: TestDatabase;
let app: { db: Db; close: () => Promise<void> };
const RUNTIME_LOGIN = `backfill_t_rt_${randomBytes(4).toString("hex")}`;
// A Tuesday, 14:00:10 in Singapore.
let now = new Date("2026-11-03T14:00:10+08:00");
const handler = mcpPostHandler(() => app.db, () => now);
const route = (req: Request) => (req.method === "POST" ? handler(req) : Promise.resolve(methodNotAllowed()));
const tokens = new Map<string, string>();


// Covers per buyer, in buyer order; 0 declines. 38 covers against a capacity of 16.
const COVERS = [2, 1, 4, 1, 2, 3, 1, 4, 0, 1, 0, 2, 0, 4, 2, 0, 3, 1, 3, 4];
const PLAN = { discountBps: 1800, capacityCovers: 24, minPoolCovers: 8, perAgentCapCovers: 4, rationale: "It sold out at 16 covers. Add seats and trim the discount." };

function recording(covers: readonly number[] = COVERS): Recording {
  const source: SourceContext = {
    merchantName: DEMO_MERCHANT_NAME,
    about: "a kopi and kaya toast set with soft-boiled eggs at a cafe near Tanjong Pagar MRT, with seats and quiet desks",
    visitDate: "2026-11-01",
    offer: { listPriceCents: 680, offerPriceCents: 544, discountBps: 2000, minPoolCovers: 8, perAgentCapCovers: 4, window: { weekday: 7, startMinute: 847, endMinute: 907, commitByMinute: 847 } },
  };
  return {
    version: 2,
    source,
    recordedAt: "2026-11-02T06:00:00.000Z",
    sparkModel: "muse-spark-1.3",
    wonderModel: "muse-wonder-1.0",
    buyers: BUYERS.map((b, i) => ({ agentId: b.agentId, intent: b.intent, request: buyerRequest(b, sourceOffer(source)), reply: { covers: covers[i]!, reason: "fits" }, error: null, costNanoUsd: 0 })),
    wonder: { prompt: "w", reply: PLAN },
    costNanoUsd: 0,
  };
}

// Every connection moves the clock a second on, so commitments arrive in buyer order.
const connect = mcpConnector("http://backfill.test", tokens, (url, init) => {
  now = new Date(now.getTime() + 1000);
  return route(new Request(url, init));
});

const scene = (models: Parameters<typeof runScene>[0]["models"]) =>
  runScene({ db: t.db, connect, models, now: () => now, sleep: async (ms) => void (now = new Date(now.getTime() + ms)), leadMinutes: 2, concurrency: 1, settleMs: 5000 });

beforeAll(async () => {
  t = await createTestDatabase("final_trail");
  await t.admin.unsafe(`CREATE ROLE ${RUNTIME_LOGIN} LOGIN IN ROLE backfill_app`);
  const url = new URL(t.url);
  url.username = RUNTIME_LOGIN;
  app = connectDb(url.toString(), 10);
  for (const b of BUYERS) tokens.set(b.agentId, (await mintAgent(t.db, b.agentId, b.intent)).token);
  // The real Muse user's commitment sits in another merchant's pool: Demo Kopitiam, Tuesday noon.
  const [m] = await t.admin`insert into merchants ${t.admin({ name: "Demo Kopitiam (synthetic)" })} returning id`;
  const [r] = await t.admin`insert into rules ${t.admin({ merchant_id: m!.id, list_price_cents: 1250, capacity_covers: 20, weekday: 2, start_minute: 840, end_minute: 1020, commit_by_minute: 720, discount_bps: 2500, min_pool_covers: 8, per_agent_cap_covers: 4, floor_price_cents: 900 })} returning id`;
  tokens.set(MUSE_AGENT_ID, (await mintAgent(t.db, MUSE_AGENT_ID, "Muse user")).token);
  const muse = await connect(MUSE_AGENT_ID);
  const submitted = (await muse.call("submit_commitment", { ruleId: r!.id, termsVersion: 1, visitDate: "2026-11-10", covers: 2, maxPricePerCoverCents: 938, idempotencyKey: "muse-1" })) as { commitment: { commitmentId: string } };
  await muse.close();
  expect(submitted.commitment.commitmentId).toBeTruthy();
});

afterAll(async () => {
  await app?.close();
  await t?.drop();
  const root = postgres(process.env.TEST_DATABASE_URL ?? "", { max: 1, onnotice: () => {} });
  try {
    await root.unsafe(`DROP ROLE IF EXISTS ${RUNTIME_LOGIN}`);
  } finally {
    await root.end({ timeout: 5 });
  }
});


it("replay stores a scripted matching trail for committed buyers only", async () => {
 const result=await scene({mode:'replay',recording:recording()});
 const trail=result.snapshot.scene!.trail!;
 expect(trail).toHaveLength(result.buyers.filter(b=>b.outcome!=='declined').length);
 for(const row of trail){expect(row.provenance).toBe('recorded_replay');expect(row.approval).toBe('scripted');expect(row.request).toBeTruthy();expect(row.output).toMatchObject({covers:row.final!.covers});expect(row.terms).toMatchObject(row.final!);}
 const rows=await t.admin`select party_id from demo_trails where rule_id=${result.ruleId}`;
 for(const buyer of result.buyers.filter(b=>b.outcome==='declined'))expect(rows.map(r=>r.party_id)).not.toContain(buyer.agentId);
});
it("an overdue uncleared Muse commitment awaits settlement",async()=>{
 expect((await demoSnapshot(t.db,new Date('2026-11-10T05:00:00Z'))).muse?.status).toBe('awaiting_settlement');
});
