import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mintAgent } from "@/lib/agents/tokens";
import { getCommitmentStatus, submitCommitment, type SubmitInput } from "@/lib/commitments/service";
import { connectDb, type Db } from "@/lib/db/client";
import { prepareScene } from "../../sim/buyers/scene";
import { createTestDatabase, type TestDatabase } from "../support/db";

let t: TestDatabase;
let app: { db: Db; close: () => Promise<void> };
let monitor: postgres.Sql;
let login: string;
const now = new Date("2026-11-03T09:00:00+08:00");
const gateKey = 7_004_019;
const pendingMessage = "earlier scene has pending commitments; wait for its deadline before starting another";

beforeEach(async () => {
  t = await createTestDatabase("s7_retirement_race");
  login = `backfill_t_retire_${randomBytes(4).toString("hex")}`;
  await t.admin.unsafe(`CREATE ROLE ${login} LOGIN IN ROLE backfill_app`);
  const url = new URL(t.url);
  url.username = login;
  app = connectDb(url.toString(), 4);
  monitor = postgres(t.url, { max: 1, onnotice: () => {} });
  await mintAgent(t.db, "race-one", "Party one");
  await mintAgent(t.db, "race-two", "Party two");
});

afterEach(async () => {
  await app?.close();
  await monitor?.end({ timeout: 5 });
  await t?.drop();
  const root = postgres(process.env.TEST_DATABASE_URL ?? "", { max: 1, onnotice: () => {} });
  try { await root.unsafe(`DROP ROLE IF EXISTS ${login}`); }
  finally { await root.end({ timeout: 5 }); }
});

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function holdGate() {
  const entered = deferred();
  const release = deferred();
  const done = t.admin.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${gateKey})`;
    entered.resolve();
    await release.promise;
  });
  await entered.promise;
  return { release: release.resolve, done };
}

// These gates delay real database writes. They leave all service reads and row locks intact.
async function installGate(table: "commitments" | "rules", operation: "INSERT" | "UPDATE") {
  await t.admin.unsafe(`
    CREATE FUNCTION s7_pause_write() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      PERFORM pg_advisory_xact_lock(${gateKey});
      RETURN NEW;
    END $$;
    CREATE TRIGGER a_s7_pause BEFORE ${operation} ON ${table}
      FOR EACH ROW EXECUTE FUNCTION s7_pause_write();
  `);
}

async function observeLockOrCompletion(completed: () => boolean, connection: "any" | "runtime" | "retirement" = "any"): Promise<"blocked" | "completed"> {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (completed()) return "completed";
    const [row] = await monitor`
      select exists (
        select 1 from pg_stat_activity
        where datname = current_database() and wait_event_type = 'Lock'
          and cardinality(pg_blocking_pids(pid)) > 0
          and (${connection} <> 'runtime' or usename = ${login})
          and (${connection} <> 'retirement' or (usename <> ${login} and query ilike '%rules%'))
      ) as blocked`;
    if (row?.blocked) return "blocked";
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("race fixture did not reach a database lock or complete");
}

const input = (ruleId: string, key: string): SubmitInput => ({
  ruleId, termsVersion: 1, visitDate: "2026-11-10", covers: 4,
  maxPricePerCoverCents: 544, idempotencyKey: key,
});
const retirementOutcome = (promise: ReturnType<typeof prepareScene>) => promise.then(
  () => "retired",
  (error: unknown) => error instanceof Error ? error.message : "unknown failure",
);

describe("S7 submission and scene retirement serialize at rule availability", () => {
  it("refuses retirement when a submission has read the old offer before inserting", async () => {
    const { ruleId } = await prepareScene(t.db, now, 5);
    await installGate("commitments", "INSERT");
    const gate = await holdGate();
    const first = submitCommitment(app.db, "race-one", input(ruleId, "submit-first"), () => now);
    let preparing: Promise<string> | undefined;
    let finished = false;
    try {
      expect(await observeLockOrCompletion(() => false, "runtime")).toBe("blocked");
      preparing = retirementOutcome(prepareScene(t.db, now, 5)).then((result) => { finished = true; return result; });
      // Ignore the gated insert itself and observe the retirement's owner connection.
      await observeLockOrCompletion(() => finished, "retirement");
    } finally {
      gate.release();
      await gate.done;
      await Promise.allSettled([first, ...(preparing ? [preparing] : [])]);
    }
    expect(await preparing).toBe(pendingMessage);
    const accepted = await first;
    const second = await submitCommitment(app.db, "race-two", input(ruleId, "second-party"), () => now);
    expect(accepted).toMatchObject({ ok: true, replayed: false });
    expect(second).toMatchObject({ ok: true, replayed: false });
    const [rule] = await t.admin`select floor_price_cents from rules where id = ${ruleId}`;
    expect(rule?.floor_price_cents).toBe(500);
    for (const [agentId, result] of [["race-one", accepted], ["race-two", second]] as const) {
      if (!result.ok) throw new Error("expected accepted commitment");
      expect(await getCommitmentStatus(app.db, agentId, result.commitment.commitmentId,
        () => new Date("2026-11-10T09:05:00+08:00"))).toMatchObject({ ok: true, commitment: { status: "filled", pricePerCoverCents: 544 } });
    }
    await prepareScene(t.db, new Date("2026-11-10T09:05:00+08:00"), 5);
    expect(await submitCommitment(app.db, "race-one", input(ruleId, "submit-first"), () => now))
      .toMatchObject({ ok: true, replayed: true, commitment: { ruleId, covers: 4 } });
  });

  it("refuses a submission that reads while retirement holds the old rule", async () => {
    const { ruleId } = await prepareScene(t.db, now, 5);
    await installGate("rules", "UPDATE");
    const gate = await holdGate();
    const preparing = retirementOutcome(prepareScene(t.db, now, 5));
    let submitting: ReturnType<typeof submitCommitment> | undefined;
    try {
      expect(await observeLockOrCompletion(() => false)).toBe("blocked");
      submitting = submitCommitment(app.db, "race-one", input(ruleId, "retirement-first"), () => now);
      expect(await observeLockOrCompletion(() => false, "runtime")).toBe("blocked");
    } finally {
      gate.release();
      await gate.done;
      await Promise.allSettled([preparing, ...(submitting ? [submitting] : [])]);
    }
    expect(await preparing).toBe("retired");
    expect(await submitting).toEqual({ ok: false, reason: "offer_unavailable" });
    const [row] = await t.admin`select count(*)::int as n from commitments where rule_id = ${ruleId}`;
    expect(row?.n).toBe(0);
  });
});
