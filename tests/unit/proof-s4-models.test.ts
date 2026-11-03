import { describe, expect, it } from 'vitest';
import { parseIntentOutput, validateDecision, type Intent } from '@/lib/buyer/models';
const fields: Intent = { partySize: 2, visitDate: '2026-11-04', earliest: '14:00', latest: '17:00', budgetPerCoverCents: 600, currency: 'SGD', requirements: [] };
describe('S4 bounded model outputs', () => {
  it('retains explicit fields and clarifies missing or ambiguous ones', () => {
    expect(parseIntentOutput(JSON.stringify(fields))).toEqual(fields);
    expect(parseIntentOutput(JSON.stringify({ ...fields, budgetPerCoverCents: null, currency: null })).budgetPerCoverCents).toBeNull();
    expect(() => parseIntentOutput(JSON.stringify({ ...fields, partySize: 2.5 }))).toThrow();
    expect(() => parseIntentOutput(JSON.stringify({ ...fields, hidden_reasoning: 'private' }))).toThrow();
    expect(() => parseIntentOutput('```json\n{}\n```')).toThrow();
  });
  it('requires exact party covers and budget; zero is a refusal', () => {
    expect(validateDecision({ covers: 2, reason: 'Fits' }, fields, 544)).toEqual({ covers: 2, reason: 'Fits' });
    expect(validateDecision({ covers: 0, reason: 'Wrong time' }, fields, 544).covers).toBe(0);
    expect(() => validateDecision({ covers: 3, reason: 'Extra person' }, fields, 544)).toThrow();
    expect(() => validateDecision({ covers: 2, reason: 'Too expensive' }, fields, 700)).toThrow();
  });
});
