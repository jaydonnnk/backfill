import { expect, it } from "vitest";
import { ledgerEntry, merchantTotals } from "@/domain/ledger/calculate";

const fill = { commitmentId: "00000000-0000-4000-8000-000000000001", merchantId: "00000000-0000-4000-8000-000000000002", ruleId: "00000000-0000-4000-8000-000000000003", covers: 3, listPriceCents: 1250, pricePerCoverCents: 938 };
it("records every saved cent for the buyer with explicit zero agent and network shares", () => {
  expect(ledgerEntry(fill)).toEqual({ ...fill, savingsCents: 936, buyerShareCents: 936, agentShareCents: 0, networkShareCents: 0 });
  expect(ledgerEntry({ ...fill, covers: 3, listPriceCents: 3, pricePerCoverCents: 2 })).toMatchObject({ savingsCents: 3, buyerShareCents: 3, agentShareCents: 0, networkShareCents: 0 });
  expect(ledgerEntry({ ...fill, pricePerCoverCents: 1250 })).toMatchObject({ savingsCents: 0, buyerShareCents: 0 });
});
it("refuses negative savings and invalid filled economics", () => {
  for (const changed of [{ pricePerCoverCents: 1251 }, { covers: 0 }, { pricePerCoverCents: -1 }, { commitmentId: "invalid" }]) expect(() => ledgerEntry({ ...fill, ...changed })).toThrow();
});
it("reconciles literal merchant totals using persisted prices and keeps merchants separate", () => {
  const first = ledgerEntry(fill);
  const second = ledgerEntry({ ...fill, covers: 2, pricePerCoverCents: 900 });
  const other = ledgerEntry({ ...fill, merchantId: "00000000-0000-4000-8000-000000000004", covers: 1, listPriceCents: 100, pricePerCoverCents: 99 });
  expect(merchantTotals([first, second, other])).toEqual([
    { merchantId: fill.merchantId, entries: 2, covers: 5, listValueCents: 6250, chargedCents: 4614, savingsCents: 1636, buyerShareCents: 1636, agentShareCents: 0, networkShareCents: 0 },
    { merchantId: other.merchantId, entries: 1, covers: 1, listValueCents: 100, chargedCents: 99, savingsCents: 1, buyerShareCents: 1, agentShareCents: 0, networkShareCents: 0 },
  ]);
  expect(merchantTotals([])).toEqual([]);
});

it("refuses totals that exceed safe integer cents", () => {
  const huge = ledgerEntry({ ...fill, covers: 2, listPriceCents: Number.MAX_SAFE_INTEGER, pricePerCoverCents: Number.MAX_SAFE_INTEGER });
  expect(() => merchantTotals([huge])).toThrow();
});

it("totals retain every explicit share field from persisted entries", () => {
  expect(merchantTotals([{ ...fill, savingsCents: 936, buyerShareCents: 700, agentShareCents: 136, networkShareCents: 100 }])).toMatchObject([{ buyerShareCents: 700, agentShareCents: 136, networkShareCents: 100 }]);
});
