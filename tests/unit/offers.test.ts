import { afterEach, describe, expect, it } from "vitest";
import type { Commitment } from "@/domain/commitments/schema";
import { evaluateCommitment, evaluatePool, inWindow, offerPriceCents, toOffer } from "@/domain/offers/evaluate";
import { MerchantRule, Offer, type Window } from "@/domain/offers/schema";
import { singaporeLocal } from "@/domain/singapore-time";

// 2026-11-03 is a Tuesday. Every instant is written with an explicit offset, so no test depends on
// the host's time zone.
const RULE_ID = "6f1c0a52-3d3e-4c1a-9a43-0d6c1f0b7e11";
const MERCHANT_ID = "0b6e7f3c-5a8d-4d2e-8f61-2c9a4b7d1e05";

// "25% off Tue 2-5pm if 8 people commit by noon": S$12.50 list, at most 4 covers per agent.
const rule = (overrides: { termsVersion?: number; floorPriceCents?: number; window?: Partial<Window> } = {}): MerchantRule =>
  MerchantRule.parse({
    id: RULE_ID,
    merchantId: MERCHANT_ID,
    termsVersion: overrides.termsVersion ?? 2,
    listPriceCents: 1250,
    capacityCovers: 20,
    terms: {
      window: { weekday: 2, startMinute: 14 * 60, endMinute: 17 * 60, commitByMinute: 12 * 60, ...overrides.window },
      discountBps: 2500,
      minPoolCovers: 8,
      perAgentCapCovers: 4,
      floorPriceCents: overrides.floorPriceCents ?? 900,
    },
  });

let seq = 0;
const commitment = (overrides: Partial<Commitment> = {}): Commitment => ({
  id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
  ruleId: RULE_ID,
  agentId: "agent-a",
  termsVersion: 2,
  covers: 1,
  maxPricePerCoverCents: 1250,
  visitAt: new Date("2026-11-03T15:00:00+08:00"),
  committedAt: new Date("2026-11-03T09:00:00+08:00"),
  ...overrides,
});

const verdict = (r: MerchantRule, c: Commitment, held = 0) => evaluateCommitment(r, c, held);

describe("window edges in Asia/Singapore", () => {
  const visit = (iso: string) => verdict(rule(), commitment({ visitAt: new Date(iso) }));

  it("includes the start and excludes the end", () => {
    expect(visit("2026-11-03T13:59:59+08:00")).toEqual({ ok: false, reason: "outside_window" });
    expect(visit("2026-11-03T14:00:00+08:00")).toEqual({ ok: true });
    expect(visit("2026-11-03T16:59:59.999+08:00")).toEqual({ ok: true });
    expect(visit("2026-11-03T17:00:00+08:00")).toEqual({ ok: false, reason: "outside_window" });
  });

  it("reads the instant in Singapore time, not UTC", () => {
    // 06:00Z is 14:00 in Singapore; 09:00Z is 17:00.
    expect(visit("2026-11-03T06:00:00Z")).toEqual({ ok: true });
    expect(visit("2026-11-03T09:00:00Z")).toEqual({ ok: false, reason: "outside_window" });
    // Same time of day on Wednesday.
    expect(visit("2026-11-04T15:00:00+08:00")).toEqual({ ok: false, reason: "outside_window" });
  });

  it("handles windows that touch midnight", () => {
    const late = rule({ window: { startMinute: 22 * 60, endMinute: 1440 } });
    expect(inWindow(late.terms.window, new Date("2026-11-03T23:59:59+08:00"))).toBe(true);
    expect(inWindow(late.terms.window, new Date("2026-11-04T00:00:00+08:00"))).toBe(false);

    const early = rule({ window: { startMinute: 0, endMinute: 120, commitByMinute: 0 } });
    // 16:00Z on Monday is 00:00 on Tuesday in Singapore.
    expect(inWindow(early.terms.window, new Date("2026-11-02T16:00:00Z"))).toBe(true);
    expect(inWindow(early.terms.window, new Date("2026-11-02T23:59:59+08:00"))).toBe(false);
  });

  describe("with the host in New York", () => {
    const saved = process.env.TZ;
    afterEach(() => {
      if (saved === undefined) delete process.env.TZ;
      else process.env.TZ = saved;
    });

    it("gives the same answers as in Singapore", () => {
      process.env.TZ = "America/New_York";
      // The host clock really moved: 14:00 in Singapore is 01:00 in New York.
      expect(new Date("2026-11-03T14:00:00+08:00").getHours()).toBe(1);
      expect(singaporeLocal(new Date("2026-11-03T14:00:00+08:00"))).toEqual({ date: "2026-11-03", weekday: 2, minute: 840 });
      expect(visit("2026-11-03T14:00:00+08:00")).toEqual({ ok: true });
      expect(visit("2026-11-03T17:00:00+08:00")).toEqual({ ok: false, reason: "outside_window" });
    });
  });

  it("refuses an invalid instant", () => {
    expect(() => singaporeLocal(new Date(Number.NaN))).toThrow("invalid instant");
  });
});

describe("commit deadline", () => {
  const made = (iso: string, r = rule(), visitAt?: string) =>
    verdict(r, commitment({ committedAt: new Date(iso), ...(visitAt ? { visitAt: new Date(visitAt) } : {}) }));

  it("accepts a commitment before noon on the day and refuses one at noon", () => {
    expect(made("2026-11-03T11:59:59+08:00")).toEqual({ ok: true });
    expect(made("2026-11-03T12:00:00+08:00")).toEqual({ ok: false, reason: "past_deadline" });
  });

  it("compares Singapore days, so the day before is in time and the day after is late", () => {
    // 15:00Z on Monday is 23:00 on Monday in Singapore.
    expect(made("2026-11-02T15:00:00Z")).toEqual({ ok: true });
    // 16:30Z on Monday is 00:30 on Tuesday in Singapore: same day, before noon.
    expect(made("2026-11-02T16:30:00Z")).toEqual({ ok: true });
    expect(made("2026-11-04T09:00:00+08:00")).toEqual({ ok: false, reason: "past_deadline" });
  });

  it("treats a midnight deadline as the end of the day before", () => {
    const midnight = rule({ window: { startMinute: 0, endMinute: 120, commitByMinute: 0 } });
    expect(made("2026-11-02T23:59:59+08:00", midnight, "2026-11-03T01:00:00+08:00")).toEqual({ ok: true });
    expect(made("2026-11-03T00:00:00+08:00", midnight, "2026-11-03T01:00:00+08:00")).toEqual({ ok: false, reason: "past_deadline" });
  });
});

describe("terms version", () => {
  it("refuses a commitment made against older or unknown terms", () => {
    expect(verdict(rule({ termsVersion: 2 }), commitment({ termsVersion: 2 }))).toEqual({ ok: true });
    expect(verdict(rule({ termsVersion: 2 }), commitment({ termsVersion: 1 }))).toEqual({ ok: false, reason: "stale_terms" });
    expect(verdict(rule({ termsVersion: 2 }), commitment({ termsVersion: 3 }))).toEqual({ ok: false, reason: "stale_terms" });
  });

  it("refuses to evaluate a commitment for another rule", () => {
    expect(() => verdict(rule(), commitment({ ruleId: MERCHANT_ID }))).toThrow("commitment is for another rule");
  });
});

describe("per-agent cap", () => {
  it("accepts covers up to the cap, counting what the agent already holds", () => {
    expect(verdict(rule(), commitment({ covers: 4 }))).toEqual({ ok: true });
    expect(verdict(rule(), commitment({ covers: 5 }))).toEqual({ ok: false, reason: "over_agent_cap" });
    expect(verdict(rule(), commitment({ covers: 2 }), 2)).toEqual({ ok: true });
    expect(verdict(rule(), commitment({ covers: 3 }), 2)).toEqual({ ok: false, reason: "over_agent_cap" });
  });
});

describe("hidden floor", () => {
  it("rounds the discount down, so the fraction stays with the merchant", () => {
    // 25% of 1250 is 312.5; the discount is 312.
    expect(offerPriceCents(rule())).toBe(938);
  });

  it("accepts a price at or above the floor and refuses one below it", () => {
    expect(verdict(rule({ floorPriceCents: 937 }), commitment())).toEqual({ ok: true });
    expect(verdict(rule({ floorPriceCents: 938 }), commitment())).toEqual({ ok: true });
    expect(verdict(rule({ floorPriceCents: 939 }), commitment())).toEqual({ ok: false, reason: "below_floor" });
  });
});

describe("minimum pool", () => {
  const pool = (covers: number[]) =>
    evaluatePool(
      rule(),
      "2026-11-03",
      covers.map((c, i) => commitment({ agentId: `agent-${i}`, covers: c })),
    );

  it("unlocks at the minimum covers and not below it", () => {
    expect(pool([4, 3])).toMatchObject({ totalCovers: 7, unlocked: false });
    expect(pool([4, 4])).toMatchObject({ totalCovers: 8, unlocked: true });
    expect(pool([4, 4, 1])).toMatchObject({ totalCovers: 9, unlocked: true });
  });

  it("counts an agent's covers across its commitments and leaves refused ones out of the pool", () => {
    const first = commitment({ agentId: "agent-a", covers: 3 });
    const second = commitment({ agentId: "agent-a", covers: 2 });
    const stale = commitment({ agentId: "agent-b", covers: 4, termsVersion: 1 });
    const others = [commitment({ agentId: "agent-c", covers: 4 }), commitment({ agentId: "agent-d", covers: 1 })];
    const result = evaluatePool(rule(), "2026-11-03", [first, second, stale, ...others]);
    expect(result.accepted.map((c) => c.id)).toEqual([first.id, others[0]?.id, others[1]?.id]);
    expect(result.refused).toEqual([
      { commitmentId: second.id, reason: "over_agent_cap" },
      { commitmentId: stale.id, reason: "stale_terms" },
    ]);
    expect(result).toMatchObject({ totalCovers: 8, unlocked: true });
  });

  it("refuses to pool commitments from another occurrence", () => {
    const nextWeek = commitment({ visitAt: new Date("2026-11-10T15:00:00+08:00") });
    expect(() => evaluatePool(rule(), "2026-11-03", [commitment(), nextWeek])).toThrow("commitment is for another occurrence");
  });
});

describe("public offer", () => {
  it("carries the public terms and never the floor or capacity", () => {
    const offer = toOffer(rule({ floorPriceCents: 917 }));
    expect(offer).toEqual({
      ruleId: RULE_ID,
      merchantId: MERCHANT_ID,
      termsVersion: 2,
      listPriceCents: 1250,
      offerPriceCents: 938,
      discountBps: 2500,
      window: { weekday: 2, startMinute: 840, endMinute: 1020, commitByMinute: 720 },
      minPoolCovers: 8,
      perAgentCapCovers: 4,
    });
    const json = JSON.stringify(offer);
    expect(json).not.toMatch(/floor|capacity/i);
    expect(json).not.toContain("917");
    expect(Offer.safeParse(offer).success).toBe(true);
  });

  it("refuses to parse an offer that carries a floor", () => {
    const offer = toOffer(rule());
    expect(Offer.safeParse({ ...offer, floorPriceCents: 900 }).success).toBe(false);
  });
});
