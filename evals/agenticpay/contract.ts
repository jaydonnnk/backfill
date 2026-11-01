import { z } from 'zod';
import { EVALUATION_MODELS } from './models';
import { MAX_ROUNDS, settleRound } from '../../src/domain/negotiation/rules';
import { scenarios, scenarioRule } from './scenarios';

const count = z.int().nonnegative();
export const Call = z.strictObject({ id: z.int().positive(), purpose: z.string(), model: z.string(), provider: z.literal('openrouter'), attempt: z.literal(1), ok: z.boolean(), costNanoUsd: count.nullable(), proposalCents: z.int().nullable() });
export const Round = z.strictObject({ round: z.int().min(1).max(MAX_ROUNDS), bidCents: count, proposalCents: z.int().nullable(), counterCents: count, refusal: z.string().nullable(), callIds: z.array(z.int().positive()).max(1) });
export const Episode = z.strictObject({ id: z.string(), model: z.string(), scenarioId: z.string(), seed: count, rounds: z.array(Round).max(MAX_ROUNDS), outcome: z.enum(['deal', 'no_deal', 'failed']), savingsCents: count, costNanoUsd: count.nullable() });
const Summary = z.strictObject({ model: z.string(), scheduled: count, finished: count, failed: count, deals: count, dealRate: z.number(), savingsCents: count, refusals: count, costNanoUsd: count.nullable(), costPerDealNanoUsd: z.number().nonnegative().nullable() });
const Shape = z.strictObject({ version: z.literal(1), runId: z.string().regex(/^[a-z0-9-]{1,64}$/), kind: z.enum(['measured', 'synthetic']), createdAt: z.iso.datetime(), revision: z.string().min(7), config: z.strictObject({ protocol: z.literal('backfill-v1'), providerSeed: z.null(), models: z.tuple([z.string().min(1), z.string().min(1)]), maxRounds: z.literal(MAX_ROUNDS), maxAttempts: z.literal(1), maxTokens: z.literal(1024), temperature: z.literal(0), maxCalls: z.literal(18), reasoningEffort: z.literal('low').optional() }), status: z.enum(['complete', 'partial', 'failed']), episodes: z.array(Episode).max(6), calls: z.array(Call).max(18), summary: z.array(Summary).length(2) });
export type Run = z.infer<typeof Shape>;
export type EpisodeResult = z.infer<typeof Episode>;
export type StoredCall = z.infer<typeof Call>;
export function purpose(runId: string, episodeId: string, round: number) { return `eval:${runId}:${episodeId}:${round}`; }
export function summarize(models: readonly string[], episodes: EpisodeResult[], calls: StoredCall[]) {
  return models.map(model => {
    const rows = episodes.filter(e => e.model === model), attempts = calls.filter(c => c.model === model);
    const deals = rows.filter(e => e.outcome === 'deal').length;
    const cost = attempts.some(c => c.costNanoUsd === null) ? null : attempts.reduce((n,c) => n + (c.costNanoUsd ?? 0), 0);
    return { model, scheduled: scenarios.length, finished: rows.length, failed: rows.filter(e => e.outcome === 'failed').length, deals, dealRate: deals / scenarios.length, savingsCents: rows.reduce((n,e) => n+e.savingsCents,0), refusals: rows.flatMap(e => e.rounds).filter(r => r.refusal !== null).length, costNanoUsd: cost, costPerDealNanoUsd: deals === 0 || cost === null ? null : cost / deals };
  });
}
export function validateRun(input: unknown): Run {
  const run = Shape.parse(input);
  const fail = () => { throw new Error('Evaluation evidence is inconsistent'); };
  if (new Set(run.config.models).size !== 2 || new Set(run.calls.map(c => c.id)).size !== run.calls.length) fail();
  if (run.kind === 'measured' && run.config.models.some((model, i) => model !== EVALUATION_MODELS[i])) fail();
  const seen = new Set<string>(), used = new Set<number>();
  for (const e of run.episodes) {
    const scenario = scenarios.find(s => s.id === e.scenarioId);
    if (!scenario || scenario.seed !== e.seed || !run.config.models.includes(e.model) || seen.has(e.id) || e.id !== `${run.config.models.indexOf(e.model)}-${scenario.id}`) return fail();
    seen.add(e.id);
    let price = 800, failed = false, deal = false;
    for (const [i,r] of e.rounds.entries()) {
      if (deal || failed || r.round !== i+1 || r.bidCents !== scenario.limit) fail();
      const calls = r.callIds.map(id => run.calls.find(c => c.id === id));
      if (calls.length !== 1) fail();
      const call = calls[0];
      if (!call || used.has(call.id) || call.model !== e.model || call.purpose !== purpose(run.runId,e.id,r.round) || call.proposalCents !== r.proposalCents || call.ok !== (r.proposalCents !== null)) return fail();
      used.add(call.id); failed = !call.ok;
      const outcome = settleRound({ rule: scenarioRule(scenario), round: r.round, bidCents: scenario.limit, previousPriceCents: price }, r.proposalCents);
      const refusal = outcome.proposal && !outcome.proposal.verdict.ok ? outcome.proposal.verdict.reason : null;
      price = outcome.counterCents ?? price;
      if (r.counterCents !== price || r.refusal !== refusal) fail();
      deal = !failed && price <= scenario.limit;
    }
    const costs = run.calls.filter(c => e.rounds.some(r => r.callIds.includes(c.id)));
    const cost = costs.some(c => c.costNanoUsd === null) ? null : costs.reduce((n,c) => n+(c.costNanoUsd ?? 0),0);
    if (!e.rounds.length || (!failed && !deal && e.rounds.length !== MAX_ROUNDS) || e.outcome !== (failed ? 'failed' : deal ? 'deal' : 'no_deal') || e.savingsCents !== (deal ? 1000-price : 0) || e.costNanoUsd !== cost) fail();
  }
  if (used.size !== run.calls.length || (run.status === 'complete' && (run.episodes.length !== 6 || run.episodes.some(e => e.outcome === 'failed'))) || (run.status === 'failed' && !run.episodes.some(e => e.outcome === 'failed'))) fail();
  if (JSON.stringify(run.summary) !== JSON.stringify(summarize(run.config.models,run.episodes,run.calls))) fail();
  return run;
}
