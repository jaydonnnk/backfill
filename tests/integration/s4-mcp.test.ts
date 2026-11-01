import { randomBytes, randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mintAgent } from "@/lib/agents/tokens";
import { connectDb, type Db } from "@/lib/db/client";
import { methodNotAllowed, mcpPostHandler } from "@/lib/mcp/http";
import { createTestDatabase, type TestDatabase } from "../support/db";

// The MCP server end to end: a real MCP client speaks streamable HTTP to the route's handler, which
// connects as a login role that is only a member of the runtime role backfill_app, never as the
// owner. The clock is the test's, so deadlines are exact.

let t: TestDatabase;
let app: { db: Db; close: () => Promise<void> };
const RUNTIME_LOGIN = `backfill_t_rt_${randomBytes(4).toString("hex")}`;
let now = new Date("2026-11-03T09:00:00+08:00");
const handler = mcpPostHandler(() => app.db, () => now);

beforeAll(async () => {
  t = await createTestDatabase("s4_mcp");
  await t.admin.unsafe(`CREATE ROLE ${RUNTIME_LOGIN} LOGIN IN ROLE backfill_app`);
  const url = new URL(t.url);
  url.username = RUNTIME_LOGIN;
  app = connectDb(url.toString(), 10);
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

beforeEach(() => {
  now = new Date("2026-11-03T09:00:00+08:00");
});

type Row = Record<string, string | number | null>;
const failure = (query: Promise<unknown>): Promise<{ message: string; constraint_name?: string } | null> =>
  query.then(
    () => null,
    (err: { message: string; constraint_name?: string }) => err,
  );

// "25% off Tue 2-5pm if 8 people commit by noon": S$12.50 becomes S$9.38, floor S$9.00, capacity 20.
async function seedRule(overrides: Row = {}): Promise<{ ruleId: string; merchantId: string }> {
  const [m] = await t.admin`insert into merchants ${t.admin({ name: `Ah Seng Kopitiam ${randomBytes(2).toString("hex")}` })} returning id`;
  const [r] = await t.admin`insert into rules ${t.admin({
    merchant_id: m!.id,
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
  })} returning id`;
  return { ruleId: String(r!.id), merchantId: String(m!.id) };
}

async function newAgent(): Promise<{ id: string; token: string }> {
  return mintAgent(t.db, `agent-${randomBytes(4).toString("hex")}`, "test agent");
}

const ENDPOINT = "http://backfill.test/mcp";

function route(req: Request): Promise<Response> {
  return req.method === "POST" ? handler(req) : Promise.resolve(methodNotAllowed());
}

async function connect(token: string): Promise<Client> {
  const client = new Client({ name: "s4-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT), {
    fetch: (url, init) => route(new Request(url, init)),
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return client;
}

type Reply = Record<string, unknown> & { ok: boolean; reason?: string; commitment?: Record<string, unknown> };

async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<{ reply: Reply; text: string; isError: boolean }> {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text: string }[])[0]?.text ?? "";
  // A reply without structured content (an error the SDK wrote) still fails on an assertion below.
  if (result.structuredContent === undefined) return { reply: { ok: false, reason: `unstructured: ${text}` }, text, isError: result.isError === true };
  expect(JSON.parse(text)).toEqual(result.structuredContent);
  return { reply: result.structuredContent as Reply, text, isError: result.isError === true };
}

// Submits a commitment that the test needs accepted, and fails on an assertion if it was refused.
async function submitOk(client: Client, args: Record<string, unknown>): Promise<string> {
  const { reply } = await call(client, "submit_commitment", args);
  expect(reply.reason).toBeUndefined();
  return String(reply.commitment?.commitmentId);
}

const submission = (ruleId: string, overrides: Record<string, unknown> = {}) => ({
  ruleId,
  termsVersion: 1,
  visitDate: "2026-11-03",
  covers: 2,
  maxPricePerCoverCents: 938,
  idempotencyKey: randomUUID(),
  ...overrides,
});

describe("auth", () => {
  const initialize = (headers: Record<string, string>) =>
    handler(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "x", version: "1" } } }),
      }),
    );

  it("refuses a missing, malformed, unknown or revoked token with 401 and a Bearer challenge", async () => {
    const agent = await newAgent();
    const revoked = await newAgent();
    await t.admin`update agents set revoked_at = now() where id = ${revoked.id}`;
    const cases = {
      missing: {},
      basic: { authorization: `Basic ${agent.token}` },
      malformed: { authorization: "Bearer bfa_short" },
      unknown: { authorization: `Bearer bfa_${"A".repeat(43)}` },
      revoked: { authorization: `Bearer ${revoked.token}` },
    };
    const statuses: Record<string, [number, string | null]> = {};
    for (const [name, headers] of Object.entries(cases)) {
      const res = await initialize(headers);
      statuses[name] = [res.status, res.headers.get("www-authenticate")];
    }
    const challenge: [number, string] = [401, 'Bearer realm="backfill"'];
    expect(statuses).toEqual({ missing: challenge, basic: challenge, malformed: challenge, unknown: challenge, revoked: challenge });
    // The scheme is case-insensitive.
    expect([(await initialize({ authorization: `Bearer ${agent.token}` })).status, (await initialize({ authorization: `bearer ${agent.token}` })).status]).toEqual([200, 200]);
  });

  it("answers GET and DELETE with 405, since the server is stateless", async () => {
    expect([methodNotAllowed().status, methodNotAllowed().headers.get("allow")]).toEqual([405, "POST"]);
  });
});

describe("tools", () => {
  it("lists the five tools, and the commitment tools say plainly that a commitment is binding", async () => {
    const client = await connect((await newAgent()).token);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(["cancel_commitment", "get_agent_terms", "get_commitment_status", "list_offers", "submit_commitment"]);
    const submit = tools.find((tool) => tool.name === "submit_commitment")!;
    expect(submit.description).toMatch(/A commitment is binding/);
    expect(submit.description).toMatch(/cannot be withdrawn/);
    expect(submit.description).toMatch(/get their agreement/);
    expect(tools.find((tool) => tool.name === "cancel_commitment")!.description).toMatch(/Only possible before the commit deadline/);
    expect(submit.annotations?.readOnlyHint).toBe(false);
  });
});

describe("offers", () => {
  it("lists an offer with its public terms and next occurrence, and leaves out one whose offer price is below its floor", async () => {
    const open = await seedRule();
    const hidden = await seedRule({ floor_price_cents: 939 });
    const client = await connect((await newAgent()).token);
    const { reply, text } = await call(client, "list_offers");
    const offers = reply.offers as { offer: { ruleId: string; offerPriceCents: number }; summary: string; nextOccurrence: Record<string, string> }[];
    const ids = offers.map((o) => o.offer.ruleId);
    expect(ids).toContain(open.ruleId);
    expect(ids).not.toContain(hidden.ruleId);
    const mine = offers.find((o) => o.offer.ruleId === open.ruleId)!;
    expect(mine.offer.offerPriceCents).toBe(938);
    expect(mine.summary).toMatch(/25% off, S\$12\.50 becomes S\$9\.38 per cover, Tuesday 14:00-17:00 Singapore time/);
    expect(mine.nextOccurrence).toEqual({
      visitDate: "2026-11-03",
      commitBy: "2026-11-03T04:00:00.000Z",
      startsAt: "2026-11-03T06:00:00.000Z",
      endsAt: "2026-11-03T09:00:00.000Z",
    });
    expect(text).not.toMatch(/floor|capacity/i);
    expect(reply.binding).toMatch(/A commitment is binding/);
  });

  it("answers an offer below its floor exactly like an offer that does not exist", async () => {
    const hidden = await seedRule({ floor_price_cents: 939 });
    const open = await seedRule({ floor_price_cents: 938 });
    const client = await connect((await newAgent()).token);
    const belowFloor = await call(client, "get_agent_terms", { ruleId: hidden.ruleId });
    const missing = await call(client, "get_agent_terms", { ruleId: randomUUID() });
    expect(belowFloor.reply).toEqual(missing.reply);
    expect(belowFloor.reply.reason).toBe("offer_unavailable");
    const terms = await call(client, "get_agent_terms", { ruleId: open.ruleId });
    expect(terms.reply.ok).toBe(true);
    expect(terms.text).not.toMatch(/floor|capacity/i);
  });
});

describe("submit_commitment", () => {
  it("refuses at once every commitment that could not count, with a reason that never mentions the floor", async () => {
    const { ruleId } = await seedRule();
    const hidden = await seedRule({ floor_price_cents: 939 });
    const client = await connect((await newAgent()).token);
    const reasons: Record<string, string | undefined> = {};
    const attempt = async (name: string, args: Record<string, unknown>, at = new Date("2026-11-03T09:00:00+08:00")) => {
      now = at;
      const { reply, text, isError } = await call(client, "submit_commitment", args);
      expect(isError).toBe(!reply.ok);
      expect(text).not.toMatch(/floor/i);
      reasons[name] = reply.ok ? "ok" : reply.reason;
    };
    await attempt("staleTerms", submission(ruleId, { termsVersion: 2 }));
    await attempt("wrongWeekday", submission(ruleId, { visitDate: "2026-11-04" }));
    await attempt("atDeadline", submission(ruleId), new Date("2026-11-03T12:00:00+08:00"));
    await attempt("pastVisit", submission(ruleId, { visitDate: "2026-10-27" }));
    await attempt("overCap", submission(ruleId, { covers: 5 }));
    await attempt("maxBelowPrice", submission(ruleId, { maxPricePerCoverCents: 937 }));
    await attempt("belowFloor", submission(hidden.ruleId));
    await attempt("missingRule", submission(randomUUID()));
    await attempt("justBeforeDeadline", submission(ruleId, { covers: 4 }), new Date("2026-11-03T11:59:59.999+08:00"));
    expect(reasons).toEqual({
      staleTerms: "stale_terms",
      wrongWeekday: "not_on_offer_weekday",
      atDeadline: "past_deadline",
      pastVisit: "past_deadline",
      overCap: "over_agent_cap",
      maxBelowPrice: "max_price_below_offer_price",
      belowFloor: "offer_unavailable",
      missingRule: "offer_unavailable",
      justBeforeDeadline: "ok",
    });
    const [count] = await t.admin`select count(*)::int as n from commitments where rule_id = ${ruleId}`;
    expect(count!.n).toBe(1);
  });

  it("counts the agent's earlier covers on the same visit toward its cap, but not cancelled ones or another visit's", async () => {
    const { ruleId } = await seedRule();
    const client = await connect((await newAgent()).token);
    const first = await call(client, "submit_commitment", submission(ruleId, { covers: 3 }));
    const over = await call(client, "submit_commitment", submission(ruleId, { covers: 2 }));
    const nextWeek = await call(client, "submit_commitment", submission(ruleId, { covers: 4, visitDate: "2026-11-10" }));
    expect(first.reply.ok).toBe(true);
    await call(client, "cancel_commitment", { commitmentId: first.reply.commitment?.commitmentId });
    const afterCancel = await call(client, "submit_commitment", submission(ruleId, { covers: 4 }));
    expect([first.reply.ok, over.reply.reason, nextWeek.reply.ok, afterCancel.reply.ok]).toEqual([true, "over_agent_cap", true, true]);
  });

  it("returns the first commitment for a retried idempotency key and refuses the key for a different commitment", async () => {
    const { ruleId } = await seedRule();
    const agent = await newAgent();
    const other = await newAgent();
    const client = await connect(agent.token);
    const args = submission(ruleId);
    const first = await call(client, "submit_commitment", args);
    now = new Date("2026-11-03T10:00:00+08:00");
    const retry = await call(client, "submit_commitment", args);
    const changed = await call(client, "submit_commitment", { ...args, covers: 3 });
    const otherAgent = await call(await connect(other.token), "submit_commitment", args);
    expect(first.reply).toMatchObject({ ok: true, replayed: false });
    expect(retry.reply).toMatchObject({ ok: true, replayed: true });
    expect(retry.reply.commitment).toEqual(first.reply.commitment);
    expect(changed.reply.reason).toBe("idempotency_key_reused");
    expect(otherAgent.reply).toMatchObject({ ok: true, replayed: false });
    const [count] = await t.admin`select count(*)::int as n from commitments where agent_id = ${agent.id}`;
    expect(count!.n).toBe(1);
  });

  it("holds the per-agent cap when one agent submits many commitments at once", async () => {
    const { ruleId } = await seedRule();
    const client = await connect((await newAgent()).token);
    const replies = await Promise.all(Array.from({ length: 8 }, () => call(client, "submit_commitment", submission(ruleId, { covers: 1 }))));
    expect(replies.filter((r) => r.reply.ok)).toHaveLength(4);
    expect(new Set(replies.filter((r) => !r.reply.ok).map((r) => r.reply.reason))).toEqual(new Set(["over_agent_cap"]));
    const [sum] = await t.admin`select sum(covers)::int as n from commitments where rule_id = ${ruleId}`;
    expect(sum!.n).toBe(4);
  });

  it("refuses a commitment that waited on a terms change as stale", async () => {
    const { ruleId } = await seedRule();
    const client = await connect((await newAgent()).token);
    const lock = await t.admin.reserve();
    try {
      await lock`begin`;
      await lock`select id from rules where id = ${ruleId} for update`;
      const pending = call(client, "submit_commitment", submission(ruleId));
      // Give the submission time to read version 1 and reach the rule lock in its insert.
      await new Promise((resolve) => setTimeout(resolve, 300));
      await lock`update rules set discount_bps = 2000 where id = ${ruleId}`;
      await lock`commit`;
      expect((await pending).reply.reason).toBe("stale_terms");
    } finally {
      lock.release();
    }
  });

  it("refuses a commitment that waited on a clearing of its visit", async () => {
    const { ruleId } = await seedRule();
    const client = await connect((await newAgent()).token);
    const lock = await t.admin.reserve();
    try {
      await lock`begin`;
      await lock`select id from rules where id = ${ruleId} for update`;
      now = new Date("2026-11-03T11:59:00+08:00");
      const pending = call(client, "submit_commitment", submission(ruleId));
      // Give the submission time to reach the rule lock before the clearing commits.
      await new Promise((resolve) => setTimeout(resolve, 300));
      await lock`insert into clearings ${lock({ rule_id: ruleId, visit_date: "2026-11-03", terms_version: 1, unlocked: false, price_per_cover_cents: 938 })}`;
      await lock`commit`;
      expect((await pending).reply.reason).toBe("occurrence_cleared");
    } finally {
      lock.release();
    }
  });
});

describe("status and clearing", () => {
  async function pool(ruleId: string, coversPerAgent: number[]) {
    const ids: string[] = [];
    for (const covers of coversPerAgent) {
      ids.push(await submitOk(await connect((await newAgent()).token), submission(ruleId, { covers })));
    }
    return ids;
  }

  it("is pending with the pooled covers before the deadline, and filled at the offer price from the deadline on", async () => {
    const { ruleId } = await seedRule();
    await pool(ruleId, [3, 3]);
    const client = await connect((await newAgent()).token);
    const mine = await submitOk(client, submission(ruleId, { covers: 2 }));
    const pending = await call(client, "get_commitment_status", { commitmentId: mine });
    expect(pending.reply.commitment).toMatchObject({ status: "pending", pooledCovers: 8, minPoolCovers: 8, commitBy: "2026-11-03T04:00:00.000Z" });
    now = new Date("2026-11-03T11:59:59.999+08:00");
    expect((await call(client, "get_commitment_status", { commitmentId: mine })).reply.commitment?.status).toBe("pending");
    now = new Date("2026-11-03T12:00:00+08:00");
    const filled = await call(client, "get_commitment_status", { commitmentId: mine });
    expect(filled.reply.commitment).toMatchObject({ status: "filled", pricePerCoverCents: 938 });
    expect(filled.reply.commitment).not.toHaveProperty("pooledCovers");
    expect(filled.text).not.toMatch(/floor|capacity/i);
  });

  it("is not_filled when the pool misses its minimum", async () => {
    const { ruleId } = await seedRule();
    await pool(ruleId, [3]);
    const client = await connect((await newAgent()).token);
    const mine = await submitOk(client, submission(ruleId, { covers: 4 }));
    now = new Date("2026-11-03T12:00:00+08:00");
    const status = await call(client, "get_commitment_status", { commitmentId: mine });
    expect(status.reply.commitment).toMatchObject({ status: "not_filled" });
    expect(status.reply.commitment).not.toHaveProperty("pricePerCoverCents");
    const stored = await t.admin`select unlocked from clearings where rule_id = ${ruleId}`;
    expect(stored).toEqual([{ unlocked: false }]);
  });

  it("stores the clearing once, so a later change to the floor or capacity cannot change an outcome", async () => {
    const { ruleId } = await seedRule({ capacity_covers: 9, min_pool_covers: 8 });
    const agents = [await newAgent(), await newAgent(), await newAgent()];
    const ids: string[] = [];
    for (const [i, covers] of [4, 4, 2].entries()) {
      // A minute apart, so arrival order is the order here.
      now = new Date(Date.parse("2026-11-03T09:00:00+08:00") + i * 60_000);
      ids.push(await submitOk(await connect(agents[i]!.token), submission(ruleId, { covers })));
    }
    now = new Date("2026-11-03T12:00:00+08:00");
    // The three first reads after the deadline race to clear; one stores the result, the others read it.
    const statuses = async () =>
      Promise.all(
        ids.map(async (id, i) => {
          const { reply } = await call(await connect(agents[i]!.token), "get_commitment_status", { commitmentId: id });
          return reply.commitment?.status ?? reply.reason;
        }),
      );
    // Capacity 9: the first two fill (8 covers), the third does not fit.
    expect(await statuses()).toEqual(["filled", "filled", "not_filled"]);
    await t.admin`update rules set floor_price_cents = 1250, capacity_covers = 20 where id = ${ruleId}`;
    expect(await statuses()).toEqual(["filled", "filled", "not_filled"]);
    const [stored] = await t.admin`select count(*)::int as n from clearings where rule_id = ${ruleId}`;
    expect(stored!.n).toBe(1);
  });

  it("answers not_found for another agent's commitment, before and after the deadline", async () => {
    const { ruleId } = await seedRule();
    const [theirs] = await pool(ruleId, [2]);
    const client = await connect((await newAgent()).token);
    const before = await call(client, "get_commitment_status", { commitmentId: theirs });
    const cancel = await call(client, "cancel_commitment", { commitmentId: theirs });
    now = new Date("2026-11-03T12:00:00+08:00");
    const after = await call(client, "get_commitment_status", { commitmentId: theirs });
    expect([before.reply.reason, cancel.reply.reason, after.reply.reason]).toEqual(["not_found", "not_found", "not_found"]);
    const [row] = await t.admin`select cancelled_at from commitments where id = ${theirs!}`;
    expect(row!.cancelled_at).toBeNull();
  });
});

describe("failures", () => {
  it("answers an unexpected failure with a fixed reply that carries no query, parameter or error text", async () => {
    const { ruleId } = await seedRule();
    const client = await connect((await newAgent()).token);
    const id = await submitOk(client, submission(ruleId));
    now = new Date("2026-11-03T12:00:00+08:00");
    await t.admin`revoke select on clearings from backfill_app`;
    try {
      const { reply, text, isError } = await call(client, "get_commitment_status", { commitmentId: id });
      expect([reply.reason, isError]).toEqual(["unavailable", true]);
      expect(text).not.toMatch(/permission|select|clearings|query|${id}/i);
    } finally {
      await t.admin`grant select on clearings to backfill_app`;
    }
  });
});

describe("cancel_commitment", () => {
  it("cancels before the deadline, leaves the commitment out of the pool and the clearing, and is binding from the deadline on", async () => {
    const { ruleId } = await seedRule({ min_pool_covers: 2 });
    const client = await connect((await newAgent()).token);
    const keep = await submitOk(client, submission(ruleId, { covers: 2 }));
    const drop = await submitOk(client, submission(ruleId, { covers: 2 }));
    now = new Date("2026-11-03T11:59:59.999+08:00");
    const cancelled = await call(client, "cancel_commitment", { commitmentId: drop });
    const again = await call(client, "cancel_commitment", { commitmentId: drop });
    expect([cancelled.reply.commitment?.status, again.reply.commitment?.status]).toEqual(["cancelled", "cancelled"]);
    expect((await call(client, "get_commitment_status", { commitmentId: keep })).reply.commitment?.pooledCovers).toBe(2);
    now = new Date("2026-11-03T12:00:00+08:00");
    const late = await call(client, "cancel_commitment", { commitmentId: keep });
    expect([late.reply.reason, late.isError]).toEqual(["binding", true]);
    expect((await call(client, "get_commitment_status", { commitmentId: keep })).reply.commitment?.status).toBe("filled");
    expect((await call(client, "get_commitment_status", { commitmentId: drop })).reply.commitment?.status).toBe("cancelled");
    const fills = await t.admin`select commitment_id from clearing_fills where rule_id = ${ruleId}`;
    expect(fills.map((f) => f.commitment_id)).toEqual([keep]);
  });
});

describe("database guards", () => {
  async function committed(ruleId: string): Promise<string> {
    const client = await connect((await newAgent()).token);
    return await submitOk(client, submission(ruleId));
  }

  it("lets a commitment only be cancelled, once, and never once its visit is cleared", async () => {
    const { ruleId } = await seedRule();
    const id = await committed(ruleId);
    const other = await committed(ruleId);
    const changes = {
      covers: (await failure(t.admin`update commitments set covers = 3 where id = ${id}`))?.constraint_name,
      noop: (await failure(t.admin`update commitments set cancelled_at = null where id = ${id}`))?.constraint_name,
      cancel: (await failure(t.admin`update commitments set cancelled_at = now() where id = ${id}`))?.constraint_name ?? null,
      recancel: (await failure(t.admin`update commitments set cancelled_at = now() where id = ${id}`))?.constraint_name,
      restore: (await failure(t.admin`update commitments set cancelled_at = null where id = ${id}`))?.constraint_name,
    };
    await t.admin`insert into clearings ${t.admin({ rule_id: ruleId, visit_date: "2026-11-03", terms_version: 1, unlocked: false, price_per_cover_cents: 938 })}`;
    const afterClearing = {
      cancel: (await failure(t.admin`update commitments set cancelled_at = now() where id = ${other}`))?.constraint_name,
      insert: (await failure(
        t.admin`insert into commitments ${t.admin({ rule_id: ruleId, agent_id: (await newAgent()).id, idempotency_key: "k", terms_version: 1, covers: 1, max_price_per_cover_cents: 938, visit_at: "2026-11-03T14:00:00+08:00" })}`,
      ))?.constraint_name,
      nextWeek:
        (await failure(
          t.admin`insert into commitments ${t.admin({ rule_id: ruleId, agent_id: (await newAgent()).id, idempotency_key: "k", terms_version: 1, covers: 1, max_price_per_cover_cents: 938, visit_at: "2026-11-10T14:00:00+08:00" })}`,
        ))?.constraint_name ?? null,
    };
    expect(changes).toEqual({ covers: "commitments_cancel_only", noop: "commitments_cancel_once", cancel: null, recancel: "commitments_cancel_once", restore: "commitments_cancel_once" });
    expect(afterClearing).toEqual({ cancel: "commitments_occurrence_cleared", insert: "commitments_occurrence_cleared", nextWeek: null });
  });

  it("keeps stored clearings append-only for every role", async () => {
    const { ruleId } = await seedRule();
    const id = await committed(ruleId);
    await t.admin`insert into clearings ${t.admin({ rule_id: ruleId, visit_date: "2026-11-03", terms_version: 1, unlocked: true, price_per_cover_cents: 938 })}`;
    await t.admin.begin(async tx => {
      await tx`insert into clearing_fills ${tx({ commitment_id: id, rule_id: ruleId, visit_date: "2026-11-03", covers: 2, price_per_cover_cents: 938 })}`;
      await tx`insert into ledger (commitment_id, merchant_id, rule_id, covers, list_price_cents, price_per_cover_cents, savings_cents, buyer_share_cents, agent_share_cents, network_share_cents) select ${id}, merchant_id, id, 2, list_price_cents, 938, 624, 624, 0, 0 from rules where id = ${ruleId}`;
    });
    const messages = {
      updateClearing: (await failure(t.admin`update clearings set unlocked = false where rule_id = ${ruleId}`))?.message,
      deleteClearing: (await failure(t.admin`delete from clearings where rule_id = ${ruleId}`))?.message,
      truncateClearings: (await failure(t.admin`truncate clearings`))?.message,
      truncateClearingsCascade: (await failure(t.admin`truncate clearings cascade`))?.message,
      updateFill: (await failure(t.admin`update clearing_fills set covers = 1 where commitment_id = ${id}`))?.message,
      deleteFill: (await failure(t.admin`delete from clearing_fills where commitment_id = ${id}`))?.message,
      truncateFills: (await failure(t.admin`truncate clearing_fills`))?.message,
    };
    expect(messages).toEqual({
      updateClearing: "clearings is append-only: UPDATE refused",
      deleteClearing: "clearings is append-only: DELETE refused",
      truncateClearings: "cannot truncate a table referenced in a foreign key constraint",
      truncateClearingsCascade: "clearing_fills is append-only: TRUNCATE refused",
      updateFill: "clearing_fills is append-only: UPDATE refused",
      deleteFill: "clearing_fills is append-only: DELETE refused",
      truncateFills: "clearing_fills is append-only: TRUNCATE refused",
    });
  });

  it("gives the runtime role only what the app needs", async () => {
    const { ruleId } = await seedRule();
    const id = await committed(ruleId);
    const rt = postgres(new URL(t.url).toString().replace(/\/\/[^@/]*@/, `//${RUNTIME_LOGIN}@`), { max: 1, onnotice: () => {} });
    try {
      const denied = async (query: Promise<unknown>) => (await failure(query))?.message.startsWith("permission denied") ?? false;
      const result = {
        deleteCommitment: await denied(rt`delete from commitments where id = ${id}`),
        updateCovers: await denied(rt`update commitments set covers = 1 where id = ${id}`),
        updateRule: await denied(rt`update rules set floor_price_cents = 1 where id = ${ruleId}`),
        insertAgent: await denied(rt`insert into agents ${rt({ id: "x", label: "x", token_sha256: "c".repeat(64) })}`),
        readLedger: await denied(rt`select * from ledger`),
        truncateLlmCalls: await denied(rt`truncate llm_calls`),
        cancel: (await failure(rt`update commitments set cancelled_at = now() where id = ${id}`)) === null,
        insertLlmCall: (await failure(rt`insert into llm_calls ${rt({ provider: "p", model: "m", purpose: "x", attempt: 1, tokens_in: 0, tokens_cached_in: 0, tokens_out: 0, cost_nano_usd: 0, latency_ms: 0, ok: true })}`)) === null,
      };
      expect(result).toEqual({ deleteCommitment: true, updateCovers: true, updateRule: true, insertAgent: true, readLedger: false, truncateLlmCalls: true, cancel: true, insertLlmCall: true });
    } finally {
      await rt.end({ timeout: 5 });
    }
  });
});
