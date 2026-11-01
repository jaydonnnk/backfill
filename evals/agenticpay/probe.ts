import { readFile, open, mkdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { z } from 'zod';
import { MAX_ROUNDS, maxConcessionCents } from '../../src/domain/negotiation/rules';
import { proposalPrompt } from '../../src/lib/negotiation/merchant-agent';
import { EVALUATION_MODELS } from './models';
import { scenarios, scenarioRule } from './scenarios';
import { classify, requestBody, type ReasoningEffort } from './openrouter';

// One-use diagnostic, authorized 2026-11-02: replay the four prompts that failed in run
// s9-20261101-authorized-01, unchanged and then with reasoning effort "low", and keep the raw replies.
// Writes no database rows and no eval result; eight calls at most, no retries.
const probeId = 's9-20261102-diagnostic-01';
if (process.argv[2] !== `--execute-${probeId}`) throw new Error('This entrypoint requires the exact one-use probe ID');
const directory = 'docs/plans/backfill/evidence/s9-diagnosis';
await mkdir(directory, { recursive: true });
const out = await open(`${directory}/${probeId}.json`, 'wx', 0o600);
const apiKey = parseEnv(await readFile('.env.local', 'utf8')).OPENROUTER_API_KEY;
if (!apiKey) throw new Error('Missing OpenRouter credential');
const key = async () => z.object({ data: z.object({ usage: z.number(), limit: z.number(), limit_remaining: z.number() }) }).parse(await (await fetch('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${apiKey}` } })).json()).data;

// Failed rounds of the original run: [model index, scenario, round, previous price].
const failed = [[0, 'flexible', 1, 800], [0, 'tight-floor', 2, 800], [0, 'low-budget', 2, 800], [1, 'low-budget', 2, 800]] as const;
const before = await key();
if (before.limit_remaining < 0.5) throw new Error('Too little key allowance for the probe');
const results = [];
try {
  for (const effort of [undefined, 'low'] as (ReasoningEffort | undefined)[]) for (const [m, id, round, previous] of failed) {
    const scenario = scenarios.find(s => s.id === id)!;
    const prompt = proposalPrompt({ merchantName: 'Synthetic evaluation cafe', listPriceCents: 1000, offerPriceCents: 800, previousPriceCents: previous, bidCents: scenario.limit, covers: 1, round, maxRounds: MAX_ROUNDS, maxConcessionCents: maxConcessionCents(scenarioRule(scenario)) });
    const started = performance.now();
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, signal: AbortSignal.timeout(120_000), body: JSON.stringify(requestBody(EVALUATION_MODELS[m], prompt, effort)) });
    const body = await response.json() as { id?: string; choices?: { finish_reason?: string; native_finish_reason?: string; message?: { content?: string | null; reasoning?: string | null } }[]; usage?: { completion_tokens?: number; cost?: number; completion_tokens_details?: { reasoning_tokens?: number } } };
    const choice = body.choices?.[0];
    const verdict = classify(choice?.message?.content ?? null, choice?.finish_reason ?? null);
    results.push({ model: EVALUATION_MODELS[m], scenario: id, round, effort: effort ?? 'provider default', httpStatus: response.status, latencyMs: Math.round(performance.now() - started), generationId: body.id ?? null, finishReason: choice?.finish_reason ?? null, nativeFinishReason: choice?.native_finish_reason ?? null, completionTokens: body.usage?.completion_tokens ?? null, reasoningTokens: body.usage?.completion_tokens_details?.reasoning_tokens ?? null, costUsd: body.usage?.cost ?? null, ...verdict, content: choice?.message?.content ?? null, reasoningChars: choice?.message?.reasoning?.length ?? null, reasoningTail: choice?.message?.reasoning?.slice(-400) ?? null });
    console.log(JSON.stringify(results.at(-1), (k, v) => k === 'content' || k === 'reasoningTail' ? undefined : v));
    if (body.usage?.cost === undefined) throw new Error('Unknown charge: stop');
  }
} finally {
  const after = await key();
  await out.writeFile(JSON.stringify({ probeId, purpose: 'Diagnose response failures of s9-20261101-authorized-01', maxTokens: 1024, temperature: 0, providerSeed: null, startingUsageUsd: before.usage, endingUsageUsd: after.usage, usageDeltaUsd: after.usage - before.usage, remainingKeyAllowanceUsd: after.limit_remaining, results }, null, 2) + '\n');
  await out.sync(); await out.close();
}
