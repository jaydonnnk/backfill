import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { OwnerChange } from "@/domain/whatsapp/owner-change";
import { createMetaProvider, type LLMProvider } from "@/integrations/meta/provider";
import { listOffers } from "@/lib/commitments/service";
import { connectDb, type Db } from "@/lib/db/client";
import { llmCallRecorder } from "@/lib/llm-calls";
import { mintMerchant } from "@/lib/onboarding/links";
import type { InboundMessage } from "@/lib/whatsapp/cloud";
import { OWNER_CHANGE_PURPOSE, wonderOwner } from "@/lib/whatsapp/owner-model";
import { CONFIRM_WINDOW_MS, handleMessage, linkedPhoneEnding, newLinkCode, OWNER_CHANGE_DAILY_CAP, type OwnerDeps, processInbound } from "@/lib/whatsapp/service";
import { createTestDatabase, type TestDatabase } from "../support/db";

// The WhatsApp merchant agent end to end against the real migrations, connected as a login role that
// is only a member of backfill_app. The model is the real Meta provider with its fetch faked at the
// HTTP boundary, so every reply goes through the provider's schema check and is logged to llm_calls,
// and each test scripts exactly what "Muse Wonder" returns.

let t: TestDatabase;
let app: { db: Db; close: () => Promise<void> };
let runtime: postgres.Sql;
const RUNTIME_LOGIN = `backfill_t_rt6b_${randomBytes(4).toString("hex")}`;

type Scripted = OwnerChange | { status: number };
let script: Scripted[] = [];
let bodies: string[] = [];
const fakeFetch = (async (_url: unknown, init?: RequestInit) => {
  bodies.push(String(init?.body));
  const next = script.shift();
  if (next === undefined) throw new Error("fake model: nothing scripted");
  if ("status" in next) return new Response("{}", { status: next.status });
  return Response.json({ choices: [{ message: { content: JSON.stringify(next) } }], usage: { prompt_tokens: 400, completion_tokens: 80 } });
}) as typeof fetch;

let provider: LLMProvider;
const WONDER = "muse-wonder-1.0";
let deps: OwnerDeps;

beforeAll(async () => {
  t = await createTestDatabase("s6b_whatsapp");
  await t.admin.unsafe(`CREATE ROLE ${RUNTIME_LOGIN} LOGIN IN ROLE backfill_app`);
  const url = new URL(t.url);
  url.username = RUNTIME_LOGIN;
  app = connectDb(url.toString(), 6);
  runtime = postgres(url.toString(), { max: 2, onnotice: () => {} });
  provider = createMetaProvider({ baseUrl: "https://meta.test/v1", apiKey: "test-key", record: llmCallRecorder(app.db), fetch: fakeFetch, backoffMs: () => 0 });
  deps = { propose: wonderOwner(provider, WONDER), model: WONDER };
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

beforeEach(async () => {
  script = [];
  bodies = [];
  await t.admin`delete from llm_calls`;
});

// A floor of S$4.87, a number no other price here uses, so any reply or prompt that leaked it would show it.
const FLOOR = 487;
const LIST = 1440;
// 25% off S$14.40 is S$10.80 per cover.
const SAME = { understood: true, discountBps: 2500, capacityCovers: 4, minPoolCovers: 2, perAgentCapCovers: 2, reply: "ok" } as const;
const change = (over: Partial<OwnerChange>): OwnerChange => ({ ...SAME, ...over });

let seq = 0;
async function merchant(): Promise<{ id: string; name: string }> {
  seq += 1;
  const name = `Singapore Test Restaurant ${seq}`;
  const { id } = await mintMerchant(t.db, name);
  return { id, name };
}

async function rule(merchantId: string, over: Record<string, unknown> = {}): Promise<string> {
  const [row] = await t.admin`insert into rules ${t.admin({ merchant_id: merchantId, list_price_cents: LIST, capacity_covers: 4, weekday: 2, start_minute: 840, end_minute: 1020, commit_by_minute: 720, discount_bps: 2500, min_pool_covers: 2, per_agent_cap_covers: 2, floor_price_cents: FLOOR, ...over })} returning id`;
  return String(row?.id);
}

let phoneSeq = 0;
const newPhone = () => `6591${String(10_000 + ++phoneSeq)}`;
const say = (from: string, text: string | null): InboundMessage => ({ wamid: `wamid.${randomBytes(8).toString("hex")}`, from, text });

// A merchant with one rule and a linked phone.
async function owner(over: Record<string, unknown> = {}): Promise<{ id: string; name: string; phone: string; ruleId: string }> {
  const m = await merchant();
  const ruleId = await rule(m.id, over);
  const phone = newPhone();
  const { code } = await newLinkCode(app.db, m.id);
  expect(await handleMessage(app.db, say(phone, `link ${code}`), deps)).toContain(`Linked to ${m.name}`);
  return { ...m, phone, ruleId };
}

const ruleNow = async (ruleId: string) => (await t.admin`select discount_bps, capacity_covers, min_pool_covers, per_agent_cap_covers, terms_version from rules where id = ${ruleId}`)[0]!;
const ask = async (o: { phone: string }, text: string, clock?: () => Date): Promise<string> => (await handleMessage(app.db, say(o.phone, text), deps, clock)) ?? "";

// The constraint a statement broke, else its SQLSTATE, or "no error".
async function failure(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
    return "no error";
  } catch (err) {
    const e = err as { constraint_name?: string; code?: string; message?: string };
    return e.constraint_name ?? e.code ?? e.message;
  }
}

describe("linking an owner's phone", () => {
  it("binds the phone that sends a valid code to that merchant, once, and says so on the merchant page", async () => {
    const m = await merchant();
    const phone = newPhone();
    const { code, expiresAt } = await newLinkCode(app.db, m.id);
    expect(code).toMatch(/^[2-9A-HJKMNP-TV-Z]{8}$/);
    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(9 * 60_000);
    const [stored] = await t.admin`select code_sha256 from whatsapp_link_codes where merchant_id = ${m.id}`;
    expect(stored?.code_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(await t.admin`select * from whatsapp_link_codes where merchant_id = ${m.id}`)).not.toContain(code);
    expect(await linkedPhoneEnding(app.db, m.id)).toBeNull();
    expect(await ask({ phone }, `LINK ${code.toLowerCase()}.`)).toBe(`Linked to ${m.name}. Tell me what to change, for example: make it 20% off.`);
    expect(await linkedPhoneEnding(app.db, m.id)).toBe(phone.slice(-4));
    // The code is spent; another phone cannot use it.
    expect(await ask({ phone: newPhone() }, `LINK ${code}`)).toContain("not valid or has expired");
    expect(await t.admin`select count(*)::int as n from whatsapp_links where merchant_id = ${m.id}`).toEqual([{ n: 1 }]);
  });

  it("refuses an unknown code and an expired one, and answers an unlinked phone without calling the model", async () => {
    const m = await merchant();
    const stranger = newPhone();
    expect(await ask({ phone: stranger }, "LINK ABCDEFGH")).toContain("not valid or has expired");
    const past = () => new Date(Date.now() - 60 * 60_000);
    const { code } = await newLinkCode(app.db, m.id, past);
    expect(await ask({ phone: stranger }, `LINK ${code}`)).toContain("not valid or has expired");
    expect(await ask({ phone: stranger }, "make it 20% off")).toContain("not linked to a merchant");
    expect(await ask({ phone: stranger }, "YES")).toContain("not linked to a merchant");
    expect(bodies).toHaveLength(0);
    expect(await t.admin`select count(*)::int as n from whatsapp_links where phone = ${stranger}`).toEqual([{ n: 0 }]);
  });

  it("moves a merchant to a new number, and a number to a new merchant, with the newest link winning", async () => {
    const o = await owner();
    const second = newPhone();
    await new Promise((r) => setTimeout(r, 5));
    const { code } = await newLinkCode(app.db, o.id);
    await ask({ phone: second }, `LINK ${code}`);
    expect(await linkedPhoneEnding(app.db, o.id)).toBe(second.slice(-4));
    // The first number is no longer the owner's.
    expect(await ask({ phone: o.phone }, "YES")).toContain("not linked to a merchant");
    expect(await ask({ phone: second }, "YES")).toContain("Nothing is waiting");
    // The first number can be linked to another merchant.
    const other = await merchant();
    await new Promise((r) => setTimeout(r, 5));
    const next = await newLinkCode(app.db, other.id);
    await ask({ phone: o.phone }, `LINK ${next.code}`);
    expect(await ask({ phone: o.phone }, "YES")).toContain("Nothing is waiting");
    expect(await linkedPhoneEnding(app.db, other.id)).toBe(o.phone.slice(-4));
  });
});

describe("changing the offer by message", () => {
  it("proposes the change, publishes it only after YES, and shows buyers the new price without ever exposing the floor", async () => {
    const o = await owner();
    script = [change({ discountBps: 2000, reply: "I will make it 20% off." })];
    const proposal = await ask(o, "make it 20% off");
    expect(proposal).toContain(`Change for ${o.name}:`);
    expect(proposal).toContain("Discount 25% off to 20% off (S$10.80 to S$11.52 per cover)");
    expect(proposal).toContain("Reply YES within 15 minutes");
    expect(proposal).not.toMatch(/capacity|minimum pool|per-agent/i);
    // Nothing has changed yet.
    expect(await ruleNow(o.ruleId)).toMatchObject({ discount_bps: 2500, terms_version: 1 });
    const [stored] = await t.admin`select * from owner_changes where merchant_id = ${o.id}`;
    expect(stored).toMatchObject({ verdict: "ok", discount_bps: 2000, terms_version: 1, message_text: "make it 20% off", model: WONDER });
    // The model saw the current terms and the message, never the floor.
    const prompt = String((JSON.parse(bodies[0] ?? "{}") as { messages: { content: string }[] }).messages[1]?.content);
    expect(prompt).toContain("make it 20% off");
    expect(prompt).toContain("S$14.40");
    expect(prompt).not.toMatch(new RegExp(`${FLOOR}|4\\.87|floor`, "i"));

    expect(await ask(o, "Yes!")).toBe(`Done. ${o.name}'s offer is updated and buyers see the new terms now (terms version 2).`);
    expect(await ruleNow(o.ruleId)).toMatchObject({ discount_bps: 2000, capacity_covers: 4, terms_version: 2 });
    expect(await t.admin`select outcome from owner_change_outcomes where change_id = ${stored!.id}`).toEqual([{ outcome: "applied" }]);
    const offers = JSON.stringify(await listOffers(app.db));
    expect(offers).toContain("1152");
    expect(offers).not.toContain(String(FLOOR));
    // A second YES has nothing to confirm.
    expect(await ask(o, "yes")).toContain("Nothing is waiting");
    expect(await ruleNow(o.ruleId)).toMatchObject({ terms_version: 2 });
  });

  it("changes capacity, minimum pool and per-agent cap together, and lists only what changed", async () => {
    const o = await owner();
    script = [change({ capacityCovers: 8, minPoolCovers: 3, perAgentCapCovers: 4 })];
    const proposal = await ask(o, "open up to 8 covers, pool 3, 4 each");
    expect(proposal).toContain("Capacity 4 to 8 covers");
    expect(proposal).toContain("Minimum pool 2 to 3 covers");
    expect(proposal).toContain("Per-agent cap 2 to 4 covers");
    expect(proposal).not.toContain("Discount");
    await ask(o, "YES");
    expect(await ruleNow(o.ruleId)).toMatchObject({ discount_bps: 2500, capacity_covers: 8, min_pool_covers: 3, per_agent_cap_covers: 4 });
  });

  it("cancels on NO, and a cancelled change cannot be confirmed later", async () => {
    const o = await owner();
    script = [change({ discountBps: 2000 })];
    await ask(o, "make it 20% off");
    expect(await ask(o, "no")).toBe("Cancelled. Your offer is unchanged.");
    expect(await ask(o, "YES")).toContain("Nothing is waiting");
    expect(await ruleNow(o.ruleId)).toMatchObject({ discount_bps: 2500, terms_version: 1 });
    expect(await t.admin`select outcome from owner_change_outcomes`).toContainEqual({ outcome: "cancelled" });
    expect(await ask(o, "no")).toContain("Nothing is waiting");
  });

  it("lets a newer message replace an unconfirmed change, so YES publishes only the newest", async () => {
    const o = await owner();
    script = [change({ discountBps: 2000 })];
    await ask(o, "make it 20% off");
    const [first] = await t.admin`select id from owner_changes where merchant_id = ${o.id}`;
    await new Promise((r) => setTimeout(r, 5));
    script = [change({ discountBps: 3000 })];
    await ask(o, "actually 30% off");
    // The older change cannot be applied even by calling the function directly.
    expect(await failure(() => runtime`select apply_owner_change(${o.id}::uuid, ${first!.id}::uuid)`)).toBe("apply_owner_change_superseded");
    await ask(o, "YES");
    expect(await ruleNow(o.ruleId)).toMatchObject({ discount_bps: 3000, terms_version: 2 });
  });

  it("refuses a change below the floor, an unchanged one and a model that did not understand, and none can be confirmed", async () => {
    const o = await owner();
    // 80% off S$14.40 is S$2.88, under the floor of S$4.87.
    script = [change({ discountBps: 8000 })];
    expect(await ask(o, "80% off")).toBe("That would price a cover below your floor, so I will not publish it.");
    expect(await ask(o, "YES")).toContain("Nothing is waiting");
    script = [change({})];
    expect(await ask(o, "keep it")).toBe("Those are already your terms, so nothing would change.");
    script = [{ understood: false, discountBps: 0, capacityCovers: 0, minPoolCovers: 0, perAgentCapCovers: 0, reply: "I can change the discount, capacity, minimum pool and per-agent cap." }];
    expect(await ask(o, "no discount this Tuesday")).toBe("I can change the discount, capacity, minimum pool and per-agent cap.");
    expect(await ask(o, "YES")).toContain("Nothing is waiting");
    const rows = await t.admin`select verdict, discount_bps from owner_changes where merchant_id = ${o.id} order by created_at`;
    expect(rows).toEqual([
      { verdict: "below_floor", discount_bps: 8000 },
      { verdict: "unchanged", discount_bps: 2500 },
      { verdict: "not_understood", discount_bps: null },
    ]);
    expect(await ruleNow(o.ruleId)).toMatchObject({ discount_bps: 2500, terms_version: 1 });
  });

  it.each([
    ["discount_out_of_range", change({ discountBps: 10_000 }), "A discount must be between 1% and 99%."],
    ["discount_out_of_range", change({ discountBps: 0 }), "A discount must be between 1% and 99%."],
    ["capacity_out_of_range", change({ capacityCovers: 10_001 }), "Capacity must be between 1 and 10,000 covers."],
    ["capacity_out_of_range", change({ capacityCovers: 0, minPoolCovers: 0, perAgentCapCovers: 0 }), "Capacity must be between 1 and 10,000 covers."],
    ["min_pool_out_of_range", change({ minPoolCovers: 5 }), "The minimum pool must be at least 1 and no more than your capacity."],
    ["min_pool_out_of_range", change({ minPoolCovers: 0 }), "The minimum pool must be at least 1 and no more than your capacity."],
    ["cap_out_of_range", change({ perAgentCapCovers: 5 }), "The per-agent cap must be at least 1 and no more than your capacity."],
    ["cap_out_of_range", change({ perAgentCapCovers: 0 }), "The per-agent cap must be at least 1 and no more than your capacity."],
  ])("refuses %s and stores why", async (verdict, proposal, text) => {
    const o = await owner();
    script = [proposal];
    expect(await ask(o, "do something odd")).toBe(text);
    expect(await t.admin`select verdict from owner_changes where merchant_id = ${o.id}`).toEqual([{ verdict }]);
    expect(await ask(o, "YES")).toContain("Nothing is waiting");
  });

  it("answers a failed model call with a retry message and stores no_proposal", async () => {
    const o = await owner();
    script = [{ status: 500 }, { status: 500 }, { status: 500 }, { status: 500 }, { status: 500 }];
    expect(await ask(o, "make it 20% off")).toContain("could not work out that change");
    expect(await t.admin`select verdict, discount_bps from owner_changes where merchant_id = ${o.id}`).toEqual([{ verdict: "no_proposal", discount_bps: null }]);
    expect(await ask(o, "YES")).toContain("Nothing is waiting");
  });

  it("handles each message once even if Meta delivers it twice", async () => {
    const o = await owner();
    script = [change({ discountBps: 2000 })];
    const message = say(o.phone, "make it 20% off");
    expect(await handleMessage(app.db, message, deps)).toContain("Change for");
    expect(await handleMessage(app.db, message, deps)).toBeNull();
    expect(bodies).toHaveLength(1);
    expect(await t.admin`select count(*)::int as n from owner_changes where merchant_id = ${o.id}`).toEqual([{ n: 1 }]);
    const yes = say(o.phone, "YES");
    expect(await handleMessage(app.db, yes, deps)).toContain("Done.");
    expect(await handleMessage(app.db, yes, deps)).toBeNull();
    expect(await ruleNow(o.ruleId)).toMatchObject({ terms_version: 2 });
  });

  it("applies a confirmation that two deliveries race for exactly once", async () => {
    const o = await owner();
    script = [change({ discountBps: 2000 })];
    await ask(o, "make it 20% off");
    const replies = await Promise.all([ask(o, "YES"), ask(o, "YES"), ask(o, "YES")]);
    expect(replies.filter((r) => r.startsWith("Done."))).toHaveLength(1);
    for (const reply of replies.filter((r) => !r.startsWith("Done."))) expect(reply).toMatch(/^(That change is already live\.|Nothing is waiting)/);
    expect(await ruleNow(o.ruleId)).toMatchObject({ discount_bps: 2000, terms_version: 2 });
  });

  it("will not publish a change that expired, was proposed against old terms, or meets pending commitments", async () => {
    const o = await owner();
    // Expired: proposed an hour ago, so its confirmation window has passed.
    script = [change({ discountBps: 2000 })];
    await ask(o, "make it 20% off", () => new Date(Date.now() - 60 * 60_000));
    const [expired] = await t.admin`select id, expires_at from owner_changes where merchant_id = ${o.id}`;
    expect(expired!.expires_at.getTime() - Date.now()).toBeLessThan(0);
    expect(await ask(o, "YES")).toContain("Nothing is waiting");
    expect(await failure(() => runtime`select apply_owner_change(${o.id}::uuid, ${expired!.id}::uuid)`)).toBe("apply_owner_change_expired");

    // Stale: the rule's terms moved on after the proposal.
    await new Promise((r) => setTimeout(r, 5));
    script = [change({ discountBps: 2000 })];
    await ask(o, "make it 20% off");
    await t.admin`update rules set per_agent_cap_covers = 3 where id = ${o.ruleId}`;
    expect(await ask(o, "YES")).toBe("Your offer changed since that was proposed, so I did not publish it. Send it again.");

    // Pending: a live commitment waits on the rule.
    await new Promise((r) => setTimeout(r, 5));
    script = [change({ discountBps: 2000, perAgentCapCovers: 3 })];
    await ask(o, "make it 20% off");
    const [agent] = await t.admin`insert into agents ${t.admin({ id: `a-${randomBytes(4).toString("hex")}`, label: "t", token_sha256: randomBytes(32).toString("hex") })} returning id`;
    const [pending] = await t.admin`insert into commitments ${t.admin({ rule_id: o.ruleId, agent_id: agent!.id, idempotency_key: "p", terms_version: (await ruleNow(o.ruleId)).terms_version, covers: 1, max_price_per_cover_cents: LIST, visit_at: new Date("2026-11-24T14:00:00+08:00"), committed_at: new Date("2026-11-24T09:00:00+08:00") })} returning id`;
    expect(await ask(o, "YES")).toBe("Buyers have commitments waiting on this offer. Try again after they clear.");
    expect(await ruleNow(o.ruleId)).toMatchObject({ discount_bps: 2500 });
    // Once the commitment is cancelled the same confirmation goes through.
    await t.admin`update commitments set cancelled_at = now() where id = ${pending!.id}`;
    expect(await ask(o, "YES")).toContain("Done.");
    expect(await ruleNow(o.ruleId)).toMatchObject({ discount_bps: 2000 });
  });

  it("stops at the daily cap without calling the model, and asks a merchant with no or several offers to use the page", async () => {
    expect(OWNER_CHANGE_DAILY_CAP).toBe(30);
    const o = await owner();
    for (let i = 0; i < OWNER_CHANGE_DAILY_CAP; i++) await t.admin`insert into llm_calls ${t.admin({ provider: "meta", model: WONDER, purpose: OWNER_CHANGE_PURPOSE, attempt: 1, tokens_in: 0, tokens_cached_in: 0, tokens_out: 0, cost_nano_usd: 0, latency_ms: 0, ok: false })}`;
    expect(await ask(o, "make it 20% off")).toContain("Today's limit");
    expect(bodies).toHaveLength(0);
    await t.admin`delete from llm_calls`;

    const none = await merchant();
    const phone = newPhone();
    await ask({ phone }, `LINK ${(await newLinkCode(app.db, none.id)).code}`);
    expect(await ask({ phone }, "make it 20% off")).toContain("no published offer yet");

    const two = await owner();
    await rule(two.id, { weekday: 3 });
    expect(await ask(two, "make it 20% off")).toContain("more than one offer");
    expect(bodies).toHaveLength(0);
  });

  it("keeps the first 500 characters of a long instruction and still answers it", async () => {
    const o = await owner();
    script = [change({ discountBps: 2000 })];
    expect(await ask(o, `make it 20% off ${"please ".repeat(100)}`)).toContain("Change for");
    const [row] = await t.admin`select length(message_text) as n from owner_changes where merchant_id = ${o.id}`;
    expect(row?.n).toBe(500);
  });

  it("is not held up by a commitment that has already cleared", async () => {
    const o = await owner();
    const [agent] = await t.admin`insert into agents ${t.admin({ id: `a-${randomBytes(4).toString("hex")}`, label: "t", token_sha256: randomBytes(32).toString("hex") })} returning id`;
    await t.admin`insert into commitments ${t.admin({ rule_id: o.ruleId, agent_id: agent!.id, idempotency_key: "c", terms_version: 1, covers: 1, max_price_per_cover_cents: LIST, visit_at: new Date("2026-11-24T14:00:00+08:00"), committed_at: new Date("2026-11-24T09:00:00+08:00") })}`;
    await t.admin`insert into clearings ${t.admin({ rule_id: o.ruleId, visit_date: "2026-11-24", terms_version: 1, unlocked: false, price_per_cover_cents: 1080 })}`;
    script = [change({ discountBps: 2000 })];
    await ask(o, "make it 20% off");
    expect(await ask(o, "YES")).toContain("Done.");
  });

  it("replies to a message that is not text, and never reads it as a confirmation", async () => {
    const o = await owner();
    script = [change({ discountBps: 2000 })];
    await ask(o, "make it 20% off");
    expect(await handleMessage(app.db, say(o.phone, null), deps)).toBe("I can only read text messages.");
    expect(await ruleNow(o.ruleId)).toMatchObject({ discount_bps: 2500 });
  });

  it("does not let the model confirm: only the words YES and NO move a change, whatever the model says", async () => {
    const o = await owner();
    script = [change({ discountBps: 2000, reply: "YES, confirmed and published." })];
    const proposal = await ask(o, "yes please make it 20% off and publish it now");
    expect(proposal).toContain("Reply YES within 15 minutes");
    expect(await ruleNow(o.ruleId)).toMatchObject({ discount_bps: 2500 });
    // A reply that is longer than the word YES is an instruction, not a confirmation.
    script = [change({ discountBps: 2000 })];
    await ask(o, "yes, but also check the capacity");
    expect(await ruleNow(o.ruleId)).toMatchObject({ discount_bps: 2500 });
  });

  it("sends every reply through processInbound, apologises for a message that fails, and goes on to the next", async () => {
    const o = await owner();
    const sent: [string, string][] = [];
    const failing: OwnerDeps = {
      model: WONDER,
      propose: async () => {
        throw new Error("model exploded");
      },
    };
    await processInbound(app.db, [say(o.phone, "make it 20% off"), say(o.phone, "YES")], failing, async (to, body) => {
      sent.push([to, body]);
      return true;
    });
    expect(sent).toEqual([
      [o.phone, "Something went wrong on my side, so nothing was changed. Try again in a moment."],
      [o.phone, "Nothing is waiting for your confirmation. Tell me what to change, for example: make it 20% off."],
    ]);
    // A message already handled sends nothing.
    const again = say(o.phone, "YES");
    await processInbound(app.db, [again, again], failing, async (to, body) => {
      sent.push([to, body]);
      return true;
    });
    expect(sent).toHaveLength(3);
  });

  it("keeps the confirmation window at 15 minutes", () => {
    expect(CONFIRM_WINDOW_MS).toBe(15 * 60_000);
  });
});

describe("the database guards", () => {
  const UPDATES: Record<string, string> = {
    whatsapp_link_codes: "update whatsapp_link_codes set expires_at = expires_at + interval '1 day'",
    whatsapp_links: "update whatsapp_links set phone = '6590000000'",
    whatsapp_inbound: "update whatsapp_inbound set phone = '6590000000'",
    owner_changes: "update owner_changes set model = 'x'",
    owner_change_outcomes: "update owner_change_outcomes set outcome = 'cancelled'",
  };

  it.each(Object.keys(UPDATES))("keeps %s append-only, for the owner role and under session_replication_role = replica", async (table) => {
    // One row in every table: a linked owner, a proposal and its outcome.
    const o = await owner();
    script = [change({ discountBps: 2000 })];
    await ask(o, "make it 20% off");
    await ask(o, "YES");
    expect((await t.admin.unsafe(`select count(*)::int as n from ${table}`))[0]?.n).toBeGreaterThan(0);
    for (const run of [UPDATES[table]!, `delete from ${table}`, `truncate ${table} cascade`]) {
      expect(await failure(() => t.admin.unsafe(run))).toBe("23001");
      const conn = await t.admin.reserve();
      try {
        await conn.unsafe("SET session_replication_role = replica");
        expect(await failure(() => conn.unsafe(run))).toBe("23001");
      } finally {
        await conn.unsafe("RESET session_replication_role");
        conn.release();
      }
    }
  });

  it("lets the runtime role record and read, but link, apply and cancel only through the functions, and never touch rules", async () => {
    const o = await owner();
    // No direct INSERT on links or outcomes, no UPDATE or INSERT on rules.
    expect(await failure(() => runtime`insert into whatsapp_links ${runtime({ phone: newPhone(), merchant_id: o.id, code_sha256: randomBytes(32).toString("hex") })}`)).toBe("42501");
    expect(await failure(() => runtime`insert into owner_change_outcomes ${runtime({ change_id: randomBytes(16).toString("hex").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5"), outcome: "applied" })}`)).toBe("42501");
    expect(await failure(() => runtime`update rules set discount_bps = 1 where id = ${o.ruleId}`)).toBe("42501");
    expect((await runtime`select count(*)::int as n from whatsapp_links`)[0]?.n).toBeGreaterThan(0);
    expect((await runtime`select count(*)::int as n from owner_change_outcomes`)[0]?.n).toBeGreaterThanOrEqual(0);
    // PUBLIC cannot run the functions; the runtime role can.
    const [row] = await t.admin`select has_function_privilege('public', 'apply_owner_change(uuid, uuid)', 'execute') or has_function_privilege('public', 'cancel_owner_change(uuid, uuid)', 'execute') or has_function_privilege('public', 'claim_whatsapp_link(text, text)', 'execute') as granted`;
    expect(row?.granted).toBe(false);
  });

  it("re-checks the owner bounds inside apply_owner_change, whatever a stored row says", async () => {
    const o = await owner();
    const insert = async (over: Record<string, unknown>) => {
      await new Promise((r) => setTimeout(r, 5));
      const wamid = `wamid.${randomBytes(6).toString("hex")}`;
      await t.admin`insert into whatsapp_inbound ${t.admin({ wamid, phone: o.phone })}`;
      const [row] = await t.admin`insert into owner_changes ${t.admin({ merchant_id: o.id, rule_id: o.ruleId, terms_version: 1, wamid, message_text: "x", model: WONDER, verdict: "ok", discount_bps: 2000, capacity_covers: 4, min_pool_covers: 2, per_agent_cap_covers: 2, expires_at: new Date(Date.now() + 600_000), ...over })} returning id`;
      return String(row?.id);
    };
    const apply = (id: string, merchantId = o.id) => failure(() => runtime`select apply_owner_change(${merchantId}::uuid, ${id}::uuid)`);
    expect(await apply(await insert({ discount_bps: 9000 }))).toBe("apply_owner_change_bounds");
    expect(await apply(await insert({ discount_bps: 0 }))).toBe("apply_owner_change_bounds");
    expect(await apply(await insert({ discount_bps: 10_000 }))).toBe("apply_owner_change_bounds");
    expect(await apply(await insert({ capacity_covers: 10_001 }))).toBe("apply_owner_change_bounds");
    expect(await apply(await insert({ capacity_covers: 0, min_pool_covers: 0, per_agent_cap_covers: 0 }))).toBe("apply_owner_change_bounds");
    expect(await apply(await insert({ min_pool_covers: 5 }))).toBe("apply_owner_change_bounds");
    expect(await apply(await insert({ min_pool_covers: 0 }))).toBe("apply_owner_change_bounds");
    expect(await apply(await insert({ per_agent_cap_covers: 5 }))).toBe("apply_owner_change_bounds");
    expect(await apply(await insert({ per_agent_cap_covers: 0 }))).toBe("apply_owner_change_bounds");
    // A change that did not count, another merchant's change and an unknown one.
    expect(await apply(await insert({ verdict: "unchanged" }))).toBe("apply_owner_change_verdict");
    const mine = await insert({});
    expect(await apply(mine, (await merchant()).id)).toBe("apply_owner_change_owner");
    expect(await apply("00000000-0000-4000-8000-000000000000")).toBe("apply_owner_change_owner");
    const stranger = await merchant();
    expect(await failure(() => runtime`select cancel_owner_change(${stranger.id}::uuid, ${mine}::uuid)`)).toBe("cancel_owner_change_owner");
    // The newest row is applicable, once; the rule has moved on after, so it cannot be applied again.
    expect(await apply(mine)).toBe("no error");
    expect(await apply(mine)).toBe("apply_owner_change_stale");
    expect(await failure(() => runtime`select cancel_owner_change(${o.id}::uuid, ${mine}::uuid)`)).toBe("owner_change_outcomes_pkey");
    expect(await ruleNow(o.ruleId)).toMatchObject({ discount_bps: 2000, terms_version: 2 });
    // A cancelled change cannot be applied, and cannot be cancelled twice.
    const cancelled = await insert({ terms_version: 2, discount_bps: 1500 });
    expect(await failure(() => runtime`select cancel_owner_change(${o.id}::uuid, ${cancelled}::uuid)`)).toBe("no error");
    expect(await apply(cancelled)).toBe("owner_change_outcomes_pkey");
    expect(await failure(() => runtime`select cancel_owner_change(${o.id}::uuid, ${cancelled}::uuid)`)).toBe("owner_change_outcomes_pkey");
    expect(await ruleNow(o.ruleId)).toMatchObject({ discount_bps: 2000 });
  });

  it("takes a price exactly at the floor in SQL and refuses one cent under", async () => {
    const insert = async (o: { id: string; phone: string; ruleId: string }, discount: number) => {
      const wamid = `wamid.${randomBytes(6).toString("hex")}`;
      await t.admin`insert into whatsapp_inbound ${t.admin({ wamid, phone: o.phone })}`;
      const [row] = await t.admin`insert into owner_changes ${t.admin({ merchant_id: o.id, rule_id: o.ruleId, terms_version: 1, wamid, message_text: "x", model: WONDER, verdict: "ok", discount_bps: discount, capacity_covers: 4, min_pool_covers: 2, per_agent_cap_covers: 2, expires_at: new Date(Date.now() + 600_000) })} returning id`;
      return String(row?.id);
    };
    // 1440 at 66.24% off leaves 487, the floor; at 66.25% off it leaves 486.
    const atFloor = await owner();
    const atFloorChange = await insert(atFloor, 6624);
    expect(await failure(() => runtime`select apply_owner_change(${atFloor.id}::uuid, ${atFloorChange}::uuid)`)).toBe("no error");
    const under = await owner();
    const underChange = await insert(under, 6625);
    expect(await failure(() => runtime`select apply_owner_change(${under.id}::uuid, ${underChange}::uuid)`)).toBe("apply_owner_change_bounds");
  });

  it("checks the shape of what the tables hold", async () => {
    const o = await owner();
    const wamid = `wamid.${randomBytes(6).toString("hex")}`;
    await t.admin`insert into whatsapp_inbound ${t.admin({ wamid, phone: o.phone })}`;
    const base = { merchant_id: o.id, rule_id: o.ruleId, terms_version: 1, wamid, model: WONDER, verdict: "no_proposal", message_text: "x" };
    const now = Date.now();
    expect(await failure(() => t.admin`insert into owner_changes ${t.admin({ ...base, created_at: new Date(now), expires_at: new Date(now) })}`)).toBe("owner_changes_expiry");
    expect(await failure(() => t.admin`insert into owner_changes ${t.admin({ ...base, message_text: "x".repeat(501), expires_at: new Date(now + 1000) })}`)).toBe("owner_changes_message_length");
    expect(await failure(() => t.admin`insert into owner_changes ${t.admin({ ...base, message_text: "x".repeat(500), expires_at: new Date(now + 1000) })}`)).toBe("no error");
    const [made] = await t.admin`select id from owner_changes where merchant_id = ${o.id}`;
    expect(await failure(() => t.admin`insert into owner_change_outcomes ${t.admin({ change_id: made!.id, outcome: "maybe" })}`)).toBe("owner_change_outcomes_outcome");
    expect(await failure(() => t.admin`insert into whatsapp_inbound ${t.admin({ wamid: "", phone: o.phone })}`)).toBe("whatsapp_inbound_wamid_length");
    expect(await failure(() => t.admin`insert into whatsapp_inbound ${t.admin({ wamid: "w".repeat(201), phone: o.phone })}`)).toBe("whatsapp_inbound_wamid_length");
    expect(await failure(() => t.admin`insert into whatsapp_inbound ${t.admin({ wamid: "w1", phone: "0591234567" })}`)).toBe("whatsapp_inbound_phone_shape");
    expect(await failure(() => t.admin`insert into whatsapp_inbound ${t.admin({ wamid: "w2", phone: "+6591234567" })}`)).toBe("whatsapp_inbound_phone_shape");
    expect(await failure(() => t.admin`insert into whatsapp_inbound ${t.admin({ wamid: "w3", phone: "123456" })}`)).toBe("whatsapp_inbound_phone_shape");
    expect(await failure(() => t.admin`insert into whatsapp_inbound ${t.admin({ wamid: "w4", phone: "1234567890123456" })}`)).toBe("whatsapp_inbound_phone_shape");
    expect(await failure(() => t.admin`insert into whatsapp_link_codes ${t.admin({ code_sha256: "ABC", merchant_id: o.id, expires_at: new Date(now + 1000) })}`)).toBe("whatsapp_link_codes_sha256_hex");
    expect(await failure(() => t.admin`insert into whatsapp_link_codes ${t.admin({ code_sha256: randomBytes(32).toString("hex"), merchant_id: o.id, created_at: new Date(now), expires_at: new Date(now) })}`)).toBe("whatsapp_link_codes_expiry");
    // A wamid names one change.
    expect(await failure(() => t.admin`insert into owner_changes ${t.admin({ ...base, expires_at: new Date(now + 1000) })}`)).toBe("owner_changes_wamid_once");
  });

  it("refuses an owner change that names a proposal without numbers or numbers without a proposal", async () => {
    const o = await owner();
    const wamid = `wamid.${randomBytes(6).toString("hex")}`;
    await t.admin`insert into whatsapp_inbound ${t.admin({ wamid, phone: o.phone })}`;
    const base = { merchant_id: o.id, rule_id: o.ruleId, terms_version: 1, wamid, message_text: "x", model: WONDER, expires_at: new Date(Date.now() + 600_000) };
    expect(await failure(() => t.admin`insert into owner_changes ${t.admin({ ...base, verdict: "ok" })}`)).toBe("owner_changes_proposal_together");
    expect(await failure(() => t.admin`insert into owner_changes ${t.admin({ ...base, verdict: "not_understood", discount_bps: 2000, capacity_covers: 4, min_pool_covers: 2, per_agent_cap_covers: 2 })}`)).toBe("owner_changes_proposal_together");
    expect(await failure(() => t.admin`insert into owner_changes ${t.admin({ ...base, verdict: "maybe", discount_bps: 2000, capacity_covers: 4, min_pool_covers: 2, per_agent_cap_covers: 2 })}`)).toBe("owner_changes_verdict");
    expect(await failure(() => t.admin`insert into owner_changes ${t.admin({ ...base, message_text: "", verdict: "no_proposal" })}`)).toBe("owner_changes_message_length");
    expect(await failure(() => t.admin`insert into whatsapp_links ${t.admin({ phone: "+6591234567", merchant_id: o.id, code_sha256: randomBytes(32).toString("hex") })}`)).toBe("whatsapp_links_phone_shape");
  });
});
