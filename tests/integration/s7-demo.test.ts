import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mintAgent } from "@/lib/agents/tokens";
import { listOffers, submitCommitment, settleDue } from "@/lib/commitments/service";
import { connectDb, type Db } from "@/lib/db/client";
import { publicDemoLedger } from "@/lib/demo/ledger";
import { demoSnapshot, DEMO_MERCHANT_NAME, MUSE_AGENT_ID } from "@/lib/demo/snapshot";
import { methodNotAllowed, mcpPostHandler } from "@/lib/mcp/http";
import { floorHidden } from "@/lib/onboarding/live";
import { buyerRequest, type BuyerDecision, type DecideBuyer } from "../../sim/buyers/buyer";
import { BUYERS } from "../../sim/buyers/intents";
import { sourceOffer, type SourceContext } from "../../sim/buyers/recording";
import { mcpConnector } from "../../sim/buyers/run";
import { prepareScene, Recording, runScene, SCENE_RULE } from "../../sim/buyers/scene";
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
let museCommitmentId = "";

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
  t = await createTestDatabase("s7_demo");
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
  museCommitmentId = submitted.commitment.commitmentId;
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

describe("the S7 demo scene", () => {
  it("does not expose another merchant's ledger or private terms through the public demo read", async () => {
    const [privateMerchant] = await t.admin`insert into merchants (name) values ('Private ledger fixture') returning id`;
    const [privateRule] = await t.admin`insert into rules ${t.admin({ merchant_id: privateMerchant!.id, list_price_cents: 1250, capacity_covers: 2, weekday: 2, start_minute: 840, end_minute: 1020, commit_by_minute: 720, discount_bps: 2500, min_pool_covers: 2, per_agent_cap_covers: 2, floor_price_cents: 900 })} returning id`;
    const privateAgent = await mintAgent(t.db, "private-ledger-buyer", "Private buyer");
    const submitted = await submitCommitment(app.db, privateAgent.id, { ruleId: privateRule!.id, termsVersion: 1, visitDate: "2026-11-03", covers: 2, maxPricePerCoverCents: 938, idempotencyKey: "private-ledger" }, () => new Date("2026-11-03T10:00:00+08:00"));
    expect(submitted.ok).toBe(true);
    await settleDue(app.db, privateMerchant!.id, () => new Date("2026-11-03T12:00:00+08:00"));
    expect(Number((await t.admin`select sum(buyer_share_cents) as savings from ledger where merchant_id = ${privateMerchant!.id}`)[0]?.savings)).toBe(624);
    expect(await publicDemoLedger(app.db, "No such demo merchant")).toBeNull();
    const snapshot = await demoSnapshot(app.db, now);
    expect(snapshot.ledger).toBeNull();
    expect(JSON.stringify(snapshot)).not.toMatch(/floorPrice|floor_price|tokenHash|token_hash|receipt/);
  });

  it("replays a recorded run through MCP: nobody unlocks alone, the pool clears and sells out, and Wonder's recorded plan is stored", async () => {
    now = new Date("2026-11-03T14:00:10+08:00");
    const result = await scene({ mode: "replay", recording: recording() });

    expect(result.visitDate).toBe("2026-11-03");
    expect(result.commitBy).toBe("2026-11-03T06:03:00.000Z");
    // First come first served up to 16: buyers 08, 12, 14, 15, 17, 19 and 20 no longer fit.
    const filled = ["sim-buyer-01", "sim-buyer-02", "sim-buyer-03", "sim-buyer-04", "sim-buyer-05", "sim-buyer-06", "sim-buyer-07", "sim-buyer-10", "sim-buyer-18"];
    const declined = ["sim-buyer-09", "sim-buyer-11", "sim-buyer-13", "sim-buyer-16"];
    for (const b of result.buyers) {
      expect(b.outcome, b.agentId).toBe(declined.includes(b.agentId) ? "declined" : filled.includes(b.agentId) ? "filled" : "not_filled");
    }

    const s = result.snapshot.scene!;
    expect(s.merchantName).toBe(DEMO_MERCHANT_NAME);
    expect(result.snapshot.ledger).toMatchObject({ covers: 16, buyerShareCents: 2176, agentShareCents: 0, networkShareCents: 0, agentsCommitted: 16, poolsUnlocked: 1, reconciled: true });
    expect(result.snapshot.ledger?.pools).toHaveLength(1);
    expect(result.snapshot.ledger?.pools[0]).toMatchObject({ visitDate: "2026-11-03", buyerShareCents: 2176, reconciled: true });
    expect(s.phase).toBe("cleared");
    expect(s.buyers).toHaveLength(16);
    expect(s.buyers.filter((b) => b.soloUnlocks)).toEqual([]);
    expect(s.buyers.filter((b) => b.outcome === "filled").map((b) => b.agentId).sort()).toEqual(filled);
    expect(s.buyers.filter((b) => b.outcome === "not_filled")).toHaveLength(7);
    expect(s.pooled).toEqual({ covers: 38, unlocked: true, filledCovers: 16, soldOut: true });
    expect(s.plan).toEqual({ ...PLAN, provenance: "recorded_replay", verdict: "ok", applied: false });
    const [plan] = await t.admin`select model from wonder_plans where rule_id = ${result.ruleId}`;
    expect(plan?.model).toBe("replay:muse-wonder-1.0");
    expect((await t.admin`select count(*)::int as n from llm_calls`)[0]?.n).toBe(0);

    expect(result.snapshot.muse).toEqual({ commitmentId: museCommitmentId, merchantName: "Demo Kopitiam (synthetic)", visitDate: "2026-11-10", covers: 2, status: "pending", pooledCovers: 2, minPoolCovers: 8 });
    expect(floorHidden(result.snapshot, SCENE_RULE.floorPriceCents)).toBe(true);
    expect(floorHidden(result.snapshot, 900)).toBe(true);
    // The runtime role, which Render connects as, reads the same snapshot.
    expect(await demoSnapshot(app.db, now)).toEqual(result.snapshot);
  });

  it("shows the open pool before the deadline, and one buyer alone unlocking only when it holds the minimum", async () => {
    now = new Date("2026-11-03T15:00:10+08:00");
    const { ruleId } = await prepareScene(t.db, now, 2);
    await t.admin`update rules set per_agent_cap_covers = 8 where id = ${ruleId}`;
    const big = await connect("sim-buyer-01");
    const small = await connect("sim-buyer-02");
    const base = { ruleId, termsVersion: 2, visitDate: "2026-11-03", maxPricePerCoverCents: 544 };
    expect(await big.call("submit_commitment", { ...base, covers: 8, idempotencyKey: "big" })).toMatchObject({ ok: true });
    expect(await small.call("submit_commitment", { ...base, covers: 7, idempotencyKey: "small" })).toMatchObject({ ok: true });
    await big.close();
    await small.close();
    const s = (await demoSnapshot(t.db, now)).scene!;
    expect(s.phase).toBe("open");
    expect(s.buyers.map((b) => [b.agentId, b.soloUnlocks, b.outcome])).toEqual([
      ["sim-buyer-01", true, "pending"],
      ["sim-buyer-02", false, "pending"],
    ]);
    expect(s.pooled).toEqual({ covers: 15, unlocked: true, filledCovers: 0, soldOut: false });
  });

  it("retires the earlier scene rule without moving its terms version, so only the new one is listed", async () => {
    now = new Date("2026-11-03T16:00:10+08:00");
    const before = (await t.admin`select id, terms_version, floor_price_cents from rules r where merchant_id = (select id from merchants where name = ${DEMO_MERCHANT_NAME}) order by id`).map((r) => ({ ...r }));
    const { ruleId, merchant } = await prepareScene(t.db, now, 2);
    const after = await t.admin`select id, terms_version, floor_price_cents, list_price_cents, commit_by_minute from rules where merchant_id = ${merchant.id}`;
    for (const old of before) {
      const row = after.find((r) => r.id === old.id)!;
      expect(row.floor_price_cents).toBe(row.list_price_cents);
      expect(row.terms_version).toBe(old.terms_version);
    }
    expect(after.find((r) => r.id === ruleId)).toMatchObject({ terms_version: 1, floor_price_cents: 500, commit_by_minute: 963 });
    expect((await listOffers(app.db, () => now)).filter((o) => o.merchantName === DEMO_MERCHANT_NAME).map((o) => o.offer.ruleId)).toEqual([ruleId]);
    expect(await prepareScene(t.db, new Date("2026-11-03T22:59:00+08:00"), 2).catch((e: Error) => e.message)).toMatch(/too late/);
  });

  it("records: asks the model once per buyer until the spend cap, and saves every request and reply", async () => {
    now = new Date("2026-11-03T17:00:10+08:00");
    let calls = 0;
    const decide: DecideBuyer = async (buyer, offer) => {
      calls += 1;
      const reply: BuyerDecision = { covers: 1, reason: `${buyer.agentId} fits` };
      return { request: buyerRequest(buyer, offer), reply, error: null, costNanoUsd: 100 };
    };
    const result = await scene({ mode: "record", spark: "muse-spark-1.3", wonder: "muse-wonder-1.0", decide, propose: async () => null, spentNanoUsd: () => calls * 100, capNanoUsd: 500 });
    expect(calls).toBe(5);
    expect(result.buyers.filter((b) => b.outcome === "stopped_for_cap")).toHaveLength(15);
    const rec = Recording.parse(result.recording);
    expect(rec.buyers.map((b) => b.agentId)).toEqual(BUYERS.slice(0, 5).map((b) => b.agentId));
    expect(rec.buyers[0]?.request.prompt).toContain("20% off, S$6.80 becomes S$5.44 per cover");
    expect(rec.costNanoUsd).toBe(500);
    // Five covers never reach the minimum of 8, so nothing sold out and Wonder was never asked.
    expect(rec.wonder).toBeNull();
    expect(result.snapshot.scene?.pooled).toEqual({ covers: 5, unlocked: false, filledCovers: 0, soldOut: false });
  });

  it("refuses a replayed reply over the per-agent cap through MCP, like any buyer's", async () => {
    now = new Date("2026-11-03T18:00:10+08:00");
    const covers = COVERS.map((_, i) => (i === 0 ? 5 : 0));
    const result = await scene({ mode: "replay", recording: recording(covers) });
    expect(result.buyers[0]).toMatchObject({ agentId: "sim-buyer-01", covers: 5, outcome: "refused_over_agent_cap" });
    expect(result.snapshot.scene?.buyers).toEqual([]);
  });
});
