import { randomUUID } from 'node:crypto';
import type { Db } from '../../src/lib/db/client';
import { demoTrails } from '../../src/lib/db/schema';
import { TrailRecord, type TrailTerms } from '../../src/lib/demo/trail';

// Local operator fixture only. The production role has no write grant for this evidence.
export async function storeScriptedTrail(db: Db, terms: TrailTerms, commitmentId: string | null, at: Date, variant: 'scripted' | 'missing' | 'changed_price' | 'changed_version' | 'no_output' = 'scripted') {
  const approved = { ...terms, ...(variant === 'changed_price' ? { pricePerCoverCents: 578, totalCents: terms.covers * 578 } : {}), ...(variant === 'changed_version' ? { termsVersion: terms.termsVersion + 1 } : {}) };
  const record = TrailRecord.parse({
    terms, request: `Synthetic party requests ${terms.covers} kaya toast and kopi covers on ${terms.visitDate}, at S$${(terms.pricePerCoverCents / 100).toFixed(2)} each.`,
    output: variant === 'no_output' ? null : { covers: terms.covers, reason: 'Authored fixture selects the requested covers at the stated offer price.' },
    provenance: 'fixture', proposedAt: at.toISOString(),
    approval: variant === 'missing' || variant === 'no_output' ? null : { terms: approved, source: 'scripted_local_demo', approvedAt: at.toISOString() },
  });
  const [row] = await db.insert(demoTrails).values({ id: randomUUID(), ruleId: terms.ruleId, partyId: terms.partyId, visitDate: terms.visitDate, commitmentId, record }).returning();
  return row;
}
