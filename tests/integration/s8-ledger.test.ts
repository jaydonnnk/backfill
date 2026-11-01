import { randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { backfillLedger } from "@/lib/ledger/backfill";
import { merchantLedger } from "@/lib/ledger/service";
import { mintAgent } from "@/lib/agents/tokens";
import { constraintOf, getCommitmentStatus, submitCommitment } from "@/lib/commitments/service";
import { connectDb, type Db } from "@/lib/db/client";
import { createTestDatabase, type TestDatabase } from "../support/db";

let t: TestDatabase;
let app: { db: Db; close: () => Promise<void> };
const login = `backfill_t_s8_${randomBytes(4).toString("hex")}`;
const before = () => new Date("2026-11-03T10:00:00+08:00");
const after = () => new Date("2026-11-03T12:00:00+08:00");
const attempt = async <T>(promise: Promise<T>) => promise.then(value => ({ value, error: null }), err => ({ value: null, error: constraintOf(err) ?? "error" }));

beforeAll(async () => {
  t = await createTestDatabase("s8_ledger");
  await t.admin.unsafe(`CREATE ROLE ${login} LOGIN IN ROLE backfill_app`);
  const url = new URL(t.url); url.username = login;
  app = connectDb(url.toString(), 10);
});
afterAll(async () => {
  await app?.close(); await t?.drop();
  const root = postgres(process.env.TEST_DATABASE_URL ?? "", { max: 1, onnotice: () => {} });
  try { await root.unsafe(`DROP ROLE IF EXISTS ${login}`); } finally { await root.end(); }
});

async function seed(covers = 2, capacity = 2, minimum = 2) {
  const [m] = await t.admin`insert into merchants (name) values ('S8 fixture') returning id`;
  const [r] = await t.admin`insert into rules ${t.admin({ merchant_id: m!.id, list_price_cents: 1250, capacity_covers: capacity, weekday: 2, start_minute: 840, end_minute: 1020, commit_by_minute: 720, discount_bps: 2500, min_pool_covers: minimum, per_agent_cap_covers: 4, floor_price_cents: 900 })} returning id`;
  const agent = await mintAgent(t.db, randomUUID(), "S8 fixture agent");
  const made = await submitCommitment(app.db, agent.id, { ruleId: String(r!.id), termsVersion: 1, visitDate: "2026-11-03", covers, maxPricePerCoverCents: 938, idempotencyKey: randomUUID() }, before);
  expect(made.ok).toBe(true);
  if (!made.ok) throw new Error("fixture submit refused");
  return { ruleId: String(r!.id), merchantId: String(m!.id), commitmentId: made.commitment.commitmentId, agent };
}

it("writes one ledger entry with zero fees per filled commitment through the runtime role, including concurrent retries", async () => {
  const f = await seed();
  const responses = await Promise.all(Array.from({ length: 6 }, () => attempt(getCommitmentStatus(app.db, f.agent.id, f.commitmentId, after))));
  expect(responses.map(r => r.error)).toEqual(Array(6).fill(null));
  const rows = await t.admin`select covers, list_price_cents, price_per_cover_cents, savings_cents, buyer_share_cents, agent_share_cents, network_share_cents from ledger where commitment_id = ${f.commitmentId}`;
  expect([...rows]).toEqual([{ covers: 2, list_price_cents: 1250, price_per_cover_cents: 938, savings_cents: 624, buyer_share_cents: 624, agent_share_cents: 0, network_share_cents: 0 }]);
  await t.admin`update rules set list_price_cents = 1500 where id = ${f.ruleId}`;
  expect((await attempt(getCommitmentStatus(app.db, f.agent.id, f.commitmentId, after))).error).toBeNull();
  expect(Number((await t.admin`select list_price_cents from ledger where commitment_id = ${f.commitmentId}`)[0]?.list_price_cents)).toBe(1250);
});
it("rolls back the clearing and every fill if ledger insertion fails", async () => {
  const f = await seed();
  await t.admin.unsafe(`CREATE FUNCTION s8_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$; CREATE TRIGGER s8_fault BEFORE INSERT ON ledger FOR EACH ROW EXECUTE FUNCTION s8_fault()`);
  try {
    expect((await attempt(getCommitmentStatus(app.db, f.agent.id, f.commitmentId, after))).error).not.toBeNull();
    const [counts] = await t.admin`select (select count(*)::int from clearings where rule_id = ${f.ruleId}) as clearings, (select count(*)::int from clearing_fills where rule_id = ${f.ruleId}) as fills, (select count(*)::int from ledger where rule_id = ${f.ruleId}) as ledger`;
    expect(counts).toEqual({ clearings: 0, fills: 0, ledger: 0 });
  } finally { await t.admin.unsafe("DROP TRIGGER s8_fault ON ledger; DROP FUNCTION s8_fault()"); }
});
it("does not write entries for locked pools", async () => {
  const f = await seed(1, 2, 2);
  const result = await attempt(getCommitmentStatus(app.db, f.agent.id, f.commitmentId, after));
  expect(result.error).toBeNull();
  expect(result.value).toMatchObject({ ok: true, commitment: { status: "not_filled" } });
  expect(Number((await t.admin`select count(*)::int as n from ledger where rule_id = ${f.ruleId}`)[0]?.n)).toBe(0);
});

async function rawSettlement(f: Awaited<ReturnType<typeof seed>>, changes: { entry?: Record<string, string | number>; fill?: Record<string, string | number>; clearing?: Record<string, string | number | boolean>; omit?: boolean; replica?: boolean } = {}) {
  return attempt(t.admin.begin(async tx => {
    if (changes.replica) await tx.unsafe("SET LOCAL session_replication_role = replica");
    await tx`insert into clearings ${tx({ rule_id: f.ruleId, visit_date: "2026-11-03", terms_version: 1, unlocked: true, price_per_cover_cents: 938, ...changes.clearing })}`;
    await tx`insert into clearing_fills ${tx({ commitment_id: f.commitmentId, rule_id: f.ruleId, visit_date: "2026-11-03", covers: 2, price_per_cover_cents: 938, ...changes.fill })}`;
    if (!changes.omit) await tx`insert into ledger ${tx({ commitment_id: f.commitmentId, merchant_id: f.merchantId, rule_id: f.ruleId, covers: 2, list_price_cents: 1250, price_per_cover_cents: 938, savings_cents: 624, buyer_share_cents: 624, agent_share_cents: 0, network_share_cents: 0, ...changes.entry })}`;
  }));
}
it("refuses a fill without a ledger entry, including replica mode", async () => {
  for (const replica of [false, true]) {
    const f = await seed(); expect((await rawSettlement(f, { omit: true, replica })).error).toBe("fill_ledger_required");
    expect(Number((await t.admin`select count(*)::int as n from clearings where rule_id = ${f.ruleId}`)[0]?.n)).toBe(0);
  }
});
it("binds ledger rule, merchant, covers, fill price and original list price", async () => {
  const other = await seed();
  const cases: Record<string, string | number>[] = [{ merchant_id: other.merchantId }, { rule_id: other.ruleId }, { covers: 1, savings_cents: 312, buyer_share_cents: 312 }, { price_per_cover_cents: 939, savings_cents: 622, buyer_share_cents: 622 }, { list_price_cents: 1251, savings_cents: 626, buyer_share_cents: 626 }];
  for (const entry of cases) expect((await rawSettlement(await seed(), { entry })).error).toBe("ledger_source_match");
});
it("keeps all existing commitments fee-free even for direct database writes", async () => {
  const cases: Record<string, string | number>[] = [{ agent_share_cents: 1, buyer_share_cents: 623 }, { network_share_cents: 1, buyer_share_cents: 623 }];
  for (const entry of cases) expect((await rawSettlement(await seed(), { entry })).error).toBe("ledger_s8_no_fees");
});
it("refuses a cancelled fill, locked clearing, excess covers and price above the buyer maximum", async () => {
  const f = await seed(); await t.admin`update commitments set cancelled_at = now() where id = ${f.commitmentId}`;
  expect((await rawSettlement(f)).error).toBe("ledger_source_match");
  expect((await rawSettlement(await seed(), { fill: { price_per_cover_cents: 930 }, entry: { price_per_cover_cents: 930, savings_cents: 640, buyer_share_cents: 640 } })).error).toBe("ledger_source_match");
  expect((await rawSettlement(await seed(), { clearing: { unlocked: false } })).error).toBe("ledger_source_match");
  expect((await rawSettlement(await seed(), { fill: { covers: 3 }, entry: { covers: 3, savings_cents: 936, buyer_share_cents: 936 } })).error).toBe("ledger_source_match");
  expect((await rawSettlement(await seed(), { clearing: { price_per_cover_cents: 950 }, fill: { price_per_cover_cents: 950 }, entry: { price_per_cover_cents: 950, savings_cents: 600, buyer_share_cents: 600 } })).error).toBe("ledger_source_match");
});
it("refuses wrong source rule/date and stale current or accepted terms", async () => {
  const other = await seed(); const f = await seed();
  expect((await rawSettlement(f, { clearing: { rule_id: other.ruleId }, fill: { rule_id: other.ruleId }, entry: { rule_id: other.ruleId, merchant_id: other.merchantId } })).error).toBe("ledger_source_match");
  expect((await rawSettlement(await seed(), { clearing: { visit_date: "2026-11-10" }, fill: { visit_date: "2026-11-10" } })).error).toBe("ledger_source_match");
  const stale = await seed(); await t.admin`update rules set discount_bps = 2000 where id = ${stale.ruleId}`;
  expect((await rawSettlement(stale)).error).toBe("ledger_source_match");
  expect((await rawSettlement(stale, { clearing: { terms_version: 2 } })).error).toBe("ledger_source_match");
});
it("stores each negotiated fill's own price rather than the clearing headline", async () => {
  const f = await seed(); const agent = await mintAgent(t.db, randomUUID(), "negotiating buyer");
  const [n] = await t.admin`insert into negotiations ${t.admin({ agent_id: agent.id, rule_id: f.ruleId, terms_version: 1, visit_date: "2026-11-03", covers: 2 })} returning id`;
  await t.admin`insert into negotiation_rounds ${t.admin({ negotiation_id: n!.id, round: 1, bid_cents: 850, status: "held", counter_cents: 930 })}`;
  const [c] = await t.admin`insert into commitments ${t.admin({ rule_id: f.ruleId, agent_id: agent.id, idempotency_key: randomUUID(), terms_version: 1, covers: 2, max_price_per_cover_cents: 930, negotiated_price_cents: 930, negotiation_id: n!.id, committed_at: "2026-11-03T09:00:00+08:00", visit_at: "2026-11-03T14:00:00+08:00" })} returning id`;
  const id = String(c!.id);
  expect((await attempt(getCommitmentStatus(app.db, agent.id, id, after))).error).toBeNull();
  expect([...(await t.admin`select price_per_cover_cents, savings_cents, buyer_share_cents from ledger where commitment_id = ${id}`)]).toEqual([{ price_per_cover_cents: 930, savings_cents: 640, buyer_share_cents: 640 }]);
  expect(Number((await t.admin`select count(*)::int as n from ledger where commitment_id = ${f.commitmentId}`)[0]?.n)).toBe(0);
});

it("reports exact merchant totals and detects historical missing entries without writing", async () => {
  const f = await seed();
  expect((await attempt(getCommitmentStatus(app.db, f.agent.id, f.commitmentId, after))).error).toBeNull();
  const report = await merchantLedger(app.db, f.merchantId);
  expect(report).toEqual({ totals: { merchantId: f.merchantId, entries: 1, covers: 2, listValueCents: 2500, chargedCents: 1876, savingsCents: 624, buyerShareCents: 624, agentShareCents: 0, networkShareCents: 0 }, missing: [], mismatched: [], orphaned: [], reconciled: true });
  const other = await seed();
  expect((await merchantLedger(app.db, other.merchantId)).totals).toMatchObject({ entries: 0, savingsCents: 0 });
  // Simulates a pre-0013 fill. Restore the forward guard before exercising the read-only report.
  await t.admin.begin(async tx => {
    await tx.unsafe("ALTER TABLE clearing_fills DISABLE TRIGGER s8_fill_has_ledger");
    await tx`insert into clearings (rule_id, visit_date, terms_version, unlocked, price_per_cover_cents) values (${other.ruleId}, '2026-11-03', 1, true, 938)`;
    await tx`insert into clearing_fills (commitment_id, rule_id, visit_date, covers, price_per_cover_cents) values (${other.commitmentId}, ${other.ruleId}, '2026-11-03', 2, 938)`;
    await tx.unsafe("ALTER TABLE clearing_fills ENABLE ALWAYS TRIGGER s8_fill_has_ledger");
  });
  expect(await merchantLedger(app.db, other.merchantId)).toMatchObject({ missing: [other.commitmentId], reconciled: false });
  expect(Number((await t.admin`select count(*)::int as n from ledger where commitment_id = ${other.commitmentId}`)[0]?.n)).toBe(0);
});

it("keeps the runtime's ledger and receipt privileges to SELECT and INSERT", async () => {
  const rows = await app.db.execute<{ t: string; p: string }>(sql`select table_name as t, string_agg(privilege_type, ',' order by privilege_type) as p from information_schema.role_table_grants where grantee = 'backfill_app' and table_name in ('ledger', 'checkout_receipts') group by table_name order by table_name`);
  expect([...rows]).toEqual([{ t: "checkout_receipts", p: "INSERT,SELECT" }, { t: "ledger", p: "INSERT,SELECT" }]);
});

async function legacyFill() {
  const f = await seed();
  await t.admin.begin(async tx => {
    await tx.unsafe("ALTER TABLE clearing_fills DISABLE TRIGGER s8_fill_has_ledger");
    await tx`insert into clearings (rule_id, visit_date, terms_version, unlocked, price_per_cover_cents) values (${f.ruleId}, '2026-11-03', 1, true, 938)`;
    await tx`insert into clearing_fills (commitment_id, rule_id, visit_date, covers, price_per_cover_cents) values (${f.commitmentId}, ${f.ruleId}, '2026-11-03', 2, 938)`;
    await tx.unsafe("ALTER TABLE clearing_fills ENABLE ALWAYS TRIGGER s8_fill_has_ledger");
  });
  return { f, source: { ruleId: f.ruleId, merchantId: f.merchantId, merchantName: "S8 fixture", visitDate: "2026-11-03", termsVersion: 1, listPriceCents: 1250, pricePerCoverCents: 938, expectedFills: 1, expectedCovers: 2, allowedAgentIds: [f.agent.id] } };
}
it("backfills only pinned historical sources once, preserving other merchants and accepted prices", async () => {
  const { f, source } = await legacyFill(); const protectedPool = await seed();
  expect(await backfillLedger(t.db, [source])).toEqual({ inserted: 1, existing: 0 });
  expect(await backfillLedger(t.db, [source])).toEqual({ inserted: 0, existing: 1 });
  expect(await merchantLedger(app.db, f.merchantId)).toMatchObject({ reconciled: true, missing: [], totals: { chargedCents: 1876, buyerShareCents: 624, agentShareCents: 0, networkShareCents: 0 } });
  expect(Number((await t.admin`select count(*)::int as n from ledger where rule_id = ${protectedPool.ruleId}`)[0]?.n)).toBe(0);
  expect(Number((await t.admin`select count(*)::int as n from clearings where rule_id = ${protectedPool.ruleId}`)[0]?.n)).toBe(0);
});
it("refuses historical drift and rolls back earlier entries in the same bounded batch", async () => {
  const pair: [Awaited<ReturnType<typeof legacyFill>>, Awaited<ReturnType<typeof legacyFill>>] = [await legacyFill(), await legacyFill()];
  pair.sort((a, b) => a.source.ruleId.localeCompare(b.source.ruleId));
  const [first, second] = pair;
  for (const changes of [{ merchantId: first.f.merchantId }, { merchantName: "wrong" }, { listPriceCents: 1300 }, { pricePerCoverCents: 937 }, { termsVersion: 2 }, { expectedFills: 2 }, { expectedCovers: 3 }, { allowedAgentIds: [] }]) {
    const result = await attempt(backfillLedger(t.db, [first.source, { ...second.source, ...changes }]));
    expect(result.error).not.toBeNull();
    expect(Number((await t.admin`select count(*)::int as n from ledger where rule_id in (${first.f.ruleId}, ${second.f.ruleId})`)[0]?.n)).toBe(0);
  }
  await t.admin`update rules set discount_bps = 2000 where id = ${second.f.ruleId}`;
  expect((await attempt(backfillLedger(t.db, [first.source, second.source]))).error).not.toBeNull();
  expect(Number((await t.admin`select count(*)::int as n from ledger where rule_id = ${first.f.ruleId}`)[0]?.n)).toBe(0);
});

it("cannot give an unfilled commitment another commitment's ledger source", async () => {
  const f = await seed();
  const second = await submitCommitment(app.db, f.agent.id, { ruleId: f.ruleId, termsVersion: 1, visitDate: "2026-11-03", covers: 2, maxPricePerCoverCents: 938, idempotencyKey: randomUUID() }, () => new Date("2026-11-03T10:00:01+08:00"));
  expect(second.ok).toBe(true); if (!second.ok) throw new Error("fixture refused");
  expect((await attempt(getCommitmentStatus(app.db, f.agent.id, f.commitmentId, after))).error).toBeNull();
  const result = await attempt(t.admin`insert into ledger (commitment_id, merchant_id, rule_id, covers, list_price_cents, price_per_cover_cents, savings_cents, buyer_share_cents, agent_share_cents, network_share_cents) values (${second.commitment.commitmentId}, ${f.merchantId}, ${f.ruleId}, 2, 1250, 938, 624, 624, 0, 0)`);
  expect(result.error).toBe("ledger_source_match");
});
it("keeps source validation enabled in replica mode", async () => {
  expect((await rawSettlement(await seed(), { replica: true, entry: { list_price_cents: 1251, savings_cents: 626, buyer_share_cents: 626 } })).error).toBe("ledger_source_match");
});
it("rejects duplicate historical sources atomically", async () => {
  const { f, source } = await legacyFill();
  expect((await attempt(backfillLedger(t.db, [source, source]))).error).not.toBeNull();
  expect(Number((await t.admin`select count(*)::int as n from ledger where rule_id = ${f.ruleId}`)[0]?.n)).toBe(0);
});

it("reports legacy mismatches and orphan rows and refuses a conflicting backfill", async () => {
  const { f, source } = await legacyFill(); const orphan = await seed();
  // Represents invalid pre-S8 history. The production guard is restored before validation.
  await t.admin.begin(async tx => {
    await tx.unsafe("ALTER TABLE ledger DISABLE TRIGGER zz_s8_ledger_source");
    for (const row of [f, orphan]) await tx`insert into ledger (commitment_id, merchant_id, rule_id, covers, list_price_cents, price_per_cover_cents, savings_cents, buyer_share_cents, agent_share_cents, network_share_cents) values (${row.commitmentId}, ${row.merchantId}, ${row.ruleId}, 1, 1250, 938, 312, 312, 0, 0)`;
    await tx.unsafe("ALTER TABLE ledger ENABLE ALWAYS TRIGGER zz_s8_ledger_source");
  });
  expect(await merchantLedger(app.db, f.merchantId)).toMatchObject({ missing: [], mismatched: [f.commitmentId], orphaned: [], reconciled: false });
  expect(await merchantLedger(app.db, orphan.merchantId)).toMatchObject({ missing: [], mismatched: [], orphaned: [orphan.commitmentId], reconciled: false });
  expect((await attempt(backfillLedger(t.db, [source]))).error).not.toBeNull();
  expect(Number((await t.admin`select covers from ledger where commitment_id = ${f.commitmentId}`)[0]?.covers)).toBe(1);
});
