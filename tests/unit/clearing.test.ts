import { describe, expect, it } from "vitest";
import { clear } from "@/domain/clearing/clear";
import { ClearingResult } from "@/domain/clearing/schema";
import type { Commitment } from "@/domain/commitments/schema";
import { MerchantRule } from "@/domain/offers/schema";

// 2026-11-03 is a Tuesday. Every instant is written with an explicit offset, so no test depends on
// the host's time zone.
const RULE_ID = "6f1c0a52-3d3e-4c1a-9a43-0d6c1f0b7e11";
const MERCHANT_ID = "0b6e7f3c-5a8d-4d2e-8f61-2c9a4b7d1e05";
const VISIT_DATE = "2026-11-03";

// "25% off Tue 2-5pm if 8 people commit by noon": S$12.50 list, so S$9.38 a cover after the discount.
const PRICE = 938;
type RuleOverrides = { capacityCovers?: number; minPoolCovers?: number; floorPriceCents?: number };
const rule = (overrides: RuleOverrides = {}): MerchantRule =>
  MerchantRule.parse({
    id: RULE_ID,
    merchantId: MERCHANT_ID,
    termsVersion: 2,
    listPriceCents: 1250,
    capacityCovers: overrides.capacityCovers ?? 20,
    terms: {
      window: { weekday: 2, startMinute: 14 * 60, endMinute: 17 * 60, commitByMinute: 12 * 60 },
      discountBps: 2500,
      minPoolCovers: overrides.minPoolCovers ?? 8,
      perAgentCapCovers: 4,
      floorPriceCents: overrides.floorPriceCents ?? 900,
    },
  });

// Each commitment arrives one minute after the one before, from its own agent, unless told otherwise.
let seq = 0;
const commitment = (overrides: Partial<Commitment> = {}): Commitment => {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    ruleId: RULE_ID,
    agentId: `agent-${seq}`,
    termsVersion: 2,
    covers: 1,
    maxPricePerCoverCents: 1250,
    visitAt: new Date("2026-11-03T15:00:00+08:00"),
    committedAt: new Date(Date.parse("2026-11-03T09:00:00+08:00") + seq * 60_000),
    ...overrides,
  };
};
const commitments = (covers: number[]) => covers.map((c) => commitment({ covers: c }));

const filled = (result: ClearingResult) => result.fills.map((f) => f.commitmentId);
const ids = (cs: Commitment[]) => cs.map((c) => c.id);

describe("capacity", () => {
  it("fills every commitment when they meet capacity exactly", () => {
    const cs = commitments([4, 4, 2]);
    const result = clear(rule({ capacityCovers: 10 }), VISIT_DATE, cs);
    expect(result).toEqual({
      ruleId: RULE_ID,
      termsVersion: 2,
      visitDate: VISIT_DATE,
      unlocked: true,
      pricePerCoverCents: PRICE,
      fills: [
        { commitmentId: cs[0]?.id, covers: 4, pricePerCoverCents: PRICE },
        { commitmentId: cs[1]?.id, covers: 4, pricePerCoverCents: PRICE },
        { commitmentId: cs[2]?.id, covers: 2, pricePerCoverCents: PRICE },
      ],
    });
    expect(ClearingResult.parse(result)).toEqual(result);
  });

  it("skips a commitment one cover too big for what is left, whole, and still fills a later one that fits", () => {
    const cs = commitments([4, 4, 2, 1]);
    const result = clear(rule({ capacityCovers: 9 }), VISIT_DATE, cs);
    expect(result.unlocked).toBe(true);
    expect(result.fills).toEqual([
      { commitmentId: cs[0]?.id, covers: 4, pricePerCoverCents: PRICE },
      { commitmentId: cs[1]?.id, covers: 4, pricePerCoverCents: PRICE },
      { commitmentId: cs[3]?.id, covers: 1, pricePerCoverCents: PRICE },
    ]);
  });

  it("fills first come first served, by when each commitment was made, not by array order", () => {
    const early = commitment({ covers: 4, committedAt: new Date("2026-11-03T08:00:00+08:00") });
    const late = commitment({ covers: 4, committedAt: new Date("2026-11-03T11:00:00+08:00") });
    const middle = commitment({ covers: 4, committedAt: new Date("2026-11-03T10:00:00+08:00") });
    const result = clear(rule({ capacityCovers: 8 }), VISIT_DATE, [late, middle, early]);
    expect(filled(result)).toEqual(ids([early, middle]));
  });

  it("breaks a tie in arrival time by the lower id", () => {
    const at = new Date("2026-11-03T10:00:00+08:00");
    const higher = commitment({ id: "00000000-0000-4000-8000-0000000000b2", covers: 4, committedAt: at });
    const lower = commitment({ id: "00000000-0000-4000-8000-0000000000b1", covers: 4, committedAt: at });
    const first = commitment({ covers: 4, committedAt: new Date("2026-11-03T09:00:00+08:00") });
    const result = clear(rule({ capacityCovers: 8 }), VISIT_DATE, [higher, lower, first]);
    expect(filled(result)).toEqual(ids([first, lower]));
  });

  it("counts the per-agent cap in arrival order, not array order", () => {
    // The agent's later 4 covers would be over its cap of 4 once the earlier 2 are held.
    const later = commitment({ agentId: "agent-x", covers: 4, committedAt: new Date("2026-11-03T11:00:00+08:00") });
    const earlier = commitment({ agentId: "agent-x", covers: 2, committedAt: new Date("2026-11-03T08:00:00+08:00") });
    const others = commitments([4, 2]);
    const result = clear(rule(), VISIT_DATE, [later, ...others, earlier]);
    expect(filled(result)).toEqual(ids([earlier, ...others]));
  });
});

describe("buyer max price", () => {
  it("fills a buyer whose max is the price and skips one whose max is a cent below", () => {
    const atPrice = commitment({ covers: 4, maxPricePerCoverCents: PRICE });
    const centBelow = commitment({ covers: 4, maxPricePerCoverCents: PRICE - 1 });
    const rest = commitments([4]);
    const result = clear(rule(), VISIT_DATE, [atPrice, centBelow, ...rest]);
    expect(result.unlocked).toBe(true);
    expect(filled(result)).toEqual(ids([atPrice, ...rest]));
  });

  it("frees the capacity a priced-out buyer would have taken for a later one", () => {
    const pricedOut = commitment({ covers: 4, maxPricePerCoverCents: PRICE - 1 });
    const cs = commitments([4, 4]);
    const result = clear(rule({ capacityCovers: 8 }), VISIT_DATE, [pricedOut, ...cs]);
    expect(filled(result)).toEqual(ids(cs));
  });

  it("does not count a priced-out commitment toward its agent's cap", () => {
    // Alone, the priced-out 4 covers would use up the agent's cap of 4 and refuse its later 4.
    const pricedOut = commitment({ agentId: "agent-x", covers: 4, maxPricePerCoverCents: PRICE - 1 });
    const later = commitment({ agentId: "agent-x", covers: 4 });
    const result = clear(rule({ minPoolCovers: 4 }), VISIT_DATE, [pricedOut, later]);
    expect(result).toMatchObject({ unlocked: true, fills: [{ commitmentId: later.id, covers: 4 }] });
  });
});

describe("hidden floor", () => {
  it("clears with the floor at the price and clears nothing with the floor a cent above it", () => {
    const cs = commitments([4, 4]);
    expect(clear(rule({ floorPriceCents: PRICE }), VISIT_DATE, cs)).toMatchObject({ unlocked: true, fills: [{ covers: 4 }, { covers: 4 }] });
    expect(clear(rule({ floorPriceCents: PRICE + 1 }), VISIT_DATE, cs)).toMatchObject({ unlocked: false, fills: [] });
  });
});

describe("minimum pool after trimming", () => {
  it("unlocks when the filled covers are exactly the minimum", () => {
    const result = clear(rule({ capacityCovers: 8, minPoolCovers: 8 }), VISIT_DATE, commitments([4, 4, 4]));
    expect(result.unlocked).toBe(true);
    expect(result.fills.reduce((sum, f) => sum + f.covers, 0)).toBe(8);
  });

  it("stays locked when capacity leaves fewer covers than the minimum", () => {
    // The pool reaches 11, but after 4 and 3 only 1 cover is left, and the last 4 do not fit.
    const result = clear(rule({ capacityCovers: 8, minPoolCovers: 8 }), VISIT_DATE, commitments([4, 3, 4]));
    expect(result).toMatchObject({ unlocked: false, fills: [], pricePerCoverCents: PRICE });
  });

  it("stays locked when a buyer's max price drops the pool below the minimum", () => {
    const cs = [...commitments([4, 3]), commitment({ covers: 1, maxPricePerCoverCents: PRICE - 1 })];
    expect(clear(rule(), VISIT_DATE, cs)).toMatchObject({ unlocked: false, fills: [] });
  });

  it("leaves commitments refused on their terms out of the fills and the pool", () => {
    const stale = commitment({ covers: 4, termsVersion: 1 });
    const late = commitment({ covers: 4, committedAt: new Date("2026-11-03T12:00:00+08:00") });
    const cs = commitments([4, 4]);
    expect(filled(clear(rule(), VISIT_DATE, [stale, late, ...cs]))).toEqual(ids(cs));
    expect(clear(rule(), VISIT_DATE, [stale, late, cs[0] as Commitment])).toMatchObject({ unlocked: false, fills: [] });
  });
});

describe("empty pool", () => {
  it("is locked, fills nothing and still parses as a result", () => {
    const result = clear(rule(), VISIT_DATE, []);
    expect(result).toEqual({ ruleId: RULE_ID, termsVersion: 2, visitDate: VISIT_DATE, unlocked: false, pricePerCoverCents: PRICE, fills: [] });
    expect(ClearingResult.parse(result)).toEqual(result);
  });
});

describe("caller input", () => {
  it("does not reorder the caller's array", () => {
    const cs = commitments([1, 2, 3]).reverse();
    const before = ids(cs);
    clear(rule(), VISIT_DATE, cs);
    expect(ids(cs)).toEqual(before);
  });

  it("names the occurrence it cleared", () => {
    const nextWeek = [4, 4].map((covers) => commitment({ covers, visitAt: new Date("2026-11-10T15:00:00+08:00"), committedAt: new Date("2026-11-10T09:00:00+08:00") }));
    expect(clear(rule(), "2026-11-10", nextWeek)).toMatchObject({ visitDate: "2026-11-10", unlocked: true, fills: [{ covers: 4 }, { covers: 4 }] });
  });

  it("refuses two commitments with one id rather than filling the id twice", () => {
    const first = commitment({ covers: 4 });
    const twin = commitment({ id: first.id, covers: 4 });
    expect(() => clear(rule(), VISIT_DATE, [first, twin])).toThrow("each commitment fills at most once");
  });

  it("refuses a visit date that is not an ISO date", () => {
    expect(() => clear(rule(), "2026-11-3", [])).toThrow("Invalid ISO date");
  });

  it("refuses commitments from another occurrence", () => {
    const nextWeek = commitment({ visitAt: new Date("2026-11-10T15:00:00+08:00") });
    expect(() => clear(rule(), VISIT_DATE, [nextWeek])).toThrow("commitment is for another occurrence");
  });
});

describe("negotiated price (S5)", () => {
  it("fills a negotiated commitment at its own price and the rest at the offer price", () => {
    const negotiated = commitment({ covers: 4, negotiatedPriceCents: 907 });
    const rest = commitments([4]);
    const result = clear(rule(), VISIT_DATE, [negotiated, ...rest]);
    expect(result).toMatchObject({ unlocked: true, pricePerCoverCents: PRICE });
    expect(result.fills).toEqual([
      { commitmentId: negotiated.id, covers: 4, pricePerCoverCents: 907 },
      { commitmentId: rest[0]?.id, covers: 4, pricePerCoverCents: PRICE },
    ]);
  });

  it("fills a buyer whose max is below the offer price but at its negotiated price, and skips one a cent below", () => {
    const atOwn = commitment({ covers: 4, maxPricePerCoverCents: 907, negotiatedPriceCents: 907 });
    const centBelow = commitment({ covers: 4, maxPricePerCoverCents: 906, negotiatedPriceCents: 907 });
    const rest = commitments([4]);
    expect(filled(clear(rule(), VISIT_DATE, [atOwn, centBelow, ...rest]))).toEqual(ids([atOwn, ...rest]));
  });

  it("skips a negotiated price below a floor raised after it was agreed, and fills one at the floor", () => {
    const atFloor = commitment({ covers: 4, negotiatedPriceCents: 910 });
    const centBelow = commitment({ covers: 4, negotiatedPriceCents: 909 });
    const rest = commitments([4]);
    expect(filled(clear(rule({ floorPriceCents: 910 }), VISIT_DATE, [atFloor, centBelow, ...rest]))).toEqual(ids([atFloor, ...rest]));
  });

  it("skips a negotiated price above the offer price", () => {
    const above = commitment({ covers: 4, negotiatedPriceCents: PRICE + 1 });
    const atOffer = commitment({ covers: 4, negotiatedPriceCents: PRICE });
    const rest = commitments([4]);
    expect(filled(clear(rule(), VISIT_DATE, [above, atOffer, ...rest]))).toEqual(ids([atOffer, ...rest]));
  });
});
