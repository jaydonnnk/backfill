import { describe, expect, it } from 'vitest';
import { merchantKopiCue, merchantStep } from '@/components/merchant-kopi';

const draft = { id: 'draft', ruleId: null, verdict: 'ok' };
describe('merchant guidance uses stored facts', () => {
  it('does not invent a publication from an arbitrary draft marker', () => {
    expect(merchantKopiCue([draft], [], 'fake')).toEqual({ pose: 'watching', text: 'Menu ready. Confirm your terms.' });
    expect(merchantKopiCue([draft], [], 'draft').pose).toBe('watching');
  });
  it('labels a stored publication without claiming it happened now', () => {
    expect(merchantKopiCue([{ ...draft, ruleId: 'rule' }], [], 'draft')).toEqual({ pose: 'happy', text: 'This menu has a published offer.' });
  });
  it('uses the stored latest plan verdict and application state', () => {
    expect(merchantKopiCue([], [{ verdict: 'below_floor', applied: false }])).toEqual({ pose: 'shield', text: 'Stored plan is not usable.' });
    expect(merchantKopiCue([], [{ verdict: 'ok', applied: false }])).toEqual({ pose: 'watching', text: 'Stored plan awaits your approval.' });
    expect(merchantKopiCue([], [{ verdict: 'below_floor', applied: false }, { verdict: 'ok', applied: true }])).toEqual({ pose: 'idle', text: 'Your offers. Your terms.' });
  });
  it('does not call a missing model proposal a guardrail refusal', () => {
    expect(merchantKopiCue([], [{ verdict: 'no_proposal', applied: false }])).toEqual({ pose: 'shield', text: 'Stored plan is not usable.' });
  });
  it('does not ask the owner to confirm a refused or published menu', () => {
    expect(merchantKopiCue([{ ...draft, verdict: 'no_items' }], [])).toEqual({ pose: 'idle', text: 'Your offers. Your terms.' });
    expect(merchantKopiCue([{ ...draft, ruleId: 'rule' }], [])).toEqual({ pose: 'idle', text: 'Your offers. Your terms.' });
  });
  it('selects the unfinished draft before existing offers in the stepper', () => {
    expect(merchantStep([draft], 1)).toBe(2);
    expect(merchantStep([], 1)).toBe(3);
    expect(merchantStep([{ ...draft, verdict: 'no_items' }], 0)).toBe(1);
    expect(merchantStep([{ ...draft, ruleId: 'rule' }], 1)).toBe(3);
  });
});
