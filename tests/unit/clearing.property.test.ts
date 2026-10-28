import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { clear } from "@/domain/clearing/clear";
import { ClearingResult } from "@/domain/clearing/schema";
import type { Commitment } from "@/domain/commitments/schema";
import { evaluatePool, offerPriceCents } from "@/domain/offers/evaluate";
import { MerchantRule } from "@/domain/offers/schema";

// A fixed seed makes every run, and every failure, reproducible. 2000 runs per property.
const RUN = { seed: 20261028, numRuns: 2000 };

const RULE_ID = "6f1c0a52-3d3e-4c1a-9a43-0d6c1f0b7e11";
const VISIT_DATE = "2026-11-03";
// Tuesday 2026-11-03, 14:00 to 17:00 Singapore time, commitments due by noon.
const WINDOW = { weekday: 2, startMinute: 14 * 60, endMinute: 17 * 60, commitByMinute: 12 * 60 };
const MONDAY_NOON = Date.parse("2026-11-02T12:00:00+08:00");
const QUARTER_HOUR = 15 * 60_000;

const ruleArb = fc
  .record({
    termsVersion: fc.integer({ min: 1, max: 3 }),
    listPriceCents: fc.integer({ min: 0, max: 3000 }),
    discountBps: fc.integer({ min: 1, max: 9999 }),
    // Squared, so the floor sits at or below the offer price in about two cases out of three.
    floorShare: fc.double({ min: 0, max: 1, noNaN: true }).map((x) => x * x),
    capacityCovers: fc.integer({ min: 1, max: 30 }),
    // A share of capacity, so the minimum pool is never above it, as MerchantRule requires.
    minPoolShare: fc.double({ min: 0, max: 1, noNaN: true }),
    perAgentCapCovers: fc.integer({ min: 1, max: 8 }),
  })
  .map((r) =>
    MerchantRule.parse({
      id: RULE_ID,
      merchantId: "0b6e7f3c-5a8d-4d2e-8f61-2c9a4b7d1e05",
      termsVersion: r.termsVersion,
      listPriceCents: r.listPriceCents,
      capacityCovers: r.capacityCovers,
      terms: {
        window: WINDOW,
        discountBps: r.discountBps,
        minPoolCovers: Math.max(1, Math.ceil(r.minPoolShare * Math.min(20, r.capacityCovers))),
        perAgentCapCovers: r.perAgentCapCovers,
        floorPriceCents: Math.floor(r.floorShare * r.listPriceCents),
      },
    }),
  );

// Commitments for the rule's Tuesday, most of them valid. About one in ten has stale terms, about
// one in seven a visit outside the window and one in twenty a late commitment (Tuesday noon is
// quarter 96). Arrival times fall on quarter hours, so ties are common.
const commitmentsArb = fc.uniqueArray(
  fc.record({
    n: fc.integer({ min: 1, max: 999_999 }),
    agent: fc.constantFrom("a", "b", "c", "d", "e", "f"),
    stale: fc.integer({ min: 0, max: 9 }).map((x) => x === 0),
    covers: fc.integer({ min: 1, max: 6 }),
    maxPricePerCoverCents: fc.integer({ min: 0, max: 3000 }),
    visitMinute: fc.integer({ min: 13 * 60 + 45, max: 17 * 60 + 15 }),
    quarters: fc.integer({ min: 0, max: 100 }),
  }),
  { maxLength: 25, selector: (c) => c.n },
);

type RawCommitments = typeof commitmentsArb extends fc.Arbitrary<infer T> ? T : never;

const toCommitments = (rule: MerchantRule, raw: RawCommitments): Commitment[] =>
  raw.map((c) => ({
    id: `00000000-0000-4000-8000-${String(c.n).padStart(12, "0")}`,
    ruleId: RULE_ID,
    agentId: `agent-${c.agent}`,
    termsVersion: c.stale ? rule.termsVersion + 1 : rule.termsVersion,
    covers: c.covers,
    maxPricePerCoverCents: c.maxPricePerCoverCents,
    visitAt: new Date(Date.parse("2026-11-03T00:00:00+08:00") + c.visitMinute * 60_000),
    committedAt: new Date(MONDAY_NOON + c.quarters * QUARTER_HOUR),
  }));

const caseArb = fc.tuple(ruleArb, commitmentsArb).map(([rule, raw]) => ({ rule, commitments: toCommitments(rule, raw) }));

const coversOf = (result: ClearingResult) => result.fills.reduce((sum, f) => sum + f.covers, 0);

// Arrival order as the decision states it: when the commitment was made, then the id.
const inArrivalOrder = (cs: readonly Commitment[]) =>
  [...cs].sort((a, b) => a.committedAt.getTime() - b.committedAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

// What evaluatePool accepts from the commitments a buyer at the offer price would take, in arrival
// order: the only commitments clearing may fill.
const eligible = (rule: MerchantRule, cs: readonly Commitment[]) =>
  evaluatePool(rule, VISIT_DATE, inArrivalOrder(cs.filter((c) => c.maxPricePerCoverCents >= offerPriceCents(rule)))).accepted;

describe("clearing properties", () => {
  it("generates enough of each kind of case that no property below holds vacuously", () => {
    // With this seed: 1021 unlocked, 450 unlocked after capacity or a buyer's max dropped an accepted
    // commitment, 247 that evaluatePool unlocked but clearing left locked, and 50 where a priced-out
    // commitment, left in, would change which affordable commitments evaluatePool accepts.
    const ids = (cs: readonly Commitment[]) => cs.map((c) => c.id).join();
    const cases = fc.sample(caseArb, RUN).map(({ rule, commitments }) => {
      const pool = evaluatePool(rule, VISIT_DATE, inArrivalOrder(commitments));
      const affordableInPool = pool.accepted.filter((c) => c.maxPricePerCoverCents >= offerPriceCents(rule));
      return { result: clear(rule, VISIT_DATE, commitments), pool, pricedOutMatters: ids(affordableInPool) !== ids(eligible(rule, commitments)) };
    });
    expect(cases.filter((c) => c.result.unlocked).length).toBeGreaterThan(200);
    expect(cases.filter((c) => c.result.unlocked && c.result.fills.length < c.pool.accepted.length).length).toBeGreaterThan(100);
    expect(cases.filter((c) => !c.result.unlocked && c.pool.unlocked).length).toBeGreaterThan(100);
    expect(cases.filter((c) => c.pricedOutMatters).length).toBeGreaterThan(25);
  });

  it("returns a valid ClearingResult for the rule, at the offer price", () => {
    fc.assert(
      fc.property(caseArb, ({ rule, commitments }) => {
        const result = clear(rule, VISIT_DATE, commitments);
        expect(ClearingResult.parse(result)).toEqual(result);
        expect(result).toMatchObject({ ruleId: rule.id, termsVersion: rule.termsVersion, visitDate: VISIT_DATE, pricePerCoverCents: offerPriceCents(rule) });
      }),
      RUN,
    );
  });

  it("never clears below the hidden floor", () => {
    fc.assert(
      fc.property(caseArb, ({ rule, commitments }) => {
        const result = clear(rule, VISIT_DATE, commitments);
        if (result.fills.length > 0) expect(result.pricePerCoverCents).toBeGreaterThanOrEqual(rule.terms.floorPriceCents);
      }),
      RUN,
    );
  });

  it("never fills above a buyer's max price", () => {
    fc.assert(
      fc.property(caseArb, ({ rule, commitments }) => {
        const result = clear(rule, VISIT_DATE, commitments);
        const byId = new Map(commitments.map((c) => [c.id, c]));
        for (const fill of result.fills) expect(byId.get(fill.commitmentId)?.maxPricePerCoverCents).toBeGreaterThanOrEqual(result.pricePerCoverCents);
      }),
      RUN,
    );
  });

  it("never fills past capacity, and an unlocked result fills at least the minimum pool", () => {
    fc.assert(
      fc.property(caseArb, ({ rule, commitments }) => {
        const result = clear(rule, VISIT_DATE, commitments);
        expect(coversOf(result)).toBeLessThanOrEqual(rule.capacityCovers);
        if (result.unlocked) expect(coversOf(result)).toBeGreaterThanOrEqual(rule.terms.minPoolCovers);
        else expect(result.fills).toEqual([]);
      }),
      RUN,
    );
  });

  it("fills only commitments evaluatePool accepted, each once and whole", () => {
    fc.assert(
      fc.property(caseArb, ({ rule, commitments }) => {
        const result = clear(rule, VISIT_DATE, commitments);
        const accepted = new Map(eligible(rule, commitments).map((c) => [c.id, c]));
        for (const fill of result.fills) expect(fill.covers).toBe(accepted.get(fill.commitmentId)?.covers);
        expect(new Set(result.fills.map((f) => f.commitmentId)).size).toBe(result.fills.length);
      }),
      RUN,
    );
  });

  it("fills first come first served and skips an eligible commitment only when it does not fit", () => {
    fc.assert(
      fc.property(caseArb, ({ rule, commitments }) => {
        const result = clear(rule, VISIT_DATE, commitments);
        if (!result.unlocked) return;
        const candidates = eligible(rule, commitments);
        const fills = new Map(result.fills.map((f) => [f.commitmentId, f.covers]));
        // Fills keep arrival order.
        expect(result.fills.map((f) => f.commitmentId)).toEqual(candidates.filter((c) => fills.has(c.id)).map((c) => c.id));
        let used = 0;
        for (const c of candidates) {
          if (fills.has(c.id)) used += c.covers;
          else expect(c.covers).toBeGreaterThan(rule.capacityCovers - used);
        }
      }),
      RUN,
    );
  });

  it("gives the same result with the commitments priced out by the buyer's max left out", () => {
    fc.assert(
      fc.property(caseArb, ({ rule, commitments }) => {
        const affordable = commitments.filter((c) => c.maxPricePerCoverCents >= offerPriceCents(rule));
        expect(clear(rule, VISIT_DATE, commitments)).toEqual(clear(rule, VISIT_DATE, affordable));
      }),
      RUN,
    );
  });

  it("gives the same result for the same input, in any array order", () => {
    const shuffledCase = caseArb.chain(({ rule, commitments }) =>
      fc.shuffledSubarray(commitments, { minLength: commitments.length, maxLength: commitments.length }).map((shuffled) => ({ rule, commitments, shuffled })),
    );
    fc.assert(
      fc.property(shuffledCase, ({ rule, commitments, shuffled }) => {
        const result = clear(rule, VISIT_DATE, commitments);
        expect(clear(rule, VISIT_DATE, commitments)).toEqual(result);
        expect(clear(rule, VISIT_DATE, shuffled)).toEqual(result);
      }),
      RUN,
    );
  });
});
