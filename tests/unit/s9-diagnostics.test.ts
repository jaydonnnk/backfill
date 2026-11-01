import { expect, it } from 'vitest';
import { classify, openRouterAttempt, requestBody, type Diagnostic } from '../../evals/agenticpay/openrouter';
import type { LlmCallRecord } from '../../src/integrations/meta/provider';

const valid = '{"priceCents":795,"rationale":"Hold close to the offer."}';
it.each([
  ['valid proposal', valid, 'stop', 'none', 795],
  ['reasoning used the whole budget', null, 'length', 'truncated', null],
  ['empty content at the budget', '', 'length', 'truncated', null],
  ['JSON cut off at the budget', '{"priceCents":79', 'length', 'truncated', null],
  ['null content without truncation', null, 'stop', 'empty', null],
  ['prose instead of JSON', 'I propose 795 cents.', 'stop', 'invalid_json', null],
  ['schema violation', '{"priceCents":"795"}', 'stop', 'schema', null],
  ['rationale over 300 characters', JSON.stringify({ priceCents: 795, rationale: 'x'.repeat(301) }), 'stop', 'schema', null],
] as const)('classifies %s', (_name, content, finish, failure, price) => {
  expect(classify(content, finish)).toEqual({ failure, priceCents: price });
});

it('records truncation evidence with the charge and keeps the call failed', async () => {
  const diagnostics: Diagnostic[] = [], rows: LlmCallRecord[] = [];
  const attempt = openRouterAttempt({ apiKey: 'dummy', journal: async () => {}, diagnose: async d => { diagnostics.push(d); }, persist: async row => { rows.push(row); return 1; },
    fetch: async () => new Response(JSON.stringify({ id: 'gen-test-1', choices: [{ finish_reason: 'length', message: { content: null } }], usage: { prompt_tokens: 286, completion_tokens: 1064, cost: 0.0048795, completion_tokens_details: { reasoning_tokens: 1064 } } })) });
  expect(await attempt({ model: 'meta/muse-spark-1.3', purpose: 'eval:test:0-flexible:1', prompt: 'p' })).toMatchObject({ ok: false, proposalCents: null, costNanoUsd: 4879500 });
  expect(diagnostics).toEqual([{ purpose: 'eval:test:0-flexible:1', model: 'meta/muse-spark-1.3', generationId: 'gen-test-1', httpStatus: 200, finishReason: 'length', completionTokens: 1064, reasoningTokens: 1064, contentChars: null, failure: 'truncated' }]);
  expect(rows[0]).toMatchObject({ ok: false, error: 'eval_response_truncated', output: null, tokensOut: 1064 });
});

it('sends a reasoning effort only when configured, identically for both models', () => {
  expect(requestBody('a', 'p')).not.toHaveProperty('reasoning');
  expect(requestBody('a', 'p', 'low').reasoning).toEqual({ effort: 'low' });
  expect({ ...requestBody('a', 'p', 'low'), model: null }).toEqual({ ...requestBody('b', 'p', 'low'), model: null });
});

it('records the reasoning effort in the run and keeps runs without it valid', async () => {
  const { evaluate } = await import('../../evals/agenticpay/runner');
  const { validateRun } = await import('../../evals/agenticpay/contract');
  let id = 0;
  const run = await evaluate({ runId: 'effort-test', kind: 'synthetic', models: ['a', 'b'], revision: '1234567', reasoningEffort: 'low', checkpoint: async () => {}, attempt: async r => ({ id: ++id, purpose: r.purpose, model: r.model, provider: 'openrouter', attempt: 1, ok: true, proposalCents: 780, costNanoUsd: 1 }) });
  expect(run.config.reasoningEffort).toBe('low');
  expect(() => validateRun({ ...run, config: { ...run.config, reasoningEffort: 'high' } })).toThrow();
  const defaultConfig: Record<string, unknown> = { ...run.config };
  delete defaultConfig.reasoningEffort;
  expect(validateRun({ ...run, config: defaultConfig }).config).not.toHaveProperty('reasoningEffort');
});
