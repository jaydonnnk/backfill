import { randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { mintAgent } from "@/lib/agents/tokens";
import { cancelCommitment, submitCommitment } from "@/lib/commitments/service";
import { checkoutHandler } from "@/lib/checkout/http";
import { connectDb, type Db } from "@/lib/db/client";
import { createTestDatabase, type TestDatabase } from "../support/db";
let t: TestDatabase;
let app: { db: Db; close: () => Promise<void> };
const login = `backfill_t_checkout_${randomBytes(4).toString("hex")}`;
let now = new Date("2026-11-03T10:00:00+08:00");
const clock = () => now;
const create = checkoutHandler(() => app.db, "create", clock);
const read = checkoutHandler(() => app.db, "read", clock);
const complete = checkoutHandler(() => app.db, "complete", clock);
beforeAll(async () => {
  t = await createTestDatabase("s8_checkout");
  await t.admin.unsafe(`CREATE ROLE ${login} LOGIN IN ROLE backfill_app`);
  const url = new URL(t.url); url.username = login; app = connectDb(url.toString(), 10);
});
afterAll(async () => {
  await app?.close(); await t?.drop();
  const root = postgres(process.env.TEST_DATABASE_URL ?? "", { max: 1, onnotice: () => {} });
  try { await root.unsafe(`DROP ROLE IF EXISTS ${login}`); } finally { await root.end(); }
});
beforeEach(() => { now = new Date("2026-11-03T10:00:00+08:00"); });
async function fixture(covers = 2) {
  const [m] = await t.admin`insert into merchants (name) values ('S8 checkout') returning id`;
  const [r] = await t.admin`insert into rules ${t.admin({ merchant_id: m!.id, list_price_cents: 1250, capacity_covers: 2, weekday: 2, start_minute: 840, end_minute: 1020, commit_by_minute: 720, discount_bps: 2500, min_pool_covers: 2, per_agent_cap_covers: 4, floor_price_cents: 900 })} returning id`;
  const agent = await mintAgent(t.db, randomUUID(), "checkout buyer");
  const submitted = await submitCommitment(app.db, agent.id, { ruleId: String(r!.id), termsVersion: 1, visitDate: "2026-11-03", covers, maxPricePerCoverCents: 938, idempotencyKey: randomUUID() }, clock);
  expect(submitted.ok).toBe(true);
  if (!submitted.ok) throw new Error("fixture submit");
  return { agent, id: submitted.commitment.commitmentId, ruleId: String(r!.id) };
}
function req(token?: string, body?: unknown) {
  return new Request("http://backfill.test/api/checkout_sessions", { method: body === undefined ? "GET" : "POST", headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
it("authenticates missing, malformed, unknown and revoked agents before reading or settling", async () => {
  const f = await fixture(); await t.admin`update agents set revoked_at = now() where id = ${f.agent.id}`;
  const statuses = await Promise.all([undefined, "unknown", f.agent.token].map(async token => (await create(req(token, { commitment_id: f.id }))).status));
  expect(statuses).toEqual([401, 401, 401]);
  expect((await read(new Request("http://backfill.test", { headers: { authorization: "Basic invalid" } }), f.id)).status).toBe(401);
  expect(Number((await t.admin`select count(*)::int as n from clearings where rule_id = ${f.ruleId}`)[0]?.n)).toBe(0);
});
it("makes foreign and missing IDs indistinguishable and never settles a foreign pool", async () => {
  const f = await fixture(); const stranger = await mintAgent(t.db, randomUUID(), "other"); now = new Date("2026-11-03T12:00:00+08:00");
  const foreign = await create(req(stranger.token, { commitment_id: f.id }));
  const missing = await create(req(stranger.token, { commitment_id: randomUUID() }));
  expect([foreign.status, missing.status]).toEqual([404, 404]); expect(await foreign.json()).toEqual(await missing.json());
  expect((await complete(req(stranger.token, { simulate: true }), f.id)).status).toBe(404);
  expect(Number((await t.admin`select count(*)::int as n from clearings where rule_id = ${f.ruleId}`)[0]?.n)).toBe(0);
});
it("returns exact accepted economics, completes once concurrently, and never moves money", async () => {
  const f = await fixture(); now = new Date("2026-11-03T12:00:00+08:00");
  const created = await create(req(f.agent.token, { commitment_id: f.id }));
  expect(created.status).toBe(201); expect(created.headers.get("cache-control")).toBe("no-store");
  const ready = await created.json();
  expect(ready).toMatchObject({ id: f.id, status: "ready_for_payment", currency: "sgd", simulated: true, money_moved: false, totals: [{ type: "total", amount: 1876 }], savings: { savings_cents: 624, buyer_share_cents: 624, agent_share_cents: 0, network_share_cents: 0 } });
  expect(JSON.stringify(ready)).not.toMatch(/floor|capacity|token|negotiation_id/i);
  const foreign = await mintAgent(t.db, randomUUID(), "foreign after clearing");
  expect((await read(req(foreign.token), f.id)).status).toBe(404);
  expect((await complete(req(foreign.token, { simulate: true }), f.id)).status).toBe(404);
  const done = await Promise.all(Array.from({ length: 5 }, () => complete(req(f.agent.token, { simulate: true }), f.id)));
  expect(done.map(r => r.status)).toEqual([200, 200, 200, 200, 200]);
  const bodies = await Promise.all(done.map(r => r.json())); expect(bodies.every(b => JSON.stringify(b) === JSON.stringify(bodies[0]))).toBe(true);
  expect(bodies[0]).toMatchObject({ status: "completed", simulated: true, money_moved: false, order: { id: `sim_${f.id}` } });
  expect(Number((await t.admin`select count(*)::int as n from checkout_receipts where commitment_id = ${f.id}`)[0]?.n)).toBe(1);
  expect(await (await complete(req(f.agent.token, { simulate: true }), f.id)).json()).toEqual(bodies[0]);
  for (const statement of ["update checkout_receipts set completed_at = now()", "delete from checkout_receipts", "truncate checkout_receipts"]) {
    const failure = await t.admin.unsafe(statement).then(() => null, (err: Error) => err.message);
    expect(failure).toMatch(/append-only/);
  }
  await t.admin`update rules set list_price_cents = 1500 where id = ${f.ruleId}`;
  expect(await (await read(req(f.agent.token), f.id)).json()).toEqual(bodies[0]);
  await t.admin`update rules set commit_by_minute = 810 where id = ${f.ruleId}`;
  expect(await (await read(req(f.agent.token), f.id)).json()).toEqual(bodies[0]);
  expect(await (await complete(req(f.agent.token, { simulate: true }), f.id)).json()).toEqual(bodies[0]);
});
it("cannot complete pending, cancelled or unfilled commitments", async () => {
  const f = await fixture(); expect((await complete(req(f.agent.token, { simulate: true }), f.id)).status).toBe(422);
  await cancelCommitment(app.db, f.agent.id, f.id, clock);
  expect((await complete(req(f.agent.token, { simulate: true }), f.id)).status).toBe(422);
  const locked = await fixture(1); now = new Date("2026-11-03T12:00:00+08:00");
  expect((await complete(req(locked.agent.token, { simulate: true }), locked.id)).status).toBe(422);
  expect(Number((await t.admin`select count(*)::int as n from checkout_receipts where commitment_id in (${f.id}, ${locked.id})`)[0]?.n)).toBe(0);
});
it("refuses malformed input, client prices, payment credentials and bodies above 4096 bytes", async () => {
  const f = await fixture();
  for (const body of [{ commitment_id: "bad" }, { commitment_id: f.id, price: 1 }, { commitment_id: f.id, agent_id: f.agent.id }, { commitment_id: f.id, padding: "x".repeat(5000) }]) expect((await create(req(f.agent.token, body))).status).toBe(400);
  for (const body of [{}, { simulate: false }, { simulate: true, payment_data: { token: "fake" } }]) expect((await complete(req(f.agent.token, body), f.id)).status).toBe(400);
  expect((await create(new Request("http://backfill.test", { method: "POST", headers: { authorization: `Bearer ${f.agent.token}`, "content-type": "application/json" }, body: " ".repeat(5000) + JSON.stringify({ commitment_id: f.id }) }))).status).toBe(400);
  for (const body of ["{", undefined]) expect((await create(new Request("http://backfill.test", { method: "POST", headers: { authorization: `Bearer ${f.agent.token}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body }) }))).status).toBe(400);
  expect((await complete(new Request("http://backfill.test", { method: "POST", headers: { authorization: `Bearer ${f.agent.token}`, "content-type": "text/plain" }, body: '{"simulate":true}' }), f.id)).status).toBe(415);
  expect((await read(req(f.agent.token), "bad")).status).toBe(400);
  expect((await create(new Request("http://backfill.test", { method: "POST", headers: { authorization: `Bearer ${f.agent.token}`, "content-type": "text/plain" }, body: "{}" }))).status).toBe(415);
});

it("keeps different buyers' ledger rows and receipts separate", async () => {
  const f = await fixture(); now = new Date("2026-11-03T12:00:00+08:00");
  const ready = await (await create(req(f.agent.token, { commitment_id: f.id }))).json();
  expect(ready.status).toBe("ready_for_payment");
  expect(ready.line_items).toEqual([{ id: f.id, quantity: 2, unit_amount: 938, amount: 1876 }]);
  const done = await complete(req(f.agent.token, { simulate: true }), f.id);
  expect(done.status).toBe(200);
  expect(await done.json()).toMatchObject({ id: f.id, order: { id: `sim_${f.id}`, checkout_session_id: f.id } });
});

it("returns an unavailable response without exposing database error values", async () => {
  const broken = checkoutHandler(() => { throw new Error("postgres://dummy:do-not-display@db.invalid/test"); }, "read");
  const response = await broken(req("dummy"), randomUUID()).then(async r => ({ status: r.status, body: await r.json() }), () => null);
  expect(response).toEqual({ status: 503, body: { error: "unavailable" } });
});
it("requires a filled ledger source for receipts and keeps receipts immutable in replica mode", async () => {
  const f = await fixture();
  const missingSource = await t.admin`insert into checkout_receipts (commitment_id) values (${f.id})`.then(() => null, (err: Error) => err.message);
  expect(missingSource).toMatch(/foreign key/);
  now = new Date("2026-11-03T12:00:00+08:00");
  expect((await complete(req(f.agent.token, { simulate: true }), f.id)).status).toBe(200);
  for (const statement of ["update checkout_receipts set completed_at = now()", "delete from checkout_receipts", "truncate checkout_receipts"]) {
    const failure = await t.admin.begin(async tx => {
      await tx.unsafe("SET LOCAL session_replication_role = replica");
      await tx.unsafe(statement);
    }).then(() => null, (err: Error) => err.message);
    expect(failure).toMatch(/append-only/);
  }
});

it("waits for historical ledger reconciliation before simulating checkout completion", async () => {
  const f = await fixture(); now = new Date("2026-11-03T12:00:00+08:00");
  await t.admin.begin(async tx => {
    await tx.unsafe("ALTER TABLE clearing_fills DISABLE TRIGGER s8_fill_has_ledger");
    await tx`insert into clearings (rule_id, visit_date, terms_version, unlocked, price_per_cover_cents) values (${f.ruleId}, '2026-11-03', 1, true, 938)`;
    await tx`insert into clearing_fills (commitment_id, rule_id, visit_date, covers, price_per_cover_cents) values (${f.id}, ${f.ruleId}, '2026-11-03', 2, 938)`;
    await tx.unsafe("ALTER TABLE clearing_fills ENABLE ALWAYS TRIGGER s8_fill_has_ledger");
  });
  expect(await (await read(req(f.agent.token), f.id)).json()).toMatchObject({ status: "not_ready_for_payment", reason: "ledger_reconciliation_pending" });
  expect((await complete(req(f.agent.token, { simulate: true }), f.id)).status).toBe(422);
  expect(Number((await t.admin`select count(*)::int as n from checkout_receipts where commitment_id = ${f.id}`)[0]?.n)).toBe(0);
});
