import { MerchantRule } from '../../src/domain/offers/schema';

export const scenarios = [
  { id: 'flexible', seed: 17, floor: 720, limit: 780 },
  { id: 'tight-floor', seed: 29, floor: 795, limit: 780 },
  { id: 'low-budget', seed: 43, floor: 720, limit: 700 },
] as const;
export function scenarioRule(scenario: typeof scenarios[number]) {
  return MerchantRule.parse({ id: '00000000-0000-4000-8000-000000000001', merchantId: '00000000-0000-4000-8000-000000000002', termsVersion: 1,
    listPriceCents: 1000, capacityCovers: 10, terms: { discountBps: 2000, floorPriceCents: scenario.floor, minPoolCovers: 1, perAgentCapCovers: 2,
      window: { weekday: 1, startMinute: 840, endMinute: 960, commitByMinute: 720 } } });
}
