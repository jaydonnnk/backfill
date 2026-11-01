import { z } from 'zod';
import { MerchantProposal } from '../../src/lib/negotiation/merchant-agent';
import type { LlmCallRecord } from '../../src/integrations/meta/provider';
import type { Attempt } from './runner';
import type { StoredCall } from './contract';

const Response = z.object({ id: z.string().optional(), choices: z.array(z.object({ finish_reason: z.string().nullish(), message: z.object({ content: z.string().nullable() }) })), usage: z.object({ prompt_tokens: z.int().nonnegative(), completion_tokens: z.int().nonnegative(), cost: z.number().nonnegative().optional(), completion_tokens_details: z.object({ reasoning_tokens: z.int().nonnegative().nullish() }).nullish() }).optional() });
export type ReasoningEffort = 'low';
// Why an attempt produced no proposal. 'truncated' means the provider stopped at the token budget
// (finish_reason "length"); reasoning shares that budget, so it can end before any JSON is written.
export type Failure = 'none' | 'transport' | 'http' | 'body' | 'truncated' | 'empty' | 'invalid_json' | 'schema';
export type Diagnostic = { purpose: string; model: string; generationId: string | null; httpStatus: number | null; finishReason: string | null; completionTokens: number | null; reasoningTokens: number | null; contentChars: number | null; failure: Failure };
export function requestBody(model: string, prompt: string, reasoningEffort?: ReasoningEffort) {
  return { model, temperature: 0, max_tokens: 1024, ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}), provider: { require_parameters: true, allow_fallbacks: false }, messages: [{ role: 'system', content: 'You are the pricing agent of a synthetic Singapore cafe. Reply only with JSON matching the schema.' }, { role: 'user', content: prompt }], response_format: { type: 'json_schema', json_schema: { name: 'MerchantProposal', strict: true, schema: z.toJSONSchema(MerchantProposal) } } };
}
export function classify(content: string | null, finishReason: string | null): { failure: Failure; priceCents: number | null } {
  const cut = (f: Failure): Failure => finishReason === 'length' ? 'truncated' : f;
  if (content === null || content.trim() === '') return { failure: cut('empty'), priceCents: null };
  let json: unknown;
  try { json = JSON.parse(content); } catch { return { failure: cut('invalid_json'), priceCents: null }; }
  const parsed = MerchantProposal.safeParse(json);
  return parsed.success ? { failure: 'none', priceCents: parsed.data.priceCents } : { failure: cut('schema'), priceCents: null };
}
// No credentials or environment loading here. The paid CLI stays closed pending authorization.
export function openRouterAttempt(options: { apiKey: string; fetch: typeof fetch; persist: (row: LlmCallRecord) => Promise<number>; journal: (request: { purpose: string; model: string }) => Promise<void>; diagnose?: (diagnostic: Diagnostic) => Promise<void>; reasoningEffort?: ReasoningEffort }): Attempt {
  return async request => {
    await options.journal(request);
    const started = performance.now();
    let proposal: number | null = null, cost: number | null = null, tokensIn = 0, tokensOut = 0, status: number | null = null;
    const d: Diagnostic = { purpose: request.purpose, model: request.model, generationId: null, httpStatus: null, finishReason: null, completionTokens: null, reasoningTokens: null, contentChars: null, failure: 'transport' };
    try {
      const response = await options.fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${options.apiKey}`, 'content-type': 'application/json' }, signal: AbortSignal.timeout(60_000), body: JSON.stringify(requestBody(request.model, request.prompt, options.reasoningEffort)) });
      status = d.httpStatus = response.status;
      const body = Response.safeParse(await response.json());
      d.failure = 'body';
      if (body.success) {
        tokensIn = body.data.usage?.prompt_tokens ?? 0; tokensOut = body.data.usage?.completion_tokens ?? 0;
        d.generationId = body.data.id ?? null; d.completionTokens = body.data.usage?.completion_tokens ?? null; d.reasoningTokens = body.data.usage?.completion_tokens_details?.reasoning_tokens ?? null;
        const reported = body.data.usage?.cost;
        if (reported !== undefined && Number.isSafeInteger(Math.round(reported * 1e9))) cost = Math.round(reported * 1e9);
        const choice = body.data.choices[0];
        d.finishReason = choice?.finish_reason ?? null; d.contentChars = choice?.message.content?.length ?? null;
        if (!response.ok) d.failure = 'http';
        else if (choice) { const result = classify(choice.message.content, d.finishReason); d.failure = result.failure; proposal = result.priceCents; }
      }
    } catch { /* Unknown transport charges remain unknown; no retry. */ }
    await options.diagnose?.(d);
    const row: LlmCallRecord = { provider: 'openrouter', model: request.model, purpose: request.purpose, attempt: 1, tokensIn, tokensOut, tokensCachedIn: 0, costNanoUsd: cost ?? 0, latencyMs: Math.round(performance.now()-started), ok: proposal !== null, httpStatus: status, error: cost === null ? 'eval_cost_unknown' : proposal === null ? `eval_response_${d.failure}` : null, output: proposal === null ? null : JSON.stringify({ priceCents: proposal }) };
    const id = await options.persist(row);
    return { id, purpose: row.purpose, model: row.model, provider: 'openrouter', attempt: 1, ok: row.ok, costNanoUsd: cost, proposalCents: proposal };
  };
}
export function storedEvidence(row: LlmCallRecord & { id: number }): StoredCall {
  if (row.provider !== 'openrouter' || row.attempt !== 1) throw new Error('Unexpected evaluation provider or attempt');
  const output = row.output === null ? null : z.strictObject({ priceCents: z.int() }).parse(JSON.parse(row.output));
  return { id: row.id, purpose: row.purpose, model: row.model, provider: 'openrouter', attempt: 1, ok: row.ok, costNanoUsd: row.error === 'eval_cost_unknown' ? null : row.costNanoUsd, proposalCents: output?.priceCents ?? null };
}
