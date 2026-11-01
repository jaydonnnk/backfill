import { asc, countDistinct, eq } from "drizzle-orm";
import type { Executor } from "@/lib/db/client";
import { clearingFills, clearings, commitments, ledger, merchants, rules } from "@/lib/db/schema";

export type DemoLedgerPool = {
  ruleId: string; visitDate: string; clearedAt: string; unlocked: boolean;
  covers: number; buyerShareCents: number; agentShareCents: number; networkShareCents: number; reconciled: boolean;
};
export type DemoLedger = {
  covers: number; buyerShareCents: number; agentShareCents: number; networkShareCents: number;
  agentsCommitted: number; poolsUnlocked: number; reconciled: boolean; pools: DemoLedgerPool[];
};

// Only the named synthetic demo merchant is public. No floor, receipt, token or buyer identifier.
export async function publicDemoLedger(db: Executor, merchantName: string): Promise<DemoLedger | null> {
  const [merchant] = await db.select({ id: merchants.id }).from(merchants).where(eq(merchants.name, merchantName)).orderBy(asc(merchants.id)).limit(1);
  if (!merchant) return null;
  const [agents] = await db.select({ total: countDistinct(commitments.agentId) }).from(commitments).innerJoin(rules, eq(rules.id, commitments.ruleId)).where(eq(rules.merchantId, merchant.id));
  const stored = await db.select({ ruleId: clearings.ruleId, visitDate: clearings.visitDate, clearedAt: clearings.clearedAt, unlocked: clearings.unlocked }).from(clearings).innerJoin(rules, eq(rules.id, clearings.ruleId)).where(eq(rules.merchantId, merchant.id)).orderBy(asc(clearings.clearedAt), asc(clearings.ruleId));
  const fills = await db.select({ id: clearingFills.commitmentId, ruleId: clearingFills.ruleId, visitDate: clearingFills.visitDate, covers: clearingFills.covers, price: clearingFills.pricePerCoverCents }).from(clearingFills).innerJoin(rules, eq(rules.id, clearingFills.ruleId)).where(eq(rules.merchantId, merchant.id));
  const entries = await db.select({ id: ledger.commitmentId, ruleId: ledger.ruleId, covers: ledger.covers, price: ledger.pricePerCoverCents, buyer: ledger.buyerShareCents, agent: ledger.agentShareCents, network: ledger.networkShareCents }).from(ledger).where(eq(ledger.merchantId, merchant.id));
  const byId = new Map(entries.map(e => [e.id, e]));
  const fillIds = new Set(fills.map(f => f.id));
  const pools = stored.map(clearing => {
    const pool: DemoLedgerPool = { ...clearing, clearedAt: clearing.clearedAt.toISOString(), covers: 0, buyerShareCents: 0, agentShareCents: 0, networkShareCents: 0, reconciled: true };
    for (const fill of fills.filter(f => f.ruleId === clearing.ruleId && f.visitDate === clearing.visitDate)) {
      const entry = byId.get(fill.id);
      if (!entry || entry.ruleId !== fill.ruleId || entry.covers !== fill.covers || entry.price !== fill.price) pool.reconciled = false;
      if (entry) {
        pool.covers += entry.covers;
        pool.buyerShareCents += entry.buyer;
        pool.agentShareCents += entry.agent;
        pool.networkShareCents += entry.network;
      }
    }
    return pool;
  });
  return {
    covers: entries.reduce((n, e) => n + e.covers, 0),
    buyerShareCents: entries.reduce((n, e) => n + e.buyer, 0),
    agentShareCents: entries.reduce((n, e) => n + e.agent, 0),
    networkShareCents: entries.reduce((n, e) => n + e.network, 0),
    agentsCommitted: agents?.total ?? 0,
    poolsUnlocked: pools.filter(p => p.unlocked).length,
    reconciled: pools.every(p => p.reconciled) && entries.every(e => fillIds.has(e.id)),
    pools,
  };
}
