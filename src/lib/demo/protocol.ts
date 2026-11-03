import { z } from 'zod';
import { PublicTrail } from './trail';
import type { DemoSnapshot } from './snapshot';

const count = z.int().nonnegative();
const at = z.iso.datetime();
const outcome = z.enum(['pending', 'filled', 'not_filled']);
// Strip unknown fields at this boundary. Public views never consume arbitrary feed properties.
const Scene = z.object({
  id: z.string(), merchantName: z.string(), summary: z.string(), listPriceCents: count, offerPriceCents: count,
  discountBps: count, minPoolCovers: z.int().positive(), visitDate: z.iso.date(), visitWindow: z.string().optional(),
  commitBy: at, phase: z.enum(['open', 'cleared']),
  events: z.array(z.object({ kind: z.enum(['commitment', 'cleared', 'sold_out', 'plan']), at, label: z.string() })),
  buyers: z.array(z.object({ agentId: z.string(), label: z.string(), covers: z.int().positive(), committedAt: at, soloUnlocks: z.boolean(), outcome })),
  trail: z.array(PublicTrail).optional(),
  pooled: z.object({ covers: count, unlocked: z.boolean(), filledCovers: count, soldOut: z.boolean() }),
  plan: z.object({ provenance: z.enum(['recorded_replay', 'model', 'fixture', 'unavailable']), verdict: z.string(), discountBps: count.nullable(), capacityCovers: count.nullable(), minPoolCovers: count.nullable(), perAgentCapCovers: count.nullable(), rationale: z.null(), applied: z.boolean() }).nullable(),
}).refine(s => {
  if (s.phase === 'open') return s.pooled.filledCovers === 0 && !s.pooled.soldOut && s.buyers.every(b => b.outcome === 'pending');
  return (!s.pooled.unlocked ? s.pooled.filledCovers === 0 && !s.pooled.soldOut : true) && s.pooled.filledCovers <= s.pooled.covers;
});
const Pool = z.object({ ruleId: z.string(), visitDate: z.iso.date(), clearedAt: at, unlocked: z.boolean(), covers: count, buyerShareCents: count, agentShareCents: count, networkShareCents: count, reconciled: z.boolean() });
const Snapshot = z.object({
  scene: Scene.nullable(),
  muse: z.object({ commitmentId: z.string(), merchantName: z.string(), visitDate: z.iso.date(), covers: count, status: z.enum(['pending', 'cancelled', 'filled', 'not_filled']), pooledCovers: count, minPoolCovers: z.int().positive() }).nullable(),
  ledger: z.object({ covers: count, buyerShareCents: count, agentShareCents: count, networkShareCents: count, agentsCommitted: count, poolsUnlocked: count, reconciled: z.boolean(), pools: z.array(Pool) }).nullable().optional(),
});

export function parseDemoSnapshot(data: string): DemoSnapshot | null {
  try {
    const result = Snapshot.safeParse(JSON.parse(data));
    return result.success ? { ...result.data, ledger: result.data.ledger ?? null } : null;
  } catch { return null; }
}
