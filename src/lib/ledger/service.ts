import { eq } from "drizzle-orm";
import { merchantTotals, type MerchantTotals } from "@/domain/ledger/calculate";
import { LedgerEntry } from "@/domain/ledger/schema";
import type { Db } from "@/lib/db/client";
import { clearingFills, ledger, rules } from "@/lib/db/schema";

export type MerchantLedger = { totals: MerchantTotals; missing: string[]; mismatched: string[]; orphaned: string[]; reconciled: boolean };

// Called only after merchant authentication. Never settles a pool or repairs historical rows.
export async function merchantLedger(db: Db, merchantId: string): Promise<MerchantLedger> {
  return db.transaction(async tx => {
    const rows = await tx.select().from(ledger).where(eq(ledger.merchantId, merchantId));
    const entries = rows.map(row => LedgerEntry.parse(row));
    const fills = await tx.select({ commitmentId: clearingFills.commitmentId, ruleId: clearingFills.ruleId, covers: clearingFills.covers, pricePerCoverCents: clearingFills.pricePerCoverCents }).from(clearingFills).innerJoin(rules, eq(rules.id, clearingFills.ruleId)).where(eq(rules.merchantId, merchantId));
    const byEntry = new Map(entries.map(entry => [entry.commitmentId, entry]));
    const byFill = new Map(fills.map(fill => [fill.commitmentId, fill]));
    const missing = fills.filter(fill => !byEntry.has(fill.commitmentId)).map(fill => fill.commitmentId).sort();
    const orphaned = entries.filter(entry => !byFill.has(entry.commitmentId)).map(entry => entry.commitmentId).sort();
    const mismatched = fills.filter(fill => {
      const entry = byEntry.get(fill.commitmentId);
      return entry !== undefined && (entry.ruleId !== fill.ruleId || entry.covers !== fill.covers || entry.pricePerCoverCents !== fill.pricePerCoverCents);
    }).map(fill => fill.commitmentId).sort();
    const totals = merchantTotals(entries)[0] ?? { merchantId, entries: 0, covers: 0, listValueCents: 0, chargedCents: 0, savingsCents: 0, buyerShareCents: 0, agentShareCents: 0, networkShareCents: 0 };
    const reconciled = missing.length === 0 && mismatched.length === 0 && orphaned.length === 0 && totals.listValueCents === totals.chargedCents + totals.savingsCents && totals.savingsCents === totals.buyerShareCents + totals.agentShareCents + totals.networkShareCents;
    return { totals, missing, mismatched, orphaned, reconciled };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
