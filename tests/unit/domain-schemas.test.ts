import { describe, expect, it } from "vitest";
import { ClearingResult } from "@/domain/clearing/schema";
import { Commitment } from "@/domain/commitments/schema";
import { LedgerEntry } from "@/domain/ledger/schema";
import { AgentTerms, MerchantRule, Window } from "@/domain/offers/schema";

const ID_A = "6f1c0a52-3d3e-4c1a-9a43-0d6c1f0b7e11";
const ID_B = "0b6e7f3c-5a8d-4d2e-8f61-2c9a4b7d1e05";
const ID_C = "9d2b4e61-7f0a-4b3c-8e5d-1a6c2f9b0d74";

const window = { weekday: 2, startMinute: 840, endMinute: 1020, commitByMinute: 720 };
const terms = { window, discountBps: 2500, minPoolCovers: 8, perAgentCapCovers: 4, floorPriceCents: 900 };
const rule = { id: ID_A, merchantId: ID_B, termsVersion: 1, listPriceCents: 1250, capacityCovers: 20, terms };
const commitment = {
  id: ID_C,
  ruleId: ID_A,
  agentId: "agent-a",
  termsVersion: 1,
  covers: 2,
  maxPricePerCoverCents: 1000,
  visitAt: new Date("2026-11-03T15:00:00+08:00"),
  committedAt: new Date("2026-11-03T09:00:00+08:00"),
};
// 3 covers at 938 instead of 1250: 3 x 312 = 936 saved.
const entry = {
  commitmentId: ID_C,
  merchantId: ID_B,
  ruleId: ID_A,
  covers: 3,
  listPriceCents: 1250,
  pricePerCoverCents: 938,
  savingsCents: 936,
  buyerShareCents: 700,
  agentShareCents: 136,
  networkShareCents: 100,
};
const result = { ruleId: ID_A, termsVersion: 1, visitDate: "2026-11-03", unlocked: true, pricePerCoverCents: 938, fills: [{ commitmentId: ID_C, covers: 2 }] };

// Each row changes one field of a valid value; the base value itself must parse.
function expectRefusals<T extends object>(schema: { safeParse: (v: unknown) => { success: boolean } }, base: T, accepted: Partial<T>[], refused: Partial<T>[]) {
  expect(schema.safeParse(base).success).toBe(true);
  for (const change of accepted) expect({ change, ok: schema.safeParse({ ...base, ...change }).success }).toEqual({ change, ok: true });
  for (const change of refused) expect({ change, ok: schema.safeParse({ ...base, ...change }).success }).toEqual({ change, ok: false });
}

describe("Window", () => {
  it("accepts the edges and refuses windows that are empty, overnight or out of range", () => {
    expectRefusals(
      Window,
      window,
      [{ weekday: 1 }, { weekday: 7 }, { startMinute: 0, commitByMinute: 0 }, { endMinute: 1440 }, { commitByMinute: 840 }],
      [{ weekday: 0 }, { weekday: 8 }, { endMinute: 1441 }, { endMinute: 840 }, { endMinute: 600 }, { commitByMinute: 841 }, { commitByMinute: -1 }, { startMinute: 840.5 }],
    );
  });
});

describe("AgentTerms", () => {
  it("bounds the discount and needs a positive pool and cap", () => {
    expectRefusals(
      AgentTerms,
      terms,
      [{ discountBps: 1 }, { discountBps: 9999 }, { minPoolCovers: 1 }, { perAgentCapCovers: 1 }, { floorPriceCents: 0 }],
      [{ discountBps: 0 }, { discountBps: 10000 }, { minPoolCovers: 0 }, { perAgentCapCovers: 0 }, { floorPriceCents: -1 }, { floorPriceCents: 899.5 }],
    );
  });
});

describe("MerchantRule", () => {
  it("refuses a floor above the list price", () => {
    expectRefusals(
      MerchantRule,
      rule,
      [{ terms: { ...terms, floorPriceCents: 1250 } }],
      [{ terms: { ...terms, floorPriceCents: 1251 } }, { termsVersion: 0 }, { capacityCovers: 0 }, { listPriceCents: 12.5 }],
    );
  });

  it("refuses a minimum pool above capacity", () => {
    expectRefusals(MerchantRule, rule, [{ capacityCovers: 8 }], [{ capacityCovers: 7 }]);
  });
});

describe("Commitment", () => {
  it("needs positive covers, a terms version and an agent", () => {
    expectRefusals(
      Commitment,
      commitment,
      [{ maxPricePerCoverCents: 0 }, { agentId: "a".repeat(200) }],
      [
        { covers: 0 },
        { termsVersion: 0 },
        { agentId: "" },
        { agentId: "a".repeat(201) },
        { maxPricePerCoverCents: -1 },
        { visitAt: new Date(Number.NaN) },
        { committedAt: new Date(Number.NaN) },
      ]);
  });
});

describe("ClearingResult", () => {
  it("fills nothing while locked and each commitment at most once", () => {
    expectRefusals(
      ClearingResult,
      result,
      [{ unlocked: false, fills: [] }],
      [
        { unlocked: false },
        {
          fills: [
            { commitmentId: ID_C, covers: 1 },
            { commitmentId: ID_C, covers: 1 },
          ],
        },
        { fills: [{ commitmentId: ID_C, covers: 0 }] },
        { visitDate: "2026-11-31" },
      ],
    );
  });
});

describe("LedgerEntry", () => {
  it("needs savings equal to covers times the discount and shares that add up", () => {
    expectRefusals(
      LedgerEntry,
      entry,
      [{ pricePerCoverCents: 1250, savingsCents: 0, buyerShareCents: 0, agentShareCents: 0, networkShareCents: 0 }],
      [
        { savingsCents: 935, buyerShareCents: 699 },
        { buyerShareCents: 701 },
        // Above the list price the savings would be negative.
        { pricePerCoverCents: 1251, savingsCents: -3, buyerShareCents: -3, agentShareCents: 0, networkShareCents: 0 },
        { covers: 0, savingsCents: 0, buyerShareCents: 0, agentShareCents: 0, networkShareCents: 0 },
        // 2 x (1250.5 - 938) is a whole 625, so only the list price's own integer check refuses it.
        { listPriceCents: 1250.5, covers: 2, savingsCents: 625, buyerShareCents: 389 },
      ],
    );
  });
});
