import { MAX_ROUNDS, maxConcessionCents, settleRound } from '../../src/domain/negotiation/rules';
import { proposalPrompt } from '../../src/lib/negotiation/merchant-agent';
import { scenarios, scenarioRule } from './scenarios';
import { purpose, summarize, validateRun, type Run, type StoredCall, type EpisodeResult } from './contract';
export type Attempt = (request: { model: string; purpose: string; prompt: string }) => Promise<StoredCall>;
export async function evaluate(options: { runId: string; kind: Run['kind']; models: [string,string]; revision: string; reasoningEffort?: 'low'; attempt: Attempt; checkpoint: (run: Run) => Promise<void> }): Promise<Run> {
  const episodes: EpisodeResult[] = [], calls: StoredCall[] = [];
  const run: Run = { version: 1, runId: options.runId, kind: options.kind, revision: options.revision, createdAt: new Date().toISOString(), config: { protocol: 'backfill-v1', providerSeed: null, models: options.models, maxRounds: MAX_ROUNDS, maxAttempts: 1, maxTokens: 1024, temperature: 0, maxCalls: 18, ...(options.reasoningEffort ? { reasoningEffort: options.reasoningEffort } : {}) }, status: 'partial', episodes, calls, summary: [] };
  run.summary = summarize(options.models, episodes, calls);
  validateRun(run);
  for (const scenario of scenarios) for (const [index,model] of options.models.entries()) {
    const rule = scenarioRule(scenario), id = `${index}-${scenario.id}`;
    const e: EpisodeResult = { id, model, scenarioId: scenario.id, seed: scenario.seed, rounds: [], outcome: 'no_deal', savingsCents: 0, costNanoUsd: 0 };
    let price = 800;
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      const call = await options.attempt({ model, purpose: purpose(run.runId,id,round), prompt: proposalPrompt({ merchantName: 'Synthetic evaluation cafe', listPriceCents: 1000, offerPriceCents: 800, previousPriceCents: price, bidCents: scenario.limit, covers: 1, round, maxRounds: MAX_ROUNDS, maxConcessionCents: maxConcessionCents(rule) }) });
      calls.push(call);
      const outcome = settleRound({ rule, round, previousPriceCents: price, bidCents: scenario.limit },call.proposalCents);
      price = outcome.counterCents ?? price;
      e.rounds.push({ round, bidCents: scenario.limit, proposalCents: call.proposalCents, counterCents: price, refusal: outcome.proposal && !outcome.proposal.verdict.ok ? outcome.proposal.verdict.reason : null, callIds: [call.id] });
      e.costNanoUsd = e.costNanoUsd === null || call.costNanoUsd === null ? null : e.costNanoUsd + call.costNanoUsd;
      if (!call.ok) { e.outcome = 'failed'; break; }
      if (price <= scenario.limit) { e.outcome = 'deal'; e.savingsCents = 1000-price; break; }
    }
    episodes.push(e); run.summary = summarize(options.models,episodes,calls);
    await options.checkpoint(validateRun(run));
  }
  run.status = episodes.some(e => e.outcome === 'failed') ? 'failed' : 'complete';
  const final = validateRun(run);
  await options.checkpoint(final);
  return final;
}
