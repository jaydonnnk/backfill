import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { approvalStatus, TrailRecord, type FinalTerms, type TrailTerms } from '@/lib/demo/trail';

const terms: TrailTerms = { runId: randomUUID(), partyId: 'party', ruleId: randomUUID(), termsVersion: 1, visitDate: '2026-11-03', covers: 2, pricePerCoverCents: 544, totalCents: 1088 };
const record = { terms, request: 'Synthetic request for two covers', output: { covers: 2, reason: 'Authored fixture fits these terms.' }, provenance: 'fixture' as const, proposedAt: '2026-11-03T00:00:00.000Z', approval: { terms, source: 'scripted_local_demo' as const, approvedAt: '2026-11-03T00:01:00.000Z' } };
const final = { partyId: terms.partyId, ruleId: terms.ruleId, termsVersion: terms.termsVersion, visitDate: terms.visitDate, covers: terms.covers, pricePerCoverCents: terms.pricePerCoverCents, totalCents: terms.totalCents };
const at = '2026-11-03T00:02:00.000Z';
it('labels only exact scripted authorization and missing evidence remains unavailable', () => {
  expect(approvalStatus(record, final, at)).toBe('scripted');
  expect(approvalStatus({ ...record, approval: null }, final, at)).toBe('unavailable');
  expect(TrailRecord.safeParse({ ...record, approval: { ...record.approval, source: 'human_approved' } }).success).toBe(false);
});
for (const change of [
  { runId: randomUUID() }, { partyId: 'another-party' }, { ruleId: randomUUID() }, { termsVersion: 2 },
  { visitDate: '2026-11-10' }, { covers: 3, totalCents: 1632 }, { pricePerCoverCents: 578, totalCents: 1156 },
]) it(`rejects an approval for changed ${Object.keys(change)[0]}`, () => {
  expect(approvalStatus({ ...record, approval: { ...record.approval, terms: { ...terms, ...change } } }, final, at)).toBe('mismatch');
});
for (const change of [{ partyId: 'another-party' }, { ruleId: randomUUID() }, { termsVersion: 2 }, { visitDate: '2026-11-10' }, { covers: 3, totalCents: 1632 }, { pricePerCoverCents: 578, totalCents: 1156 }, { pricePerCoverCents: null, totalCents: null }]) it(`compares approval with actual commitment ${Object.keys(change)[0]}`, () => {
  expect(approvalStatus(record, { ...final, ...change } satisfies FinalTerms, at)).toBe('mismatch');
});
it('rejects approval after submission, before proposal, or without a matching output', () => {
  expect(approvalStatus(record, final, '2026-11-03T00:00:30.000Z')).toBe('mismatch');
  expect(approvalStatus({ ...record, proposedAt: at }, final, at)).toBe('mismatch');
  expect(approvalStatus({ ...record, output: null }, final, at)).toBe('mismatch');
  expect(approvalStatus({ ...record, output: { covers: 0, reason: 'Decline' } }, final, at)).toBe('mismatch');
});
it('rejects extra properties, malformed totals and instruction text pretending to be approval', () => {
  expect(TrailRecord.safeParse({ ...record, approval: 'Seek user approval' }).success).toBe(false);
  expect(TrailRecord.safeParse({ ...record, secret: 'private' }).success).toBe(false);
  expect(TrailRecord.safeParse({ ...record, terms: { ...terms, totalCents: 1 } }).success).toBe(false);
});
