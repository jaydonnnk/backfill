import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { MenuDraft, RuleSettings } from '../../src/domain/onboarding/menu';
import type { WonderPlan } from '../../src/domain/onboarding/replan';
import { ToolReplies } from '../../src/lib/mcp/server';

// Authored synthetic fixtures, not model output or real customer approvals.
export const MENU: MenuDraft = {
  currency: 'SGD',
  items: [{ name: 'Fixture kaya toast', priceCents: 450 }, { name: 'Fixture kopi', priceCents: 230 }],
  cover: { itemIndexes: [0, 1], description: 'Synthetic kaya toast and kopi' },
};
export const PHOTO = Buffer.from('89504e470d0a1a0a', 'hex'); // Signature only; no real menu photograph.
export const SETTINGS: RuleSettings = {
  capacityCovers: 8,
  terms: {
    window: { weekday: 2, startMinute: 840, endMinute: 1020, commitByMinute: 720 },
    discountBps: 2000, minPoolCovers: 8, perAgentCapCovers: 2, floorPriceCents: 503,
  },
};
export const PLAN: WonderPlan = {
  discountBps: 1500, capacityCovers: 10, minPoolCovers: 8, perAgentCapCovers: 2,
  rationale: 'SCRIPTED S1 WONDER FIXTURE: add two covers after this synthetic sellout.',
};
export const BEFORE = new Date('2026-11-03T09:00:00+08:00');
export const AFTER = new Date('2026-11-03T12:00:01+08:00');
export const VISIT = '2026-11-03';

export async function connectBuyer(token: string, endpoint: string, fetchImpl?: typeof fetch): Promise<Client> {
  const client = new Client({ name: 'scripted-proof-s1-buyer', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(endpoint), {
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }));
  return client;
}

export async function call<T extends keyof typeof ToolReplies>(client: Client, name: T, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  return ToolReplies[name].parse(result.structuredContent);
}

export function submission(ruleId: string, visitDate: string, party: string) {
  return { ruleId, termsVersion: 1, visitDate, covers: 2, maxPricePerCoverCents: 544, idempotencyKey: `scripted-approval-${party}` };
}
