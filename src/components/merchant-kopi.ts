import type { KopiCue } from './kopi-state';
import type { Dashboard } from '@/lib/onboarding/service';

type Draft = Pick<Dashboard['drafts'][number], 'id' | 'ruleId' | 'verdict'>;
type Plan = Pick<Dashboard['plans'][number], 'verdict' | 'applied'>;
const awaitingTerms = (draft: Draft) => draft.ruleId === null && draft.verdict === 'ok';

export function merchantStep(drafts: Draft[], offerCount: number): 1 | 2 | 3 {
  return drafts.some(awaitingTerms) ? 2 : offerCount > 0 ? 3 : 1;
}

export function merchantKopiCue(drafts: Draft[], plans: Plan[], publishedDraftId?: string): KopiCue {
  const published = drafts.find(d => d.id === publishedDraftId && d.ruleId !== null);
  if (published) return { pose: 'happy', text: 'This menu has a published offer.' };
  const plan = plans.at(-1);
  if (plan && !plan.applied) return plan.verdict === 'ok'
    ? { pose: 'watching', text: 'Stored plan awaits your approval.' }
    : { pose: 'shield', text: 'Stored plan is not usable.' };
  if (drafts.some(awaitingTerms)) return { pose: 'watching', text: 'Menu ready. Confirm your terms.' };
  return { pose: 'idle', text: 'Your offers. Your terms.' };
}
