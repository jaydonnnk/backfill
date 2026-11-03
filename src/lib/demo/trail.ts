import { z } from 'zod';

// Public, opt-in demonstrator records only. No raw prompts, merchant context or model traces.
export const TrailTerms = z.strictObject({
  runId: z.uuid(), partyId: z.string().min(1).max(200), ruleId: z.uuid(),
  termsVersion: z.int().positive(), visitDate: z.iso.date(), covers: z.int().positive(),
  pricePerCoverCents: z.int().nonnegative(), totalCents: z.int().nonnegative(),
}).refine(t => t.totalCents === t.covers * t.pricePerCoverCents);
export type TrailTerms = z.infer<typeof TrailTerms>;
export const TrailRecord = z.strictObject({
  terms: TrailTerms,
  request: z.string().min(1).max(300),
  output: z.strictObject({ covers: z.int().nonnegative(), reason: z.string().min(1).max(200) }).nullable(),
  provenance: z.enum(['fixture', 'recorded_replay']),
  proposedAt: z.iso.datetime(),
  approval: z.strictObject({ terms: TrailTerms, source: z.literal('scripted_local_demo'), approvedAt: z.iso.datetime() }).nullable(),
});
export type TrailRecord = z.infer<typeof TrailRecord>;
export const FinalTerms = z.strictObject({
  partyId: z.string(), ruleId: z.uuid(), termsVersion: z.int().positive(), visitDate: z.iso.date(),
  covers: z.int().positive(), pricePerCoverCents: z.int().nonnegative().nullable(), totalCents: z.int().nonnegative().nullable(),
});
export type FinalTerms = z.infer<typeof FinalTerms>;

export function approvalStatus(record: TrailRecord, final: FinalTerms | null, committedAt: string | null) {
  const approval = record.approval;
  if (!approval) return 'unavailable' as const;
  const same = (a: TrailTerms, b: TrailTerms) => Object.entries(a).every(([key, value]) => Object.entries(b).some(([k, v]) => k === key && v === value));
  const finalMatches = final !== null && Object.entries(final).every(([key, value]) => Object.entries(record.terms).some(([k, v]) => k === key && v === value));
  const ordered = Date.parse(record.proposedAt) <= Date.parse(approval.approvedAt) && (committedAt === null || Date.parse(approval.approvedAt) <= Date.parse(committedAt));
  return same(approval.terms, record.terms) && ordered && record.output?.covers === record.terms.covers && (final === null || finalMatches)
    ? 'scripted' as const : 'mismatch' as const;
}

export const PublicTrail = z.strictObject({
  id: z.string(), terms: TrailTerms.nullable(), request: z.string().nullable(), output: TrailRecord.shape.output,
  provenance: z.enum(['fixture', 'recorded_replay', 'unavailable']),
  approval: z.enum(['scripted', 'unavailable', 'mismatch']),
  commitmentId: z.uuid().nullable(), final: FinalTerms.nullable(),
  result: z.enum(['proposal_only', 'pending', 'filled', 'not_filled']),
});
export type PublicTrail = z.infer<typeof PublicTrail>;
