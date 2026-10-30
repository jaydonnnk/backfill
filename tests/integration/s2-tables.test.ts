import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../support/db";

let t: TestDatabase;
// Roles are cluster-wide, so each run makes its own and drops them afterwards.
const suffix = randomBytes(4).toString("hex");
const APP_ROLE = `backfill_t_app_${suffix}`;
const OWNER_ROLE = `backfill_t_owner_${suffix}`;

beforeAll(async () => {
  t = await createTestDatabase("s2_tables");
  await t.admin.unsafe(`CREATE ROLE ${APP_ROLE} NOLOGIN NOSUPERUSER`);
  await t.admin.unsafe(`CREATE ROLE ${OWNER_ROLE} NOLOGIN NOSUPERUSER`);
  // Since S4 every commitment belongs to a minted agent.
  for (const id of ["agent-a", "agent-b"]) await t.admin`insert into agents ${t.admin({ id, label: id, token_sha256: id === "agent-a" ? "a".repeat(64) : "b".repeat(64) })}`;
});

afterAll(async () => {
  await t?.drop();
  const root = postgres(process.env.TEST_DATABASE_URL ?? "", { max: 1, onnotice: () => {} });
  try {
    await root.unsafe(`DROP ROLE IF EXISTS ${APP_ROLE}`);
    await root.unsafe(`DROP ROLE IF EXISTS ${OWNER_ROLE}`);
  } finally {
    await root.end({ timeout: 5 });
  }
});

type Row = Record<string, string | number | null>;
type PgError = { message: string; constraint_name?: string };

const failure = (query: Promise<unknown>): Promise<PgError | null> => query.then(() => null, (err: PgError) => err);

async function insert(table: string, row: Row): Promise<Row> {
  const [created] = await t.admin`insert into ${t.admin(table)} ${t.admin(row)} returning *`;
  return created as Row;
}

const merchant = () => insert("merchants", { name: "Ah Seng Kopitiam" });

// "25% off Tue 2-5pm if 8 people commit by noon": S$12.50 list, floor S$9.00.
const ruleRow = (merchantId: string, overrides: Row = {}): Row => ({
  merchant_id: merchantId,
  list_price_cents: 1250,
  capacity_covers: 20,
  weekday: 2,
  start_minute: 840,
  end_minute: 1020,
  commit_by_minute: 720,
  discount_bps: 2500,
  min_pool_covers: 8,
  per_agent_cap_covers: 4,
  floor_price_cents: 900,
  ...overrides,
});

const commitmentRow = (ruleId: string, overrides: Row = {}): Row => ({
  rule_id: ruleId,
  agent_id: "agent-a",
  idempotency_key: randomBytes(6).toString("hex"),
  terms_version: 1,
  covers: 2,
  max_price_per_cover_cents: 1000,
  visit_at: "2026-11-03T15:00:00+08:00",
  ...overrides,
});

// 3 covers at 938 instead of 1250: 936 saved.
const ledgerRow = (ids: { commitment_id: string; merchant_id: string; rule_id: string }, overrides: Row = {}): Row => ({
  ...ids,
  covers: 3,
  list_price_cents: 1250,
  price_per_cover_cents: 938,
  savings_cents: 936,
  buyer_share_cents: 700,
  agent_share_cents: 136,
  network_share_cents: 100,
  ...overrides,
});

async function fixture() {
  const m = await merchant();
  const r = await insert("rules", ruleRow(String(m.id)));
  const c = await insert("commitments", commitmentRow(String(r.id)));
  return { merchantId: String(m.id), ruleId: String(r.id), commitmentId: String(c.id) };
}

describe("check constraints", () => {
  it("refuse each invalid value with the constraint that guards it", async () => {
    const { merchantId, ruleId } = await fixture();
    const cases: [string, Row, string][] = [
      ["rules", ruleRow(merchantId, { weekday: 0 }), "rules_weekday_iso"],
      ["rules", ruleRow(merchantId, { weekday: 8 }), "rules_weekday_iso"],
      ["rules", ruleRow(merchantId, { end_minute: 840 }), "rules_window_order"],
      ["rules", ruleRow(merchantId, { end_minute: 1441 }), "rules_window_order"],
      ["rules", ruleRow(merchantId, { commit_by_minute: 841 }), "rules_commit_by_before_start"],
      ["rules", ruleRow(merchantId, { commit_by_minute: -1 }), "rules_commit_by_before_start"],
      ["rules", ruleRow(merchantId, { discount_bps: 0 }), "rules_discount_range"],
      ["rules", ruleRow(merchantId, { discount_bps: 10000 }), "rules_discount_range"],
      ["rules", ruleRow(merchantId, { floor_price_cents: 1251 }), "rules_floor_within_list"],
      ["rules", ruleRow(merchantId, { floor_price_cents: -1 }), "rules_floor_within_list"],
      ["rules", ruleRow(merchantId, { capacity_covers: 0 }), "rules_counts_positive"],
      ["rules", ruleRow(merchantId, { min_pool_covers: 0 }), "rules_counts_positive"],
      ["rules", ruleRow(merchantId, { per_agent_cap_covers: 0 }), "rules_counts_positive"],
      ["rules", ruleRow(merchantId, { capacity_covers: 7 }), "rules_min_pool_within_capacity"],
      ["commitments", commitmentRow(ruleId, { covers: 0 }), "commitments_covers_positive"],
      ["commitments", commitmentRow(ruleId, { max_price_per_cover_cents: -1 }), "commitments_max_price_nonnegative"],
      ["commitments", commitmentRow(ruleId, { agent_id: "" }), "commitments_agent_id_present"],
      ["commitments", commitmentRow(ruleId, { agent_id: "a".repeat(201) }), "commitments_agent_id_present"],
    ];
    const ledgerIds = await fixture();
    const ids = { commitment_id: ledgerIds.commitmentId, merchant_id: ledgerIds.merchantId, rule_id: ledgerIds.ruleId };
    cases.push(
      ["ledger", ledgerRow(ids, { covers: 0, savings_cents: 0, buyer_share_cents: 0, agent_share_cents: 0, network_share_cents: 0 }), "ledger_covers_positive"],
      ["ledger", ledgerRow(ids, { price_per_cover_cents: -1, savings_cents: 3753, buyer_share_cents: 3517 }), "ledger_price_nonnegative"],
      ["ledger", ledgerRow(ids, { savings_cents: 935, buyer_share_cents: 699 }), "ledger_savings_match"],
      ["ledger", ledgerRow(ids, { buyer_share_cents: 701 }), "ledger_split_sums"],
      ["ledger", ledgerRow(ids, { buyer_share_cents: -1, agent_share_cents: 837 }), "ledger_split_sums"],
      ["ledger", ledgerRow(ids, { agent_share_cents: -1, buyer_share_cents: 837 }), "ledger_split_sums"],
      ["ledger", ledgerRow(ids, { network_share_cents: -1, buyer_share_cents: 801 }), "ledger_split_sums"],
    );

    const seen = [];
    for (const [table, row, constraint] of cases) {
      const err = await failure(insert(table, row));
      seen.push({ table, row: JSON.stringify(row), constraint: err?.constraint_name ?? null, expected: constraint });
    }
    expect(seen.filter((s) => s.constraint !== s.expected)).toEqual([]);

    // The valid rows themselves insert.
    expect(await failure(insert("ledger", ledgerRow(ids)))).toBeNull();
    expect(await failure(insert("rules", ruleRow(merchantId, { floor_price_cents: 1250, commit_by_minute: 840, end_minute: 1440 })))).toBeNull();
    expect(await failure(insert("rules", ruleRow(merchantId, { capacity_covers: 8, min_pool_covers: 8 })))).toBeNull();
  });
});

describe("keys", () => {
  it("refuse unknown parents, deleting a referenced rule, and duplicates", async () => {
    const f = await fixture();
    const unknown = "00000000-0000-4000-8000-000000000000";
    const ids = { commitment_id: f.commitmentId, merchant_id: f.merchantId, rule_id: f.ruleId };
    const key = "retry-1";
    const spare = String((await insert("commitments", commitmentRow(f.ruleId, { idempotency_key: key }))).id);
    await insert("ledger", ledgerRow(ids));

    const results = {
      ruleMerchant: (await failure(insert("rules", ruleRow(unknown))))?.constraint_name,
      ledgerCommitment: (await failure(insert("ledger", ledgerRow({ ...ids, commitment_id: unknown }))))?.constraint_name,
      ledgerMerchant: (await failure(insert("ledger", ledgerRow({ ...ids, commitment_id: spare, merchant_id: unknown }))))?.constraint_name,
      ledgerRule: (await failure(insert("ledger", ledgerRow({ ...ids, commitment_id: spare, rule_id: unknown }))))?.constraint_name,
      deleteRule: (await failure(t.admin`delete from rules where id = ${f.ruleId}`))?.constraint_name,
      ledgerTwice: (await failure(insert("ledger", ledgerRow(ids))))?.constraint_name,
      sameKey: (await failure(insert("commitments", commitmentRow(f.ruleId, { idempotency_key: key }))))?.constraint_name,
    };
    expect(results).toEqual({
      ruleMerchant: "rules_merchant_id_merchants_id_fk",
      ledgerCommitment: "ledger_commitment_id_commitments_id_fk",
      ledgerMerchant: "ledger_merchant_id_merchants_id_fk",
      ledgerRule: "ledger_rule_id_rules_id_fk",
      deleteRule: "commitments_rule_id_rules_id_fk",
      ledgerTwice: "ledger_commitment_once",
      sameKey: "commitments_agent_idempotency_key",
    });
    // The same key from another agent is a different submission.
    expect(await failure(insert("commitments", commitmentRow(f.ruleId, { idempotency_key: key, agent_id: "agent-b" })))).toBeNull();
  });
});

describe("rules terms_version", () => {
  it("starts at 1 whatever the insert says", async () => {
    const m = await merchant();
    const r = await insert("rules", ruleRow(String(m.id), { terms_version: 7 }));
    expect(r.terms_version).toBe(1);
  });

  it("goes up by one on each change to a public term", async () => {
    const m = await merchant();
    const r = await insert("rules", ruleRow(String(m.id)));
    const changes: Row = {
      weekday: 3,
      start_minute: 780,
      end_minute: 1080,
      commit_by_minute: 660,
      list_price_cents: 1300,
      discount_bps: 2000,
      min_pool_covers: 6,
      per_agent_cap_covers: 3,
    };
    const versions = [];
    for (const [column, value] of Object.entries(changes)) {
      const [row] = await t.admin`update rules set ${t.admin({ [column]: value })} where id = ${String(r.id)} returning terms_version`;
      versions.push({ column, version: row?.terms_version });
    }
    expect(versions).toEqual(Object.keys(changes).map((column, i) => ({ column, version: i + 2 })));
  });

  it("stays put for the floor, capacity, a no-op update or a version set by hand", async () => {
    const m = await merchant();
    const r = await insert("rules", ruleRow(String(m.id)));
    const id = String(r.id);
    await t.admin`update rules set discount_bps = 3000 where id = ${id}`;
    const after = [];
    for (const change of [{ floor_price_cents: 800 }, { capacity_covers: 30 }, { discount_bps: 3000 }, { terms_version: 9 }, { terms_version: 1 }]) {
      const [row] = await t.admin`update rules set ${t.admin(change)} where id = ${id} returning terms_version`;
      after.push(row?.terms_version);
    }
    expect(after).toEqual([2, 2, 2, 2, 2]);
  });
});

describe("commitments terms check", () => {
  it("refuses a commitment against stale terms, on insert and on update", async () => {
    const { ruleId, commitmentId } = await fixture();
    await t.admin`update rules set discount_bps = 3000 where id = ${ruleId}`;

    const stale = await failure(insert("commitments", commitmentRow(ruleId, { terms_version: 1 })));
    expect(stale?.constraint_name).toBe("commitments_terms_current");
    expect(stale?.message).toBe("commitment accepts terms version 1, but the rule is at version 2");
    expect(await failure(insert("commitments", commitmentRow(ruleId, { terms_version: 3 })))).toMatchObject({ constraint_name: "commitments_terms_current" });
    expect(await failure(insert("commitments", commitmentRow(ruleId, { terms_version: 2 })))).toBeNull();

    // The commitment made under version 1 cannot be relabelled with an old version either.
    const relabel = await failure(t.admin`update commitments set terms_version = 1, covers = 3 where id = ${commitmentId}`);
    expect(relabel?.constraint_name).toBe("commitments_terms_current");
  });

  it("waits for a concurrent terms change instead of checking against the old version", async () => {
    const { ruleId } = await fixture();
    const changer = postgres(t.url, { max: 1, onnotice: () => {} });
    const committer = postgres(t.url, { max: 1, onnotice: () => {} });
    try {
      await changer`begin`;
      await changer`update rules set discount_bps = 3000 where id = ${ruleId}`;
      const pending = failure(committer`insert into commitments ${committer(commitmentRow(ruleId, { terms_version: 1 }))}`);

      let blocked = false;
      for (let i = 0; i < 100 && !blocked; i++) {
        const [row] = await t.admin`select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query like 'insert into commitments%'`;
        blocked = row?.n === 1;
        if (!blocked) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      await changer`commit`;
      const err = await pending;
      expect(blocked).toBe(true);
      expect(err?.constraint_name).toBe("commitments_terms_current");
    } finally {
      await changer.end({ timeout: 5 });
      await committer.end({ timeout: 5 });
    }
  });

  it("keeps bumping and checking versions in replica mode", async () => {
    const { ruleId } = await fixture();
    const conn = await t.admin.reserve();
    try {
      await conn.unsafe("SET session_replication_role = replica");
      const [bumped] = await conn`update rules set discount_bps = 3000 where id = ${ruleId} returning terms_version`;
      const err = await failure(conn`insert into commitments ${conn(commitmentRow(ruleId, { terms_version: 1 }))}`);
      expect({ version: bumped?.terms_version, refusedBy: err?.constraint_name }).toEqual({ version: 2, refusedBy: "commitments_terms_current" });
    } finally {
      await conn.unsafe("RESET session_replication_role");
      conn.release();
    }
  });

  it("lets a role with no rights on rules submit a commitment", async () => {
    const { ruleId } = await fixture();
    await t.admin.unsafe(`GRANT INSERT ON commitments TO ${APP_ROLE}`);
    const conn = await t.admin.reserve();
    try {
      await conn.unsafe(`SET ROLE ${APP_ROLE}`);
      const err = await failure(conn`insert into commitments ${conn(commitmentRow(ruleId))}`);
      expect(err).toBeNull();
    } finally {
      await conn.unsafe("RESET ROLE");
      conn.release();
    }
  });
});

describe("ledger", () => {
  async function ledgerEntry() {
    const f = await fixture();
    const row = await insert("ledger", ledgerRow({ commitment_id: f.commitmentId, merchant_id: f.merchantId, rule_id: f.ruleId }));
    return { ...f, ledgerId: Number(row.id) };
  }

  // Tries UPDATE, DELETE and TRUNCATE as the given role (null: the superuser) and returns each error
  // message, then confirms the row is untouched.
  async function attempts(role: string | null, setup: string[] = []) {
    const { ledgerId, merchantId } = await ledgerEntry();
    const conn = await t.admin.reserve();
    try {
      for (const statement of setup) await conn.unsafe(statement);
      if (role) await conn.unsafe(`SET ROLE ${role}`);
      const [who] = await conn`select current_user as name, current_setting('is_superuser') as superuser`;
      const messages = {
        update: (await failure(conn`update ledger set buyer_share_cents = 0, network_share_cents = 800 where id = ${ledgerId}`))?.message ?? null,
        delete: (await failure(conn`delete from ledger where id = ${ledgerId}`))?.message ?? null,
        truncate: (await failure(conn`truncate ledger`))?.message ?? null,
        truncateCascade: (await failure(conn`truncate merchants cascade`))?.message ?? null,
      };
      return { who, messages, merchantId, ledgerId };
    } finally {
      await conn.unsafe("RESET ROLE");
      await conn.unsafe("RESET session_replication_role");
      conn.release();
    }
  }

  const refused = {
    update: "ledger is append-only: UPDATE refused",
    delete: "ledger is append-only: DELETE refused",
    truncate: "ledger is append-only: TRUNCATE refused",
    truncateCascade: "ledger is append-only: TRUNCATE refused",
  };

  async function expectUntouched(ledgerId: number) {
    const [row] = await t.admin`select buyer_share_cents, network_share_cents from ledger where id = ${ledgerId}`;
    expect(row).toEqual({ buyer_share_cents: 700, network_share_cents: 100 });
  }

  it("refuses UPDATE, DELETE and TRUNCATE for a non-superuser role holding every privilege", async () => {
    await t.admin.unsafe(`GRANT ALL ON ledger, merchants, rules, commitments, agents, clearings, clearing_fills, negotiations, negotiation_rounds, menu_drafts, offer_publications, wonder_plans, plan_applications TO ${APP_ROLE}`);
    const result = await attempts(APP_ROLE);
    expect(result.who).toEqual({ name: APP_ROLE, superuser: "off" });
    expect(result.messages).toEqual(refused);
    await expectUntouched(result.ledgerId);
  });

  it("refuses them for the table owner", async () => {
    await t.admin.unsafe(`ALTER TABLE ledger OWNER TO ${OWNER_ROLE}`);
    await t.admin.unsafe(`GRANT ALL ON merchants, rules, commitments, agents, clearings, clearing_fills, negotiations, negotiation_rounds, menu_drafts, offer_publications, wonder_plans, plan_applications TO ${OWNER_ROLE}`);
    try {
      const result = await attempts(OWNER_ROLE);
      const [owner] = await t.admin`select tableowner from pg_tables where tablename = 'ledger'`;
      expect(owner?.tableowner).toBe(OWNER_ROLE);
      expect(result.who).toEqual({ name: OWNER_ROLE, superuser: "off" });
      expect(result.messages).toEqual(refused);
      await expectUntouched(result.ledgerId);
    } finally {
      await t.admin.unsafe("ALTER TABLE ledger OWNER TO CURRENT_USER");
    }
  });

  it("refuses them for the superuser, even in replica mode", async () => {
    const plain = await attempts(null);
    expect(plain.who).toMatchObject({ superuser: "on" });
    expect(plain.messages).toEqual(refused);
    await expectUntouched(plain.ledgerId);

    const replica = await attempts(null, ["SET session_replication_role = replica"]);
    expect(replica.messages).toEqual(refused);
    await expectUntouched(replica.ledgerId);
  });

  it("still takes new entries", async () => {
    await t.admin.unsafe(`GRANT INSERT ON ledger TO ${APP_ROLE}`);
    const f = await fixture();
    const conn = await t.admin.reserve();
    try {
      await conn.unsafe(`SET ROLE ${APP_ROLE}`);
      const err = await failure(conn`insert into ledger ${conn(ledgerRow({ commitment_id: f.commitmentId, merchant_id: f.merchantId, rule_id: f.ruleId }))}`);
      expect(err).toBeNull();
    } finally {
      await conn.unsafe("RESET ROLE");
      conn.release();
    }
    const [row] = await t.admin`select count(*)::int as n from ledger where commitment_id = ${f.commitmentId}`;
    expect(row?.n).toBe(1);
  });
});
