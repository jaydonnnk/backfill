import { and, asc, eq, sql } from "drizzle-orm";
import { ledgerEntry } from "@/domain/ledger/calculate";
import { LedgerEntry } from "@/domain/ledger/schema";
import type { Db } from "@/lib/db/client";
import { clearingFills, clearings, commitments, ledger, merchants, rules } from "@/lib/db/schema";

// Operator-supplied historical evidence, never buyer input or an inferred current-price policy.
export type HistoricalOccurrence = { ruleId: string; merchantId: string; merchantName: string; visitDate: string; termsVersion: number; listPriceCents: number; pricePerCoverCents: number; expectedFills: number; expectedCovers: number; allowedAgentIds: readonly string[] };

export async function backfillLedger(db: Db, sources: readonly HistoricalOccurrence[]): Promise<{ inserted: number; existing: number }> {
  return db.transaction(async tx => {
    let inserted = 0;
    let existing = 0;
    const seen = new Set<string>();
    const ordered = [...sources].sort((a, b) => a.ruleId.localeCompare(b.ruleId) || a.visitDate.localeCompare(b.visitDate));
    for (const source of ordered) {
      const key = `${source.ruleId}/${source.visitDate}`;
      if (seen.has(key)) throw new Error("duplicate historical source");
      seen.add(key);
      await tx.execute(sql`select lock_rule_for_clearing(${source.ruleId})`);
      const [current] = await tx.select({ rule: rules, merchantName: merchants.name }).from(rules).innerJoin(merchants, eq(merchants.id, rules.merchantId)).where(eq(rules.id, source.ruleId));
      if (!current || current.rule.merchantId !== source.merchantId || current.merchantName !== source.merchantName || current.rule.termsVersion !== source.termsVersion || current.rule.listPriceCents !== source.listPriceCents) throw new Error("historical source mismatch");
      const fills = await tx.select({ fill: clearingFills, commitment: commitments, clearing: clearings }).from(clearingFills)
        .innerJoin(commitments, eq(commitments.id, clearingFills.commitmentId))
        .innerJoin(clearings, and(eq(clearings.ruleId, clearingFills.ruleId), eq(clearings.visitDate, clearingFills.visitDate)))
        .where(and(eq(clearingFills.ruleId, source.ruleId), eq(clearingFills.visitDate, source.visitDate))).orderBy(asc(clearingFills.commitmentId));
      if (fills.length !== source.expectedFills || fills.reduce((n, row) => n + row.fill.covers, 0) !== source.expectedCovers || fills.some(row => row.fill.pricePerCoverCents !== source.pricePerCoverCents || !source.allowedAgentIds.includes(row.commitment.agentId) || row.commitment.termsVersion !== source.termsVersion || row.clearing.termsVersion !== source.termsVersion)) throw new Error("historical fill evidence mismatch");
      for (const { fill } of fills) {
        const entry = ledgerEntry({ commitmentId: fill.commitmentId, merchantId: source.merchantId, ruleId: source.ruleId, covers: fill.covers, listPriceCents: source.listPriceCents, pricePerCoverCents: fill.pricePerCoverCents });
        const [stored] = await tx.select().from(ledger).where(eq(ledger.commitmentId, fill.commitmentId));
        if (stored) {
          if (JSON.stringify(LedgerEntry.parse(stored)) !== JSON.stringify(entry)) throw new Error("existing ledger conflicts with historical evidence");
          existing += 1;
        } else {
          await tx.insert(ledger).values(entry);
          inserted += 1;
        }
      }
    }
    return { inserted, existing };
  });
}
