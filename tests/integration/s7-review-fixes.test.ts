import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { mintAgent } from "@/lib/agents/tokens";
import { submitCommitment, getCommitmentStatus, cancelCommitment } from "@/lib/commitments/service";
import { connectDb, type Db } from "@/lib/db/client";
import { singaporeInstant } from "@/domain/commitments/occurrence";
import { merchants, rules } from "@/lib/db/schema";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mcpPostHandler } from "@/lib/mcp/http";
import { mcpConnector } from "../../sim/buyers/run";
import { buyerRequest } from "../../sim/buyers/buyer";
import { BUYERS } from "../../sim/buyers/intents";
import { openRecordingJournal } from "../../sim/buyers/journal";
import { prepareScene, runScene, SCENE_RULE } from "../../sim/buyers/scene";
import { createTestDatabase, type TestDatabase } from "../support/db";

let t: TestDatabase;
let app: { db: Db; close: () => Promise<void> };
const login = `backfill_t_review_${randomBytes(4).toString("hex")}`;
const tokens = new Map<string, string>();
let now = new Date("2026-11-03T09:00:00+08:00");
beforeAll(async () => {
  t = await createTestDatabase("s7_fixes");
  await t.admin.unsafe(`CREATE ROLE ${login} LOGIN IN ROLE backfill_app`);
  const url = new URL(t.url); url.username = login;
  app = connectDb(url.toString(), 4);
  await mintAgent(t.db, "future-one", "Future party one");
  await mintAgent(t.db, "future-two", "Future party two");
  for (const b of BUYERS.slice(0, 4)) tokens.set(b.agentId, (await mintAgent(t.db, b.agentId, b.intent)).token);
});
afterAll(async () => {
  await app?.close(); await t?.drop();
  const root = postgres(process.env.TEST_DATABASE_URL ?? "", { max: 1, onnotice: () => {} });
  try { await root.unsafe(`DROP ROLE IF EXISTS ${login}`); } finally { await root.end({ timeout: 5 }); }
});

describe("S7 review fixes", () => {
  it("refuses retirement while an earlier scene has accepted future commitments, which still fill", async () => {
    const { ruleId, merchant } = await prepareScene(t.db, now, 5);
    const ids: string[] = [];
    for (const agent of ["future-one", "future-two"]) {
      const result = await submitCommitment(app.db, agent, { ruleId, termsVersion: 1, visitDate: "2026-11-10", covers: 4, maxPricePerCoverCents: 544, idempotencyKey: agent }, () => now);
      expect(result.ok).toBe(true);
      if (result.ok) ids.push(result.commitment.commitmentId);
    }
    const before = await t.db.select().from(rules).where(eq(rules.merchantId, merchant.id));
    const error = await prepareScene(t.db, new Date("2026-11-03T10:00:00+08:00"), 5).then(() => null, (e: Error) => e.message);
    expect(error).toBe("earlier scene has pending commitments; wait for its deadline before starting another");
    expect(await t.db.select().from(rules).where(eq(rules.merchantId, merchant.id))).toEqual(before);
    now = new Date("2026-11-10T09:05:00+08:00");
    expect(await getCommitmentStatus(app.db, "future-one", ids[0]!, () => now)).toMatchObject({ ok: true, commitment: { status: "filled", pricePerCoverCents: 544 } });
    expect((await t.admin`select count(*)::int n from clearing_fills where rule_id=${ruleId}`)[0]?.n).toBe(2);
    const settledError = await prepareScene(t.db, now, 5).then(() => null, (e: Error) => e.message);
    expect(settledError).toBeNull();
  });
  it("waits for an in-flight commitment before deciding whether retirement is safe", async () => {
    now = new Date("2026-11-10T10:00:00+08:00");
    const { ruleId } = await prepareScene(t.db, now, 5);
    let markEntered = () => {};
    let allowCommit = () => {};
    const entered = new Promise<void>(resolve => { markEntered = resolve; });
    const release = new Promise<void>(resolve => { allowCommit = resolve; });
    const monitor = postgres(t.url, { max: 1, onnotice: () => {} });
    const inserting = t.admin.begin(async tx => {
      await tx`insert into commitments ${tx({ rule_id: ruleId, agent_id: "future-one", terms_version: 1, covers: 4, max_price_per_cover_cents: 544, visit_at: singaporeInstant("2026-11-17", 605), committed_at: now, idempotency_key: "racing-retirement" })}`;
      markEntered();
      await release;
    });
    await entered;
    const preparing = prepareScene(t.db, now, 5).then(() => null, (e: Error) => e.message);
    try {
      let blocked = false;
      for (let i = 0; i < 100 && !blocked; i++) {
        const [row] = await monitor`select count(*)::int n from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query ilike '%rules%'`;
        blocked = Number(row?.n) > 0;
        if (!blocked) await new Promise(r => setTimeout(r, 10));
      }
      expect(blocked).toBe(true);
    } finally {
      allowCommit(); await inserting; await monitor.end({ timeout: 5 });
    }
    expect(await preparing).toBe("earlier scene has pending commitments; wait for its deadline before starting another");
    const [row] = await t.admin`select floor_price_cents from rules where id=${ruleId}`;
    expect(row?.floor_price_cents).toBe(500);
    // Finish this fixture's occurrence so later tests can start a scene.
    now = new Date("2026-11-17T10:05:00+08:00");
    const [held] = await t.admin`select id from commitments where idempotency_key='racing-retirement'`;
    expect(await getCommitmentStatus(app.db, "future-one", held!.id, () => now)).toMatchObject({ ok: true, commitment: { status: "not_filled" } });
  });

});

it("checkpoints a completed decision before its MCP submission fails", async () => {
  const dir = mkdtempSync(join(tmpdir(), "s7-checkpoint-"));
  const journal = openRecordingJournal(join(dir, "scene.json"));
  now = new Date("2026-11-18T14:00:00+08:00");
  const handler = mcpPostHandler(() => app.db, () => now);
  const connector = mcpConnector("http://backfill.test", tokens, (url, init) => handler(new Request(url, init)));
  const error = await runScene({
    db: t.db, now: () => now, sleep: async ms => { now = new Date(now.getTime() + ms); }, leadMinutes: 5, concurrency: 1, settleMs: 0, buyers: [BUYERS[0]!],
    checkpoint: async event => { journal.append(event); },
    connect: async agent => {
      const client = await connector(agent);
      return { close: client.close, call: (name, args) => {
        if (name === "submit_commitment") throw new Error("MCP submission failed after decision");
        return client.call(name, args);
      } };
    },
    models: { mode: "record", spark: "muse-spark-1.3", wonder: "muse-wonder-1.0", spentNanoUsd: () => 100, capNanoUsd: 500,
      propose: async () => null,
      decide: async (buyer, offer) => ({ request: buyerRequest(buyer, offer), reply: { covers: 2, reason: "fits" }, error: null, costNanoUsd: 100 }),
    },
  }).then(() => null, e => e instanceof Error ? e.message : "unknown");
  journal.close();
  try {
    expect(error).toBe("MCP submission failed after decision");
    const events = readFileSync(journal.path, "utf8").split("\n").filter(Boolean).map(s => JSON.parse(s));
    expect(events[0]).toMatchObject({ type: "scene", data: { ruleId: expect.stringMatching(/^[0-9a-f-]{36}$/), visitDate: "2026-11-18" } });
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "buyer", data: expect.objectContaining({ agentId: "sim-buyer-01", reply: { covers: 2, reason: "fits" }, costNanoUsd: 100 }) })]));
    expect(events.find(e => e.type === "buyer").data.request.prompt).toContain("One cover is a kopi and kaya toast set");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it("settles due covers at their accepted price before retiring the old rule", async () => {
  now = new Date("2026-11-19T14:00:00+08:00");
  const { ruleId } = await prepareScene(t.db, now, 5);
  let heldId = "";
  for (const agent of ["future-one", "future-two"]) {
    const result = await submitCommitment(app.db, agent, { ruleId, termsVersion: 1, visitDate: "2026-11-19", covers: 4, maxPricePerCoverCents: 544, idempotencyKey: `due-${agent}` }, () => now);
    expect(result.ok).toBe(true); if (result.ok && agent === "future-one") heldId = result.commitment.commitmentId;
  }
  now = new Date("2026-11-19T14:06:00+08:00");
  const error = await prepareScene(t.db, now, 5).then(() => null, (e: Error) => e.message);
  expect(error).toBeNull();
  expect(await getCommitmentStatus(app.db, "future-one", heldId, () => now)).toMatchObject({ ok: true, commitment: { status: "filled", pricePerCoverCents: 544 } });
});

it("ignores cancelled commitments and another merchant's pending pool when retiring", async () => {
  const [current] = await t.admin`select r.id from rules r join merchants m on m.id=r.merchant_id where m.name='Backfill Demo Cafe' and r.floor_price_cents<r.list_price_cents`;
  const cancelled = await submitCommitment(app.db, "future-one", { ruleId: current!.id, termsVersion: 1, visitDate: "2026-11-26", covers: 2, maxPricePerCoverCents: 544, idempotencyKey: "cancelled-future" }, () => now);
  expect(cancelled.ok).toBe(true);
  if (cancelled.ok) expect(await cancelCommitment(app.db, "future-one", cancelled.commitment.commitmentId, () => now)).toMatchObject({ ok: true, commitment: { status: "cancelled" } });
  const [other] = await t.db.insert(merchants).values({ name: "Other S7 fixture" }).returning();
  const [rule] = await t.db.insert(rules).values({ merchantId: other!.id, weekday: 4, startMinute: 840, endMinute: 900, commitByMinute: 840, ...SCENE_RULE }).returning();
  expect(await submitCommitment(app.db, "future-two", { ruleId: rule!.id, termsVersion: 1, visitDate: "2026-11-26", covers: 2, maxPricePerCoverCents: 544, idempotencyKey: "other-future" }, () => now)).toMatchObject({ ok: true });
  const error = await prepareScene(t.db, now, 5).then(() => null, (e: Error) => e.message);
  expect(error).toBeNull();
});

it("checkpoints Wonder's proposal before a later plan-storage failure", async () => {
  const dir = mkdtempSync(join(tmpdir(), "s7-wonder-checkpoint-"));
  const journal = openRecordingJournal(join(dir, "scene.json"));
  now = new Date("2026-11-20T14:00:00+08:00");
  const handler = mcpPostHandler(() => app.db, () => now);
  const connect = mcpConnector("http://backfill.test", tokens, (url, init) => handler(new Request(url, init)));
  const plan = { discountBps: 1500, capacityCovers: 24, minPoolCovers: 8, perAgentCapCovers: 4, rationale: "More capacity for the next visit." };
  const failure = await runScene({ db: t.db, connect, now: () => now, sleep: async ms => { now = new Date(now.getTime() + ms); }, leadMinutes: 5, concurrency: 1, settleMs: 0, buyers: BUYERS.slice(0, 4),
    checkpoint: async event => { journal.append(event); if (event.type === "wonder") throw new Error("plan storage interrupted"); },
    models: { mode: "record", spark: "muse-spark-1.3", wonder: "muse-wonder-1.0", spentNanoUsd: () => 100, capNanoUsd: 5000, propose: async () => plan, decide: async (buyer, offer) => ({ request: buyerRequest(buyer, offer), reply: { covers: 4, reason: "fits" }, error: null, costNanoUsd: 100 }) },
  }).then(() => null, e => e instanceof Error ? e.message : "unknown");
  journal.close();
  try {
    expect(failure).toBe("plan storage interrupted");
    const events = readFileSync(journal.path, "utf8").split("\n").filter(Boolean).map(s => JSON.parse(s));
    expect(events.find(e => e.type === "wonder")?.data).toEqual({ prompt: expect.stringContaining("Plan the next terms"), reply: plan });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
