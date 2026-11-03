import type { Intent, Models, ModelReceipt } from '../../src/lib/buyer/models';
export const INTENT: Intent = { partySize: 2, visitDate: '2026-11-03', earliest: '14:00', latest: '17:00', budgetPerCoverCents: 600, currency: 'SGD', requirements: [] };
export function buyerFixtures(): Models {
  const receipt = (role: 'glimmer' | 'spark-open'): ModelReceipt => ({ source: 'fixture', route: role === 'glimmer' ? 'nvidia_nim' : 'vercel_gateway', model: `fixture:${role}`, servedModel: null, upstream: null, inputTokens: null, outputTokens: null, costUsd: null });
  return {
    parse: async request => {
      const date = /\d{4}-\d{2}-\d{2}/.exec(request)?.[0];
      const times = request.match(/\d{2}:\d{2}/g);
      return { value: request.includes('ambiguous') ? { ...INTENT, budgetPerCoverCents: null, currency: null } : { ...INTENT, ...(date ? { visitDate: date } : {}), ...(times?.length === 2 ? { earliest: times[0]!, latest: times[1]! } : {}) }, receipt: receipt('glimmer') };
    },
    decide: async (_id, _text, intent) => ({ value: intent.budgetPerCoverCents! < 544 ? { covers: 0, reason: 'Authored fixture declines incompatible budget.' } : { covers: 2, reason: 'Authored fixture selects two covers within reviewed constraints.' }, receipt: receipt('spark-open') }),
  };
}
export const buyerDeps = buyerFixtures;
