import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createMetaProvider } from "@/integrations/meta/provider";
import { mintAgent } from "@/lib/agents/tokens";
import { connectDb, type Db } from "@/lib/db/client";
import { llmCallRecorder } from "@/lib/llm-calls";
import { mcpPostHandler } from "@/lib/mcp/http";
import { sparkMerchant } from "@/lib/negotiation/merchant-agent";
import { createTestDatabase, type TestDatabase } from "../support/db";

// Negotiation end to end: a real MCP client speaks to the route's handler, connected as a login role
// that is only a member of backfill_app. The merchant model is the real Meta provider with its fetch
// faked at the HTTP boundary, so every proposal goes through the provider's schema check and is
// logged to llm_calls, and each test scripts exactly what "Muse Spark" proposes.

let t: TestDatabase;
let app: { db: Db; close: () => Promise<void> };
let runtime: postgres.Sql;
const RUNTIME_LOGIN = `backfill_t_rt5_${randomBytes(4).toString("hex")}`;
const SECRET = randomBytes(32).toString("hex");
let now = new Date("2026-11-03T09:00:00+08:00");

// What the fake model proposes next: a price per cover, or an HTTP status for a failed attempt.
let script: (number | { status: number })[] = [];
let prompts: string[] = [];
// When set, each model call waits until this many calls have arrived, so simultaneous requests are
// sure to have read the same round before either stores it.
let barrier: { size: number; arrived: number; release: () => void; open: Promise<void> } | null = null;
const fakeFetch = (async (_url: unknown, init?: RequestInit) => {
  prompts.push(String(init?.body));
  if (barrier) {
    barrier.arrived += 1;
    if (barrier.arrived >= barrier.size) barrier.release();
    await barrier.open;
  }
  const next = script.shift();
  if (next === undefined) throw new Error("fake model: nothing scripted");
  if (typeof next === "object") return new Response("{}", { status: next.status });
  const content = JSON.stringify({ priceCents: next, rationale: "scripted" });
  return Response.json({ choices: [{ message: { content } }], usage: { prompt_tokens: 100, completion_tokens: 20 } });
}) as typeof fetch;

let handler: (req: Request) => Promise<Response>;

beforeAll(async () => {
  t = await createTestDatabase("s5_negotiation");
  await t.admin.unsafe(`CREATE ROLE ${RUNTIME_LOGIN} LOGIN IN ROLE backfill_app`);
  const url = new URL(t.url);
  url.username = RUNTIME_LOGIN;
  app = connectDb(url.toString(), 10);
  runtime = postgres(url.toString(), { max: 2, onnotice: () => {} });
  const provider = createMetaProvider({ baseUrl: "https://meta.test/v1", apiKey: "test-key", record: llmCallRecorder(app.db), fetch: fakeFetch, backoffMs: () => 0 });
  handler = mcpPostHandler(
    () => app.db,
    () => now,
    () => ({ secret: SECRET, propose: sparkMerchant(provider, "muse-spark-1.3") }),
  );
});

afterAll(async () => {
  await runtime?.end({ timeout: 5 });
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
  script = [];
  prompts = [];
  barrier = null;
});

// "25% off Tue 2-5pm if 8 people commit by noon": S$12.50 becomes S$9.38. The floor is S$9.03, a
// number no other price in these tests uses, so a reply or prompt that leaked it would show it. One
// concession step is 31 cents.
const FLOOR = 903;
const OFFER = 938;
async function seedRule(overrides: Record<string, number> = {}): Promise<string> {
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
    floor_price_cents: FLOOR,
    ...overrides,
  })} returning id`;
  return String(r!.id);
}

async function connect(): Promise<{ client: Client; agentId: string }> {
  const agent = await mintAgent(t.db, `agent-${randomBytes(4).toString("hex")}`, "test agent");
  const client = new Client({ name: "s5-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL("http://backfill.test/mcp"), {
    fetch: (url, init) => handler(new Request(url, init)),
    requestInit: { headers: { Authorization: `Bearer ${agent.token}` } },
  });
  await client.connect(transport);
  return { client, agentId: agent.id };
}

type Reply = Record<string, unknown> & { ok: boolean; reason?: string };
type Negotiation = { negotiationId: string; round: number; roundsLeft: number; status: string; merchantPriceCents: number; counterOffer: string };

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<{ reply: Reply; text: string }> {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text: string }[])[0]?.text ?? "";
  if (result.structuredContent === undefined) return { reply: { ok: false, reason: `unstructured: ${text}` }, text };
  return { reply: result.structuredContent as Reply, text };
}

const bid = (ruleId: string, bidCents: number, overrides: Record<string, unknown> = {}) => ({ ruleId, termsVersion: 1, visitDate: "2026-11-03", covers: 2, bidCents, ...overrides });

// A negotiate_offer round the test needs answered; fails on an assertion if it was refused.
async function round(client: Client, args: Record<string, unknown>): Promise<Negotiation> {
  const { reply } = await call(client, "negotiate_offer", args);
  expect(reply.reason).toBeUndefined();
  return reply.negotiation as Negotiation;
}

const submission = (ruleId: string, overrides: Record<string, unknown> = {}) => ({
  ruleId,
  termsVersion: 1,
  visitDate: "2026-11-03",
  covers: 2,
  maxPricePerCoverCents: OFFER,
  idempotencyKey: randomUUID(),
  ...overrides,
});

const roundsOf = (negotiationId: string) =>
  t.admin`select round, bid_cents, proposed_cents, proposal_verdict, status, counter_cents from negotiation_rounds where negotiation_id = ${negotiationId} order by round`;

describe("tools", () => {
  it("offers negotiate_offer with the binding wording and the round limit", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    const tool = tools.find((x) => x.name === "negotiate_offer");
    expect(tools.map((x) => x.name).sort()).toEqual(["cancel_commitment", "get_agent_terms", "get_commitment_status", "list_offers", "negotiate_offer", "submit_commitment"]);
    expect(tool?.description).toContain("At most 3 rounds");
    expect(tool?.description).toContain("A commitment is binding");
  });
});

describe("rounds", () => {
  it("counters, then commits at the agreed price through the signed counter-offer", async () => {
    const ruleId = await seedRule();
    const { client } = await connect();
    script = [920, 907];
    const first = await round(client, bid(ruleId, 850));
    expect(first).toMatchObject({ round: 1, roundsLeft: 2, status: "countered", merchantPriceCents: 920 });
    const second = await round(client, bid(ruleId, 880));
    expect(second).toMatchObject({ negotiationId: first.negotiationId, round: 2, roundsLeft: 1, status: "countered", merchantPriceCents: 907 });

    const { reply } = await call(client, "submit_commitment", submission(ruleId, { maxPricePerCoverCents: 907, counterOffer: second.counterOffer }));
    expect(reply.ok).toBe(true);
    expect(reply.commitment).toMatchObject({ negotiatedPriceCents: 907, maxPricePerCoverCents: 907, status: "pending" });
    const [row] = await t.admin`select negotiation_id, negotiated_price_cents from commitments where id = ${String((reply.commitment as Reply).commitmentId)}`;
    expect(row).toEqual({ negotiation_id: first.negotiationId, negotiated_price_cents: 907 });
  });

  it("accepts a bid at the merchant's price without asking the model", async () => {
    const ruleId = await seedRule();
    const { client } = await connect();
    expect(await round(client, bid(ruleId, OFFER))).toMatchObject({ status: "accepted", merchantPriceCents: OFFER });
    expect(prompts).toEqual([]);
  });

  it("accepts when the model meets the bid", async () => {
    const ruleId = await seedRule();
    const { client } = await connect();
    script = [915];
    expect(await round(client, bid(ruleId, 915))).toMatchObject({ status: "accepted", merchantPriceCents: 915 });
  });

  it("refuses a fourth round, after three rounds that each asked the model once", async () => {
    const ruleId = await seedRule();
    const { client } = await connect();
    script = [930, 920, 910];
    for (const [i, cents] of [850, 850, 850].entries()) expect(await round(client, bid(ruleId, cents))).toMatchObject({ round: i + 1 });
    const { reply } = await call(client, "negotiate_offer", bid(ruleId, 850));
    expect(reply).toMatchObject({ ok: false, reason: "round_limit" });
    expect(prompts).toHaveLength(3);
  });

  it("holds when the model fails, and logs every failed attempt", async () => {
    const ruleId = await seedRule();
    const { client } = await connect();
    script = [{ status: 500 }, { status: 500 }, { status: 500 }];
    expect(await round(client, bid(ruleId, 850))).toMatchObject({ status: "held", merchantPriceCents: OFFER });
    const calls = await t.admin`select attempt, ok, http_status from llm_calls where purpose = 'negotiation' order by id desc limit 3`;
    expect(calls).toEqual([
      { attempt: 3, ok: false, http_status: 500 },
      { attempt: 2, ok: false, http_status: 500 },
      { attempt: 1, ok: false, http_status: 500 },
    ]);
  });
});

describe("a model proposal outside the limits", () => {
  it("is rejected, holds like any other hold, and never reaches a commitment or a clearing", async () => {
    const ruleId = await seedRule();
    const { client, agentId } = await connect();
    script = [907, 899];
    const first = await round(client, bid(ruleId, 850));
    expect(first).toMatchObject({ status: "countered", merchantPriceCents: 907 });
    // 899 is within one step of 907 and above the bid, but below the hidden floor of 903.
    const { reply, text } = await call(client, "negotiate_offer", bid(ruleId, 880));
    const held = reply.negotiation as Negotiation;
    expect(held).toMatchObject({ round: 2, status: "held", merchantPriceCents: 907 });
    for (const leak of ["899", String(FLOOR), "floor"]) expect(text).not.toContain(leak);
    expect(await roundsOf(first.negotiationId)).toEqual([
      { round: 1, bid_cents: 850, proposed_cents: 907, proposal_verdict: "ok", status: "countered", counter_cents: 907 },
      { round: 2, bid_cents: 880, proposed_cents: 899, proposal_verdict: "below_floor", status: "held", counter_cents: 907 },
    ]);

    // A token for 899 signed with another secret, and one signed with the right secret (as a bug in
    // the app might), are both refused; so is a direct insert as the runtime role.
    const payload = (price: number) =>
      Buffer.from(
        JSON.stringify({ v: 1, negotiationId: first.negotiationId, round: 2, agentId, ruleId, termsVersion: 1, visitDate: "2026-11-03", covers: 2, priceCents: price }),
      ).toString("base64url");
    const signed = (secret: string, price: number) => `${payload(price)}.${createHmac("sha256", secret).update(payload(price)).digest("base64url")}`;
    for (const counterOffer of [signed("x".repeat(32), 899), signed(SECRET, 899)]) {
      const { reply: refused } = await call(client, "submit_commitment", submission(ruleId, { maxPricePerCoverCents: 899, counterOffer }));
      expect(refused).toMatchObject({ ok: false, reason: "counter_offer_invalid" });
    }
    const direct = await runtime`insert into commitments ${runtime({
      rule_id: ruleId,
      agent_id: agentId,
      idempotency_key: randomUUID(),
      terms_version: 1,
      covers: 2,
      max_price_per_cover_cents: 899,
      visit_at: new Date("2026-11-03T14:00:00+08:00"),
      negotiation_id: first.negotiationId,
      negotiated_price_cents: 899,
    })}`.then(
      () => null,
      (err: { constraint_name?: string }) => err.constraint_name,
    );
    expect(direct).toBe("commitments_negotiated_match");
    expect(await t.admin`select id from commitments where negotiated_price_cents < ${FLOOR}`).toEqual([]);

    // The held counter is what commits, and it clears at 907 while the rest clear at the offer price.
    const { reply: committed } = await call(client, "submit_commitment", submission(ruleId, { maxPricePerCoverCents: 907, counterOffer: held.counterOffer }));
    expect(committed.ok).toBe(true);
    const others = [];
    for (let i = 0; i < 2; i++) {
      const other = await connect();
      const { reply: submitted } = await call(other.client, "submit_commitment", submission(ruleId, { covers: 4 }));
      others.push({ client: other.client, id: String((submitted.commitment as Reply).commitmentId) });
    }
    now = new Date("2026-11-03T12:00:00+08:00");
    const { reply: status } = await call(client, "get_commitment_status", { commitmentId: String((committed.commitment as Reply).commitmentId) });
    expect(status.commitment).toMatchObject({ status: "filled", pricePerCoverCents: 907, negotiatedPriceCents: 907 });
    const { reply: otherStatus } = await call(others[0]!.client, "get_commitment_status", { commitmentId: others[0]!.id });
    expect(otherStatus.commitment).toMatchObject({ status: "filled", pricePerCoverCents: OFFER });
    const fills = await t.admin`select price_per_cover_cents as price from clearing_fills where rule_id = ${ruleId} order by price`;
    expect(fills.map((f) => f.price)).toEqual([907, OFFER, OFFER]);
  });

  it("holds on a proposal that rises or concedes more than one step", async () => {
    const ruleId = await seedRule();
    const { client } = await connect();
    script = [OFFER + 1, OFFER - 32];
    expect(await round(client, bid(ruleId, 850))).toMatchObject({ status: "held", merchantPriceCents: OFFER });
    const second = await round(client, bid(ruleId, 850));
    expect(second).toMatchObject({ status: "held", merchantPriceCents: OFFER });
    expect((await roundsOf(second.negotiationId)).map((r) => r.proposal_verdict)).toEqual(["rises", "concedes_too_much"]);
  });

  it("never shows the model the floor", async () => {
    const ruleId = await seedRule();
    const { client } = await connect();
    script = [930];
    await round(client, bid(ruleId, 850));
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).not.toContain(String(FLOOR));
    expect(prompts[0]).not.toContain("9.03");
  });
});

describe("counter-offers", () => {
  it("refuses an earlier round's counter-offer, another agent's, and one for other covers", async () => {
    const ruleId = await seedRule();
    const { client } = await connect();
    const other = await connect();
    script = [930, 920];
    const first = await round(client, bid(ruleId, 850));
    await round(client, bid(ruleId, 850));
    const cases = [
      { client, args: submission(ruleId, { counterOffer: first.counterOffer }) },
      { client: other.client, args: submission(ruleId, { counterOffer: first.counterOffer }) },
      { client, args: submission(ruleId, { covers: 3, counterOffer: first.counterOffer }) },
    ];
    for (const c of cases) expect((await call(c.client, "submit_commitment", c.args)).reply).toMatchObject({ ok: false, reason: "counter_offer_invalid" });
  });

  it("commits once per negotiation, takes no round after, and replays the same submission", async () => {
    const ruleId = await seedRule();
    const { client } = await connect();
    script = [920];
    const n = await round(client, bid(ruleId, 850));
    const args = submission(ruleId, { counterOffer: n.counterOffer });
    expect((await call(client, "submit_commitment", args)).reply.ok).toBe(true);
    expect((await call(client, "submit_commitment", args)).reply).toMatchObject({ ok: true, replayed: true });
    expect((await call(client, "submit_commitment", { ...args, idempotencyKey: randomUUID() })).reply).toMatchObject({ ok: false, reason: "counter_offer_used" });
    expect((await call(client, "negotiate_offer", bid(ruleId, 850))).reply).toMatchObject({ ok: false, reason: "negotiation_used" });
  });

  it("refuses a max price a cent below the counter-offer's price and takes one at it", async () => {
    const ruleId = await seedRule();
    const { client } = await connect();
    script = [920];
    const n = await round(client, bid(ruleId, 850));
    expect((await call(client, "submit_commitment", submission(ruleId, { maxPricePerCoverCents: 919, counterOffer: n.counterOffer }))).reply).toMatchObject({
      ok: false,
      reason: "max_price_below_counter_price",
    });
    expect((await call(client, "submit_commitment", submission(ruleId, { maxPricePerCoverCents: 920, counterOffer: n.counterOffer }))).reply.ok).toBe(true);
  });

  it("refuses a counter-offer below a floor raised after it, and closes the negotiation, with no reply naming the floor", async () => {
    const ruleId = await seedRule();
    const { client } = await connect();
    script = [910];
    const n = await round(client, bid(ruleId, 850));
    await t.admin`update rules set floor_price_cents = 911 where id = ${ruleId}`;
    const submitted = await call(client, "submit_commitment", submission(ruleId, { counterOffer: n.counterOffer }));
    expect(submitted.reply).toMatchObject({ ok: false, reason: "counter_offer_invalid" });
    const next = await call(client, "negotiate_offer", bid(ruleId, 850));
    expect(next.reply).toMatchObject({ ok: false, reason: "negotiation_closed" });
    for (const text of [submitted.text, next.text]) expect(text).not.toContain("911");
    await t.admin`update rules set floor_price_cents = 910 where id = ${ruleId}`;
    expect((await call(client, "submit_commitment", submission(ruleId, { counterOffer: n.counterOffer }))).reply.ok).toBe(true);
  });

  it("counts a negotiated commitment priced below the offer toward the per-agent cap", async () => {
    const ruleId = await seedRule();
    const { client } = await connect();
    script = [907];
    const n = await round(client, bid(ruleId, 850, { covers: 2 }));
    expect((await call(client, "submit_commitment", submission(ruleId, { maxPricePerCoverCents: 907, counterOffer: n.counterOffer }))).reply.ok).toBe(true);
    expect((await call(client, "submit_commitment", submission(ruleId, { covers: 3 }))).reply).toMatchObject({ ok: false, reason: "over_agent_cap" });
    expect((await call(client, "submit_commitment", submission(ruleId, { covers: 2 }))).reply.ok).toBe(true);
  });
});

describe("one negotiation per visit", () => {
  it("refuses other covers in the same negotiation and covers over the cap", async () => {
    const ruleId = await seedRule();
    const { client } = await connect();
    script = [930];
    await round(client, bid(ruleId, 850));
    expect((await call(client, "negotiate_offer", bid(ruleId, 850, { covers: 3 }))).reply).toMatchObject({ ok: false, reason: "negotiation_mismatch" });
    const fresh = await connect();
    expect((await call(fresh.client, "negotiate_offer", bid(ruleId, 850, { covers: 5 }))).reply).toMatchObject({ ok: false, reason: "over_agent_cap" });
  });

  it("refuses at and after the deadline, and a date off the weekday or stale terms", async () => {
    const ruleId = await seedRule();
    const { client } = await connect();
    expect((await call(client, "negotiate_offer", bid(ruleId, 850, { visitDate: "2026-11-04" }))).reply).toMatchObject({ ok: false, reason: "not_on_offer_weekday" });
    expect((await call(client, "negotiate_offer", bid(ruleId, 850, { termsVersion: 2 }))).reply).toMatchObject({ ok: false, reason: "stale_terms" });
    now = new Date("2026-11-03T12:00:00+08:00");
    expect((await call(client, "negotiate_offer", bid(ruleId, 850))).reply).toMatchObject({ ok: false, reason: "past_deadline" });
    expect(prompts).toEqual([]);
  });

  it("answers two simultaneous first bids with one round and one busy", async () => {
    const ruleId = await seedRule();
    const { client } = await connect();
    script = [930, 925];
    let release = () => {};
    const open = new Promise<void>((resolve) => (release = resolve));
    barrier = { size: 2, arrived: 0, release, open };
    const replies = await Promise.all([call(client, "negotiate_offer", bid(ruleId, 850)), call(client, "negotiate_offer", bid(ruleId, 850))]);
    expect(replies.map((r) => r.reply.ok).sort()).toEqual([false, true]);
    expect(replies.find((r) => !r.reply.ok)?.reply.reason).toBe("negotiation_busy");
    const [n] = await t.admin`select count(*)::int as rounds from negotiation_rounds r join negotiations n on n.id = r.negotiation_id where n.rule_id = ${ruleId}`;
    expect(n?.rounds).toBe(1);
    expect(prompts).toHaveLength(2);
  });
});

describe("database guards", () => {
  async function negotiation(ruleId: string, agentId: string): Promise<string> {
    const [n] = await t.admin`insert into negotiations ${t.admin({ agent_id: agentId, rule_id: ruleId, terms_version: 1, visit_date: "2026-11-03", covers: 2 })} returning id`;
    return String(n!.id);
  }
  const roundRow = (negotiationId: string, roundNo: number, counter: number) => ({ negotiation_id: negotiationId, round: roundNo, bid_cents: 850, status: "held", counter_cents: counter });
  const constraint = (query: Promise<unknown>) =>
    query.then(
      () => null,
      (err: { constraint_name?: string; message: string }) => err.constraint_name ?? err.message,
    );

  it("keeps rounds in order, at most three, never rising", async () => {
    const ruleId = await seedRule();
    const { agentId } = await connect();
    const id = await negotiation(ruleId, agentId);
    expect(await constraint(t.admin`insert into negotiation_rounds ${t.admin(roundRow(id, 2, 930))}`)).toBe("negotiation_rounds_in_order");
    await t.admin`insert into negotiation_rounds ${t.admin(roundRow(id, 1, 930))}`;
    expect(await constraint(t.admin`insert into negotiation_rounds ${t.admin(roundRow(id, 2, 931))}`)).toBe("negotiation_rounds_never_rise");
    await t.admin`insert into negotiation_rounds ${t.admin(roundRow(id, 2, 930))}`;
    await t.admin`insert into negotiation_rounds ${t.admin(roundRow(id, 3, 920))}`;
    expect(await constraint(t.admin`insert into negotiation_rounds ${t.admin(roundRow(id, 4, 920))}`)).toBe("negotiation_rounds_round_range");
  });

  it("keeps negotiations and rounds append-only for every role", async () => {
    const ruleId = await seedRule();
    const { agentId } = await connect();
    const id = await negotiation(ruleId, agentId);
    await t.admin`insert into negotiation_rounds ${t.admin(roundRow(id, 1, 930))}`;
    const messages = {
      updateNegotiation: await constraint(t.admin`update negotiations set covers = 3 where id = ${id}`),
      deleteNegotiation: await constraint(t.admin`delete from negotiations where id = ${id}`),
      truncateNegotiations: await constraint(t.admin`truncate negotiations cascade`),
      updateRound: await constraint(t.admin`update negotiation_rounds set counter_cents = 1 where negotiation_id = ${id}`),
      deleteRound: await constraint(t.admin`delete from negotiation_rounds where negotiation_id = ${id}`),
      truncateRounds: await constraint(t.admin`truncate negotiation_rounds`),
    };
    expect(messages).toEqual({
      updateNegotiation: "negotiations is append-only: UPDATE refused",
      deleteNegotiation: "negotiations is append-only: DELETE refused",
      truncateNegotiations: "negotiations is append-only: TRUNCATE refused",
      updateRound: "negotiation_rounds is append-only: UPDATE refused",
      deleteRound: "negotiation_rounds is append-only: DELETE refused",
      truncateRounds: "negotiation_rounds is append-only: TRUNCATE refused",
    });
  });

  it("refuses a second negotiation for the same visit", async () => {
    const ruleId = await seedRule();
    const { agentId } = await connect();
    await negotiation(ruleId, agentId);
    expect(await constraint(negotiation(ruleId, agentId))).toBe("negotiations_once_per_occurrence");
  });

  it("grants the runtime role select and insert on negotiations and rounds, and nothing more", async () => {
    const privileges = await t.admin`
      select table_name as t, string_agg(privilege_type, ',' order by privilege_type) as p
      from information_schema.role_table_grants
      where grantee = 'backfill_app' and table_name in ('negotiations', 'negotiation_rounds')
      group by table_name order by table_name`;
    expect(privileges).toEqual([
      { t: "negotiation_rounds", p: "INSERT,SELECT" },
      { t: "negotiations", p: "INSERT,SELECT" },
    ]);
  });
});
