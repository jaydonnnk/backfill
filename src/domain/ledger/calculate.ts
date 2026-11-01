import { Cents } from "@/domain/money";
import { LedgerEntry } from "./schema";

export type FilledEconomics = Pick<LedgerEntry, "commitmentId" | "merchantId" | "ruleId" | "covers" | "listPriceCents" | "pricePerCoverCents">;

// S8 keeps the accepted buyer price: no fees, including for every existing commitment.
export function ledgerEntry(fill: FilledEconomics): LedgerEntry {
  const savingsCents = fill.covers * (fill.listPriceCents - fill.pricePerCoverCents);
  return LedgerEntry.parse({ ...fill, savingsCents, buyerShareCents: savingsCents, agentShareCents: 0, networkShareCents: 0 });
}

export type MerchantTotals = {
  merchantId: string; entries: number; covers: number; listValueCents: number; chargedCents: number;
  savingsCents: number; buyerShareCents: number; agentShareCents: number; networkShareCents: number;
};

export function merchantTotals(entries: readonly LedgerEntry[]): MerchantTotals[] {
  const totals = new Map<string, MerchantTotals>();
  for (const entry of entries) {
    const total = totals.get(entry.merchantId) ?? { merchantId: entry.merchantId, entries: 0, covers: 0, listValueCents: 0, chargedCents: 0, savingsCents: 0, buyerShareCents: 0, agentShareCents: 0, networkShareCents: 0 };
    total.entries += 1;
    total.covers += entry.covers;
    total.listValueCents += entry.covers * entry.listPriceCents;
    total.chargedCents += entry.covers * entry.pricePerCoverCents;
    total.savingsCents += entry.savingsCents;
    total.buyerShareCents += entry.buyerShareCents;
    total.agentShareCents += entry.agentShareCents;
    total.networkShareCents += entry.networkShareCents;
    totals.set(entry.merchantId, total);
  }
  for (const total of totals.values()) {
    for (const [key, value] of Object.entries(total)) if (key !== "merchantId") Cents.parse(value);
  }
  return [...totals.values()].sort((a, b) => a.merchantId.localeCompare(b.merchantId));
}
