import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { MenuDraft } from "@/domain/onboarding/menu";
import type { WonderPlan } from "@/domain/onboarding/replan";
import { createMetaProvider, type LLMProvider } from "@/integrations/meta/provider";
import { listOffers } from "@/lib/commitments/service";
import { connectDb, type Db } from "@/lib/db/client";
import { llmCallRecorder } from "@/lib/llm-calls";
import { authenticateMerchant, mintMerchant } from "@/lib/onboarding/links";
import { MENU_VISION_PURPOSE, sparkMenuReader, WONDER_PLAN_PURPOSE, wonderMerchant } from "@/lib/onboarding/models";
import { applyPlan, getDraft, MENU_DAILY_CAP, PLAN_DAILY_CAP, publishDraft, readMenu, replanSoldOut } from "@/lib/onboarding/service";
import { createTestDatabase, type TestDatabase } from "../support/db";

// Onboarding and the Wonder merchant agent end to end against the real migrations, connected as a
// login role that is only a member of backfill_app. Both models are the real Meta provider with its
// fetch faked at the HTTP boundary, so every reply goes through the provider's schema check and is
// logged to llm_calls, and each test scripts exactly what "Muse Spark" and "Muse Wonder" return.

let t: TestDatabase;
let app: { db: Db; close: () => Promise<void> };
let runtime: postgres.Sql;
const RUNTIME_LOGIN = `backfill_t_rt6_${randomBytes(4).toString("hex")}`;

type Scripted = MenuDraft | WonderPlan | { status: number };
let script: Scripted[] = [];
let bodies: string[] = [];
const fakeFetch = (async (_url: unknown, init?: RequestInit) => {
  bodies.push(String(init?.body));
  const next = script.shift();
  if (next === undefined) throw new Error("fake model: nothing scripted");
  if ("status" in next) return new Response("{}", { status: next.status });
  return Response.json({ choices: [{ message: { content: JSON.stringify(next) } }], usage: { prompt_tokens: 1000, completion_tokens: 200 } });
}) as typeof fetch;

let provider: LLMProvider;
const SPARK = "muse-spark-1.3";
const WONDER = "muse-wonder-1.0";

beforeAll(async () => {
  t = await createTestDatabase("s6_onboarding");
  await t.admin.unsafe(`CREATE ROLE ${RUNTIME_LOGIN} LOGIN IN ROLE backfill_app`);
  const url = new URL(t.url);
  url.username = RUNTIME_LOGIN;
  app = connectDb(url.toString(), 6);
  runtime = postgres(url.toString(), { max: 2, onnotice: () => {} });
  provider = createMetaProvider({ baseUrl: "https://meta.test/v1", apiKey: "test-key", record: llmCallRecorder(app.db), fetch: fakeFetch, backoffMs: () => 0 });
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
  // Each test starts under both daily caps.
  await t.admin`delete from llm_calls`;
});

// A small JPEG header is enough: the photo is only sniffed, hashed and sent to the (fake) model.
const PHOTO = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...randomBytes(64)]);
const MENU: MenuDraft = {
  currency: "SGD",
  items: [
    { name: "Iced latte", priceCents: 650 },
    { name: "Truffle fries", priceCents: 1200 },
    { name: "Burnt cheesecake", priceCents: 790 },
  ],
  cover: { itemIndexes: [0, 2], description: "Iced latte and a slice of cheesecake" },
};
// 25% off S$14.40 is S$10.80. The floor, S$9.17, is a number no other price here uses, so any reply
// or prompt that leaked it would show it.
const FLOOR = 917;
const TERMS = {
  capacityCovers: 4,
  terms: { window: { weekday: 2, startMinute: 840, endMinute: 1020, commitByMinute: 720 }, discountBps: 2500, minPoolCovers: 2, perAgentCapCovers: 2, floorPriceCents: FLOOR },
};

// The constraint a statement broke, else its SQLSTATE, or "no error".
async function failure(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
  } catch (err) {
    return (err as { constraint_name?: string; code?: string }).constraint_name ?? (err as { code?: string }).code;
  }
  return "no error";
}

let merchantSeq = 0;
async function merchant(): Promise<{ id: string; name: string; token: string }> {
  merchantSeq += 1;
  const name = `Kopi Lane Cafe ${merchantSeq} (synthetic)`;
  const { id, token } = await mintMerchant(t.db, name);
  return { id, name, token };
}

const read = () => sparkMenuReader(provider, SPARK);

async function publishedRule(m: { id: string }): Promise<string> {
  script = [MENU];
  const result = await readMenu(app.db, m.id, PHOTO, read(), SPARK);
  if (!("draftId" in result)) throw new Error(`menu read failed: ${result.status}`);
  const published = await publishDraft(app.db, m.id, result.draftId, TERMS);
  if (published.status !== "published") throw new Error(`publish failed: ${published.status}`);
  return published.ruleId;
}

describe("merchant secret link", () => {
  it("finds the merchant by its token's hash only, and refuses unknown or malformed tokens", async () => {
    const m = await merchant();
    expect(await authenticateMerchant(app.db, m.token)).toEqual({ id: m.id, name: m.name });
    const [stored] = await t.admin`select link_token_sha256 from merchants where id = ${m.id}`;
    expect(stored?.link_token_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(m.token.slice(4));
    expect(await authenticateMerchant(app.db, undefined)).toBeNull();
    expect(await authenticateMerchant(app.db, `${m.token.slice(0, -1)}${m.token.endsWith("A") ? "B" : "A"}`)).toBeNull();
    expect(await authenticateMerchant(app.db, `${m.token}x`)).toBeNull();
    expect(await authenticateMerchant(app.db, m.token.replace("bfm_", "bfa_"))).toBeNull();
  });
});

describe("menu photo to draft with Muse Spark vision", () => {
  it("sends the photo as an image, stores only its hash, and prices the cover from the printed prices", async () => {
    const m = await merchant();
    script = [MENU];
    const result = await readMenu(app.db, m.id, PHOTO, read(), SPARK);
    expect(result).toMatchObject({ status: "ok" });
    const sent = JSON.parse(bodies[0] ?? "{}") as { messages: { content: unknown }[]; response_format: { json_schema: { name: string } } };
    expect(sent.response_format.json_schema.name).toBe("MenuDraft");
    expect(sent.messages[1]?.content).toEqual([expect.objectContaining({ type: "text" }), { type: "image_url", image_url: { url: `data:image/jpeg;base64,${Buffer.from(PHOTO).toString("base64")}` } }]);

    const [row] = await t.admin`select * from menu_drafts where merchant_id = ${m.id}`;
    expect(row).toMatchObject({ verdict: "ok", list_price_cents: 1440, photo_bytes: PHOTO.length, photo_type: "image/jpeg", model: SPARK });
    expect(row?.photo_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(Buffer.from(PHOTO).toString("base64"));
    const calls = await t.admin`select purpose, model, ok, output from llm_calls`;
    expect(calls).toEqual([expect.objectContaining({ purpose: MENU_VISION_PURPOSE, model: SPARK, ok: true })]);
    expect(JSON.stringify(calls)).not.toContain(Buffer.from(PHOTO).toString("base64"));
  });

  it("stores a draft that does not count with its reason and no list price", async () => {
    const m = await merchant();
    script = [{ ...MENU, currency: "other" }];
    const result = await readMenu(app.db, m.id, PHOTO, read(), SPARK);
    expect(result).toMatchObject({ status: "refused" });
    const [row] = await t.admin`select verdict, list_price_cents from menu_drafts where merchant_id = ${m.id}`;
    expect(row).toEqual({ verdict: "not_sgd", list_price_cents: null });
  });

  it("refuses a file that is not an image before any model call, and stores nothing on model failure", async () => {
    const m = await merchant();
    expect(await readMenu(app.db, m.id, Uint8Array.from([1, 2, 3]), read(), SPARK)).toEqual({ status: "not_an_image" });
    expect(bodies).toHaveLength(0);
    script = [{ status: 500 }, { status: 500 }, { status: 500 }];
    expect(await readMenu(app.db, m.id, PHOTO, read(), SPARK)).toEqual({ status: "failed" });
    const [{ n }] = (await t.admin`select count(*)::int as n from menu_drafts where merchant_id = ${m.id}`) as unknown as [{ n: number }];
    expect(n).toBe(0);
    const [calls] = await t.admin`select count(*)::int as n from llm_calls where purpose = ${MENU_VISION_PURPOSE} and not ok`;
    expect(calls?.n).toBe(3);
  });

  it("stops at the daily cap of model attempts, counting failed ones", async () => {
    const m = await merchant();
    for (let i = 0; i < MENU_DAILY_CAP - 1; i++) {
      await t.admin`insert into llm_calls ${t.admin({ provider: "meta", model: SPARK, purpose: MENU_VISION_PURPOSE, attempt: 1, tokens_in: 0, tokens_cached_in: 0, tokens_out: 0, cost_nano_usd: 0, latency_ms: 0, ok: false })}`;
    }
    script = [MENU];
    expect(await readMenu(app.db, m.id, PHOTO, read(), SPARK)).toMatchObject({ status: "ok" });
    expect(await readMenu(app.db, m.id, PHOTO, read(), SPARK)).toEqual({ status: "daily_cap" });
    expect(bodies).toHaveLength(1);
  });

  it("refuses a second read while one holds the lock", async () => {
    const m = await merchant();
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    let entered!: () => void;
    const inside = new Promise<void>((resolve) => (entered = resolve));
    const slow = readMenu(app.db, m.id, PHOTO, async () => {
      entered();
      await held;
      return MENU;
    }, SPARK);
    await inside;
    expect(await readMenu(app.db, m.id, PHOTO, read(), SPARK)).toEqual({ status: "busy" });
    release();
    expect(await slow).toMatchObject({ status: "ok" });
  });
});

describe("confirming and publishing a draft", () => {
  it("publishes the draft's list price with the merchant's terms, and buyers see it with no floor", async () => {
    const m = await merchant();
    const ruleId = await publishedRule(m);
    const [rule] = await t.admin`select list_price_cents, capacity_covers, discount_bps, floor_price_cents, terms_version from rules where id = ${ruleId}`;
    expect(rule).toEqual({ list_price_cents: 1440, capacity_covers: 4, discount_bps: 2500, floor_price_cents: FLOOR, terms_version: 1 });
    const offers = await listOffers(app.db, () => new Date("2026-11-03T09:00:00+08:00"));
    const mine = offers.find((o) => o.offer.ruleId === ruleId);
    expect(mine?.offer).toMatchObject({ listPriceCents: 1440, offerPriceCents: 1080 });
    expect(JSON.stringify(mine)).not.toMatch(new RegExp(`${FLOOR}|9\\.17|capacity`, "i"));
  });

  it("publishes a draft once, and never another merchant's or one that did not count", async () => {
    const m = await merchant();
    const other = await merchant();
    script = [MENU, { ...MENU, cover: { itemIndexes: [5], description: "x" } }];
    const ok = await readMenu(app.db, m.id, PHOTO, read(), SPARK);
    const refused = await readMenu(app.db, m.id, PHOTO, read(), SPARK);
    if (!("draftId" in ok) || !("draftId" in refused)) throw new Error("reads failed");
    expect(refused.status).toBe("refused");
    expect(await publishDraft(app.db, other.id, ok.draftId, TERMS)).toEqual({ status: "not_found" });
    expect(await getDraft(app.db, other.id, ok.draftId)).toBeNull();
    expect(await publishDraft(app.db, m.id, refused.draftId, TERMS)).toEqual({ status: "not_found" });
    expect(await publishDraft(app.db, m.id, "not-a-uuid", TERMS)).toEqual({ status: "not_found" });
    expect(await publishDraft(app.db, m.id, ok.draftId, TERMS)).toMatchObject({ status: "published" });
    expect(await publishDraft(app.db, m.id, ok.draftId, TERMS)).toEqual({ status: "already_published" });
  });

  it("refuses a floor above the offer price and invalid terms, publishing nothing", async () => {
    const m = await merchant();
    script = [MENU];
    const ok = await readMenu(app.db, m.id, PHOTO, read(), SPARK);
    if (!("draftId" in ok)) throw new Error("read failed");
    expect(await publishDraft(app.db, m.id, ok.draftId, { ...TERMS, terms: { ...TERMS.terms, floorPriceCents: 1081 } })).toEqual({ status: "floor_above_offer_price" });
    expect(await publishDraft(app.db, m.id, ok.draftId, { ...TERMS, capacityCovers: 1 })).toMatchObject({ status: "invalid_terms" });
    const [{ n }] = (await t.admin`select count(*)::int as n from rules where merchant_id = ${m.id}`) as unknown as [{ n: number }];
    expect(n).toBe(0);
  });
});

describe("database guards for onboarding", () => {
  async function okDraft(m: { id: string }): Promise<string> {
    script = [MENU];
    const result = await readMenu(app.db, m.id, PHOTO, read(), SPARK);
    if (!("draftId" in result)) throw new Error("read failed");
    return result.draftId;
  }

  const draftRow = (merchantId: string, draft: unknown, listPrice: number | null, verdict = "ok") => ({
    merchant_id: merchantId,
    photo_sha256: "a".repeat(64),
    photo_bytes: 10,
    photo_type: "image/jpeg",
    model: SPARK,
    draft: runtime.json(draft as postgres.JSONValue),
    verdict,
    list_price_cents: listPrice,
  });

  it("refuses a stored list price that is not the sum of the cover's printed prices", async () => {
    const m = await merchant();
    expect(await failure(() => runtime`insert into menu_drafts ${runtime(draftRow(m.id, MENU, 1440))}`)).toBe("no error");
    expect(await failure(() => runtime`insert into menu_drafts ${runtime(draftRow(m.id, MENU, 1441))}`)).toBe("menu_drafts_price_matches");
    const negative = { ...MENU, cover: { itemIndexes: [-1], description: "x" } };
    expect(await failure(() => runtime`insert into menu_drafts ${runtime(draftRow(m.id, negative, 790))}`)).toBe("menu_drafts_price_matches");
    const repeated = { ...MENU, cover: { itemIndexes: [0, 0], description: "x" } };
    expect(await failure(() => runtime`insert into menu_drafts ${runtime(draftRow(m.id, repeated, 1300))}`)).toBe("menu_drafts_price_matches");
    const missing = { ...MENU, cover: { itemIndexes: [3], description: "x" } };
    expect(await failure(() => runtime`insert into menu_drafts ${runtime(draftRow(m.id, missing, 0))}`)).toBe("menu_drafts_price_matches");
    expect(await failure(() => runtime`insert into menu_drafts ${runtime(draftRow(m.id, { ...MENU, currency: "other" }, 1440))}`)).toBe("menu_drafts_price_matches");
    expect(await failure(() => runtime`insert into menu_drafts ${runtime(draftRow(m.id, MENU, 1440, "not_sgd"))}`)).toBe("menu_drafts_price_with_ok");
    expect(await failure(() => runtime`insert into menu_drafts ${runtime(draftRow(m.id, MENU, null, "not_sgd"))}`)).toBe("no error");
  });

  it("gives the runtime role no way to write a rule or a publication except publish_offer", async () => {
    const m = await merchant();
    const draftId = await okDraft(m);
    expect(
      await failure(
        () =>
          runtime`insert into rules ${runtime({ merchant_id: m.id, list_price_cents: 1, capacity_covers: 1, weekday: 2, start_minute: 840, end_minute: 1020, commit_by_minute: 720, discount_bps: 1, min_pool_covers: 1, per_agent_cap_covers: 1, floor_price_cents: 0 })}`,
      ),
    ).toBe("42501");
    const [anyRule] = await t.admin`select id from rules limit 1`;
    if (anyRule) {
      expect(await failure(() => runtime`insert into offer_publications ${runtime({ draft_id: draftId, rule_id: anyRule.id, merchant_id: m.id })}`)).toBe("42501");
      expect(await failure(() => runtime`update rules set discount_bps = 1 where id = ${anyRule.id}`)).toBe("42501");
    }
  });

  it("refuses publish_offer for another merchant's draft and for a floor above the offer price", async () => {
    const m = await merchant();
    const other = await merchant();
    const draftId = await okDraft(m);
    const call = (merchantId: string, floor: number) =>
      runtime`select publish_offer(${merchantId}::uuid, ${draftId}::uuid, gen_random_uuid(), 4, 2::smallint, 840::smallint, 1020::smallint, 720::smallint, 2500, 2, 2, ${floor})`;
    expect(await failure(() => call(other.id, FLOOR))).toBe("publish_offer_draft");
    expect(await failure(() => call(m.id, 1081))).toBe("publish_offer_floor");
    expect(await failure(() => call(m.id, 1080))).toBe("no error");
    const [rule] = await t.admin`select list_price_cents from rules where merchant_id = ${m.id}`;
    expect(rule?.list_price_cents).toBe(1440);
  });

  it("keeps drafts and publications append-only for every role", async () => {
    const m = await merchant();
    await publishedRule(m);
    for (const table of ["menu_drafts", "offer_publications"]) {
      expect(await failure(() => runtime.unsafe(`update ${table} set merchant_id = merchant_id`))).toBe("42501");
      expect(await failure(() => runtime.unsafe(`delete from ${table}`))).toBe("42501");
      expect(await failure(() => t.admin.unsafe(`update ${table} set merchant_id = merchant_id`))).toBe("23001");
      expect(await failure(() => t.admin.unsafe(`delete from ${table}`))).toBe("23001");
      expect(await failure(() => t.admin.unsafe(`truncate ${table} cascade`))).toBe("23001");
    }
  });
});

describe("Muse Wonder merchant agent", () => {
  // Fills the rule's next occurrence to capacity and stores its clearing, as S3's clearing would.
  async function sellOut(ruleId: string, visitDate: string, covers = 4): Promise<void> {
    const [agent] = await t.admin`insert into agents ${t.admin({ id: `a-${randomBytes(4).toString("hex")}`, label: "t", token_sha256: randomBytes(32).toString("hex") })} returning id`;
    const [c] = await t.admin`insert into commitments ${t.admin({ rule_id: ruleId, agent_id: agent!.id, idempotency_key: randomBytes(4).toString("hex"), terms_version: (await t.admin`select terms_version from rules where id = ${ruleId}`)[0]!.terms_version, covers, max_price_per_cover_cents: 1440, visit_at: new Date(`${visitDate}T14:00:00+08:00`), committed_at: new Date(`${visitDate}T09:00:00+08:00`) })} returning id`;
    await t.admin`insert into clearings ${t.admin({ rule_id: ruleId, visit_date: visitDate, terms_version: 1, unlocked: covers >= 2, price_per_cover_cents: 1080 })}`;
    if (covers >= 2) await t.admin`insert into clearing_fills ${t.admin({ commitment_id: c!.id, rule_id: ruleId, visit_date: visitDate, covers, price_per_cover_cents: 1080 })}`;
  }

  const wonder = () => wonderMerchant(provider, WONDER);
  const PLAN: WonderPlan = { discountBps: 2000, capacityCovers: 6, minPoolCovers: 3, perAgentCapCovers: 2, rationale: "Sold out on 2026-11-10; add two covers and trim the discount." };

  it("plans a sellout once from the fill history in Postgres, never seeing the floor, and the merchant applies it", async () => {
    const m = await merchant();
    const ruleId = await publishedRule(m);
    await sellOut(ruleId, "2026-11-03", 1);
    await sellOut(ruleId, "2026-11-10");
    bodies = [];
    script = [PLAN];
    expect(await replanSoldOut(app.db, m, wonder(), WONDER)).toEqual({ status: "planned", planned: 1 });
    expect(bodies).toHaveLength(1);
    const prompt = String((JSON.parse(bodies[0] ?? "{}") as { messages: { content: string }[] }).messages[1]?.content);
    expect(prompt).toContain("2026-11-03: pool not reached");
    expect(prompt).toContain("2026-11-10: 4 covers filled");
    expect(prompt).not.toMatch(new RegExp(`${FLOOR}|9\\.17|floor`, "i"));
    const [plan] = await t.admin`select *, visit_date::text as visit_date from wonder_plans where rule_id = ${ruleId}`;
    expect(plan).toMatchObject({ visit_date: "2026-11-10", verdict: "ok", discount_bps: 2000, capacity_covers: 6, terms_version: 1, model: WONDER });
    const calls = await t.admin`select purpose, model from llm_calls where purpose <> ${MENU_VISION_PURPOSE}`;
    expect(calls).toEqual([{ purpose: WONDER_PLAN_PURPOSE, model: WONDER }]);

    // A reload plans nothing new and calls no model.
    expect(await replanSoldOut(app.db, m, wonder(), WONDER)).toEqual({ status: "planned", planned: 0 });
    expect(bodies).toHaveLength(1);

    expect(await applyPlan(app.db, m.id, String(plan!.id))).toEqual({ status: "applied", termsVersion: 2 });
    const [rule] = await t.admin`select discount_bps, capacity_covers, min_pool_covers, per_agent_cap_covers, floor_price_cents from rules where id = ${ruleId}`;
    expect(rule).toEqual({ discount_bps: 2000, capacity_covers: 6, min_pool_covers: 3, per_agent_cap_covers: 2, floor_price_cents: FLOOR });
    expect(await applyPlan(app.db, m.id, String(plan!.id))).toEqual({ status: "stale" });

    // The next sellout's prompt remembers the applied plan.
    await sellOut(ruleId, "2026-11-17", 6);
    script = [{ ...PLAN, capacityCovers: 8, discountBps: 1500 }];
    await replanSoldOut(app.db, m, wonder(), WONDER);
    expect(bodies.at(-1)).toContain("after 2026-11-10: proposed 20% off, capacity 6, applied");

    // Plans and applications are append-only for every role.
    for (const [table, column] of [
      ["wonder_plans", "model"],
      ["plan_applications", "applied_at"],
    ] as const) {
      expect(await failure(() => runtime.unsafe(`update ${table} set ${column} = ${column}`))).toBe("42501");
      expect(await failure(() => t.admin.unsafe(`update ${table} set ${column} = ${column}`))).toBe("23001");
      expect(await failure(() => t.admin.unsafe(`delete from ${table}`))).toBe("23001");
      expect(await failure(() => t.admin.unsafe(`truncate ${table} cascade`))).toBe("23001");
    }
  });

  it("stores a refused plan with its reason and a failed call as no_proposal, and neither can be applied", async () => {
    const m = await merchant();
    const ruleId = await publishedRule(m);
    await sellOut(ruleId, "2026-11-10");
    await sellOut(ruleId, "2026-11-17");
    script = [{ ...PLAN, discountBps: 3000 }, { status: 400 }];
    expect(await replanSoldOut(app.db, m, wonder(), WONDER)).toEqual({ status: "planned", planned: 2 });
    const plans = await t.admin`select id, visit_date::text as visit_date, verdict, discount_bps from wonder_plans where rule_id = ${ruleId} order by visit_date`;
    expect(plans.map((p) => [p.visit_date, p.verdict, p.discount_bps])).toEqual([
      ["2026-11-10", "deepens_discount", 3000],
      ["2026-11-17", "no_proposal", null],
    ]);
    for (const p of plans) expect(await applyPlan(app.db, m.id, String(p.id))).toEqual({ status: "refused" });
    const [rule] = await t.admin`select discount_bps, terms_version from rules where id = ${ruleId}`;
    expect(rule).toEqual({ discount_bps: 2500, terms_version: 1 });
  });

  it("does not plan an occurrence that unlocked below capacity", async () => {
    const m = await merchant();
    const ruleId = await publishedRule(m);
    await sellOut(ruleId, "2026-11-10", 3);
    expect(await replanSoldOut(app.db, m, wonder(), WONDER)).toEqual({ status: "planned", planned: 0 });
    expect(bodies.filter((b) => b.includes("WonderPlan"))).toHaveLength(0);
  });

  it("stops at the daily cap of Wonder attempts", async () => {
    const m = await merchant();
    const ruleId = await publishedRule(m);
    await sellOut(ruleId, "2026-11-10");
    for (let i = 0; i < PLAN_DAILY_CAP; i++) {
      await t.admin`insert into llm_calls ${t.admin({ provider: "meta", model: WONDER, purpose: WONDER_PLAN_PURPOSE, attempt: 1, tokens_in: 0, tokens_cached_in: 0, tokens_out: 0, cost_nano_usd: 0, latency_ms: 0, ok: false })}`;
    }
    bodies = [];
    expect(await replanSoldOut(app.db, m, wonder(), WONDER)).toEqual({ status: "daily_cap" });
    expect(bodies).toHaveLength(0);
  });

  it("refuses to apply another merchant's plan, a plan while commitments are pending, and a stored plan out of bounds", async () => {
    const m = await merchant();
    const other = await merchant();
    const ruleId = await publishedRule(m);
    await sellOut(ruleId, "2026-11-10");
    script = [PLAN];
    await replanSoldOut(app.db, m, wonder(), WONDER);
    const [plan] = await t.admin`select id from wonder_plans where rule_id = ${ruleId}`;
    expect(await applyPlan(app.db, other.id, String(plan!.id))).toEqual({ status: "not_found" });
    expect(await applyPlan(app.db, m.id, "not-a-uuid")).toEqual({ status: "not_found" });

    // A live commitment on an uncleared occurrence blocks the change; cancelling it unblocks.
    const [agent] = await t.admin`insert into agents ${t.admin({ id: `a-${randomBytes(4).toString("hex")}`, label: "t", token_sha256: randomBytes(32).toString("hex") })} returning id`;
    const [pending] = await t.admin`insert into commitments ${t.admin({ rule_id: ruleId, agent_id: agent!.id, idempotency_key: "p", terms_version: 1, covers: 1, max_price_per_cover_cents: 1440, visit_at: new Date("2026-11-24T14:00:00+08:00"), committed_at: new Date("2026-11-24T09:00:00+08:00") })} returning id`;
    expect(await applyPlan(app.db, m.id, String(plan!.id))).toEqual({ status: "pending" });
    await t.admin`update commitments set cancelled_at = now() where id = ${pending!.id}`;
    expect(await applyPlan(app.db, m.id, String(plan!.id))).toEqual({ status: "applied", termsVersion: 2 });

    // A plan stored "ok" by hand, outside judgePlan's bounds, is refused by apply_wonder_plan itself.
    // The rule is now 20% off, 6 covers, unlocking at 3, at most 2 per agent.
    let day = 17;
    for (const bad of [
      { discount_bps: 2100, capacity_covers: 6, min_pool_covers: 3, per_agent_cap_covers: 2 },
      { discount_bps: 2000, capacity_covers: 13, min_pool_covers: 3, per_agent_cap_covers: 2 },
      { discount_bps: 2000, capacity_covers: 5, min_pool_covers: 3, per_agent_cap_covers: 2 },
      { discount_bps: 2000, capacity_covers: 6, min_pool_covers: 2, per_agent_cap_covers: 2 },
      { discount_bps: 2000, capacity_covers: 6, min_pool_covers: 7, per_agent_cap_covers: 2 },
      { discount_bps: 2000, capacity_covers: 6, min_pool_covers: 3, per_agent_cap_covers: 7 },
    ]) {
      const visitDate = `2026-11-${day++}`;
      await sellOut(ruleId, visitDate, 6);
      const [row] = await runtime`insert into wonder_plans ${runtime({ rule_id: ruleId, visit_date: visitDate, terms_version: 2, model: WONDER, rationale: "x", verdict: "ok", ...bad })} returning id`;
      expect(await applyPlan(app.db, m.id, String(row!.id)), JSON.stringify(bad)).toEqual({ status: "refused" });
    }
    const [rule] = await t.admin`select discount_bps, capacity_covers, terms_version from rules where id = ${ruleId}`;
    expect(rule).toEqual({ discount_bps: 2000, capacity_covers: 6, terms_version: 2 });
  });
});
