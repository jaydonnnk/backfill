import { describe, expect, it } from "vitest";
import { judgeDraft, judgePhoto, MenuDraft, ruleFromDraft, type RuleSettings, sniffPhoto } from "@/domain/onboarding/menu";
import { judgePlan, planned, WonderPlan } from "@/domain/onboarding/replan";
import type { MerchantRule } from "@/domain/offers/schema";
import { planPrompt, type PlanMemory } from "@/lib/onboarding/models";

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);

describe("menu photo", () => {
  it("knows a JPEG, PNG and WebP by their bytes, whatever the name says", () => {
    expect(sniffPhoto(JPEG)).toBe("image/jpeg");
    expect(sniffPhoto(PNG)).toBe("image/png");
    expect(sniffPhoto(WEBP)).toBe("image/webp");
    expect(sniffPhoto(Uint8Array.from([0x47, 0x49, 0x46, 0x38]))).toBeNull();
    // RIFF with another form type is not WebP.
    expect(sniffPhoto(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45]))).toBeNull();
    expect(sniffPhoto(PNG.slice(0, 7))).toBeNull();
    // A JPEG needs all three marker bytes.
    expect(sniffPhoto(Uint8Array.from([0xff, 0xd8, 0x00, 0xe0]))).toBeNull();
  });

  it("refuses an empty, oversized or non-image file and takes one at exactly the 4 MiB limit", () => {
    expect(judgePhoto(new Uint8Array())).toEqual({ ok: false, reason: "empty" });
    expect(judgePhoto(Uint8Array.from([1, 2, 3]))).toEqual({ ok: false, reason: "not_an_image" });
    // Literal sizes, so the limit cannot move without this test, the database check and the upload text moving too.
    const atLimit = new Uint8Array(4 * 1024 * 1024);
    atLimit.set(JPEG);
    expect(judgePhoto(atLimit)).toEqual({ ok: true, mediaType: "image/jpeg" });
    const over = new Uint8Array(4 * 1024 * 1024 + 1);
    over.set(JPEG);
    expect(judgePhoto(over)).toEqual({ ok: false, reason: "too_large" });
  });
});

const draft = (overrides: Partial<MenuDraft> = {}): MenuDraft => ({
  currency: "SGD",
  items: [
    { name: "Iced latte", priceCents: 650 },
    { name: "Truffle fries", priceCents: 1200 },
    { name: "Burnt cheesecake", priceCents: 790 },
  ],
  cover: { itemIndexes: [0, 2], description: "Iced latte and a slice of cheesecake" },
  ...overrides,
});

describe("menu draft", () => {
  it("prices a cover as the sum of its items' printed prices", () => {
    expect(judgeDraft(draft())).toEqual({ ok: true, listPriceCents: 1440 });
    expect(judgeDraft(draft({ cover: { itemIndexes: [1], description: "Fries" } }))).toEqual({ ok: true, listPriceCents: 1200 });
  });

  it("refuses prices that are not SGD, an empty menu, and a cover naming a missing or repeated item", () => {
    expect(judgeDraft(draft({ currency: "other" }))).toEqual({ ok: false, reason: "not_sgd" });
    expect(judgeDraft(draft({ items: [] }))).toEqual({ ok: false, reason: "no_items" });
    expect(judgeDraft(draft({ cover: { itemIndexes: [3], description: "x" } }))).toEqual({ ok: false, reason: "cover_item_missing" });
    expect(judgeDraft(draft({ cover: { itemIndexes: [2], description: "x" } }))).toEqual({ ok: true, listPriceCents: 790 });
    expect(judgeDraft(draft({ cover: { itemIndexes: [0, 0], description: "x" } }))).toEqual({ ok: false, reason: "cover_item_repeated" });
  });

  it("is strict: a model reply with a list price of its own, a float price or a price over S$500 fails to parse", () => {
    expect(MenuDraft.safeParse({ ...draft(), listPriceCents: 1 }).success).toBe(false);
    expect(MenuDraft.safeParse(draft({ items: [{ name: "Latte", priceCents: 6.5 }] })).success).toBe(false);
    expect(MenuDraft.safeParse(draft({ items: [{ name: "Latte", priceCents: 50_001 }] })).success).toBe(false);
    expect(MenuDraft.safeParse(draft({ items: [{ name: "Latte", priceCents: 50_000 }] })).success).toBe(true);
    expect(MenuDraft.safeParse(draft({ cover: { itemIndexes: [0, 1, 2, 0, 1], description: "x" } })).success).toBe(false);
    expect(MenuDraft.safeParse(draft({ cover: { itemIndexes: [-1], description: "x" } })).success).toBe(false);
  });
});

const settings = (overrides: Partial<RuleSettings["terms"]> = {}, capacityCovers = 20): RuleSettings => ({
  capacityCovers,
  terms: { window: { weekday: 2, startMinute: 840, endMinute: 1020, commitByMinute: 720 }, discountBps: 2500, minPoolCovers: 8, perAgentCapCovers: 4, floorPriceCents: 1000, ...overrides },
});
const ids = { ruleId: "00000000-0000-4000-8000-000000000001", merchantId: "00000000-0000-4000-8000-000000000002" };

describe("publishing a draft", () => {
  it("builds the rule at the draft's list price, with the merchant's terms, at terms version 1", () => {
    const verdict = ruleFromDraft(1440, settings(), ids);
    expect(verdict).toEqual({ ok: true, rule: { id: ids.ruleId, merchantId: ids.merchantId, termsVersion: 1, listPriceCents: 1440, ...settings() } });
  });

  it("refuses a floor above the offer price, and takes one equal to it", () => {
    // 25% off S$14.40 is S$10.80.
    expect(ruleFromDraft(1440, settings({ floorPriceCents: 1081 }), ids)).toEqual({ ok: false, reason: "floor_above_offer_price" });
    expect(ruleFromDraft(1440, settings({ floorPriceCents: 1080 }), ids).ok).toBe(true);
  });

  it("refuses terms the rule schema refuses, naming the problem", () => {
    const verdict = ruleFromDraft(1440, settings({ minPoolCovers: 21 }), ids);
    expect(verdict).toMatchObject({ ok: false, reason: "invalid_terms", problems: [expect.stringContaining("minimum pool")] });
    expect(ruleFromDraft(1440, settings({ window: { weekday: 2, startMinute: 840, endMinute: 840, commitByMinute: 720 } }), ids).ok).toBe(false);
  });
});

const rule: MerchantRule = { id: ids.ruleId, merchantId: ids.merchantId, termsVersion: 3, listPriceCents: 1440, ...settings() };
const plan = (overrides: Partial<WonderPlan> = {}): WonderPlan => ({ discountBps: 2000, capacityCovers: 30, minPoolCovers: 10, perAgentCapCovers: 4, rationale: "Sold out twice.", ...overrides });

describe("Wonder re-plan after a sellout", () => {
  it("takes more capacity, a bigger pool and a smaller discount", () => {
    expect(judgePlan(rule, plan())).toEqual({ ok: true });
    expect(judgePlan(rule, plan({ discountBps: 2500, capacityCovers: 20, minPoolCovers: 8, perAgentCapCovers: 2 }))).toEqual({ ok: true });
    expect(planned(rule, plan())).toEqual({ ...rule, capacityCovers: 30, terms: { ...rule.terms, discountBps: 2000, minPoolCovers: 10, perAgentCapCovers: 4 } });
  });

  it("is strict: a plan with a field of its own fails to parse", () => {
    expect(WonderPlan.safeParse(plan()).success).toBe(true);
    expect(WonderPlan.safeParse({ ...plan(), floorPriceCents: 900 }).success).toBe(false);
  });

  it("refuses a plan that changes nothing", () => {
    expect(judgePlan(rule, plan({ discountBps: 2500, capacityCovers: 20, minPoolCovers: 8, perAgentCapCovers: 4 }))).toEqual({ ok: false, reason: "unchanged" });
  });

  it("refuses a bigger discount, less capacity, more than double the capacity, and a smaller pool", () => {
    expect(judgePlan(rule, plan({ discountBps: 2501 }))).toEqual({ ok: false, reason: "deepens_discount" });
    expect(judgePlan(rule, plan({ capacityCovers: 19 }))).toEqual({ ok: false, reason: "capacity_out_of_range" });
    expect(judgePlan(rule, plan({ capacityCovers: 40 }))).toEqual({ ok: true });
    expect(judgePlan(rule, plan({ capacityCovers: 41 }))).toEqual({ ok: false, reason: "capacity_out_of_range" });
    expect(judgePlan(rule, plan({ minPoolCovers: 7 }))).toEqual({ ok: false, reason: "lowers_min_pool" });
  });

  it("refuses a pool or per-agent cap above the planned capacity", () => {
    expect(judgePlan(rule, plan({ minPoolCovers: 31 }))).toEqual({ ok: false, reason: "min_pool_above_capacity" });
    expect(judgePlan(rule, plan({ minPoolCovers: 30, perAgentCapCovers: 31 }))).toEqual({ ok: false, reason: "cap_above_capacity" });
    expect(judgePlan(rule, plan({ perAgentCapCovers: 30 }))).toEqual({ ok: true });
  });

  it("refuses a plan whose offer price is below a floor raised since publishing", () => {
    // 20% off S$14.40 is S$11.52.
    const raised = { ...rule, terms: { ...rule.terms, floorPriceCents: 1153 } };
    expect(judgePlan(raised, plan())).toEqual({ ok: false, reason: "below_floor" });
    expect(judgePlan({ ...rule, terms: { ...rule.terms, floorPriceCents: 1152 } }, plan())).toEqual({ ok: true });
  });

  it("gives Wonder the fill history and its past plans, and never the floor", () => {
    const memory: PlanMemory = {
      merchantName: "Singapore Test Restaurant",
      listPriceCents: 1440,
      capacityCovers: 20,
      discountBps: 2500,
      minPoolCovers: 8,
      perAgentCapCovers: 4,
      window: "Tuesday 14:00-17:00, commit by 12:00 Singapore time",
      soldOutDate: "2026-11-10",
      fills: [
        { visitDate: "2026-11-03", unlocked: false, covers: 0 },
        { visitDate: "2026-11-10", unlocked: true, covers: 20 },
      ],
      plans: [{ visitDate: "2026-10-27", verdict: "deepens_discount", applied: false, discountBps: 3000, capacityCovers: 20 }],
    };
    const prompt = planPrompt(memory);
    expect(prompt).toContain("2026-11-03: pool not reached");
    expect(prompt).toContain("2026-11-10: 20 covers filled");
    expect(prompt).toContain("after 2026-10-27: refused (deepens_discount)");
    expect(prompt).toContain("sold out");
    expect(prompt).not.toMatch(/floor|1000|10\.00/i);
  });
});
