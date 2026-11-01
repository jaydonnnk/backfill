import { describe, it, expect } from 'vitest';
import fixture from '../../evals/fixtures/synthetic-preview.json';
import { validateRun, summarize } from '../../evals/agenticpay/contract';
import { evaluate } from '../../evals/agenticpay/runner';
import { openRouterAttempt } from '../../evals/agenticpay/openrouter';

describe('S9 evaluation evidence', () => {
  it('replays real domain guards, floor refusals and zero-deal denominators', () => {
    const run = validateRun(fixture);
    expect(run.summary[0]).toMatchObject({ deals: 1, dealRate: 1/3, savingsCents: 220, refusals: 3 });
    expect(run.summary[1]).toMatchObject({ deals: 0, costPerDealNanoUsd: null });
  });
  it.each(['cost','proposal','seed','summary','duplicate','foreign','missing','outcome'])('rejects corrupt %s evidence', fault => {
    const run = structuredClone(fixture);
    if (fault === 'cost') run.calls[0]!.costNanoUsd++;
    if (fault === 'proposal') run.episodes[0]!.rounds[0]!.proposalCents = 1;
    if (fault === 'seed') run.episodes[0]!.seed++;
    if (fault === 'summary') run.summary[0]!.deals++;
    if (fault === 'duplicate') run.calls[1]!.id = run.calls[0]!.id;
    if (fault === 'foreign') run.calls[0]!.purpose = 'negotiation';
    if (fault === 'missing') run.calls.pop();
    if (fault === 'outcome') run.episodes[0]!.outcome = 'no_deal';
    expect(() => validateRun(run)).toThrow();
  });
  it('keeps unknown cost unavailable', () => {
    const run = validateRun(fixture);
    run.calls[0]!.costNanoUsd = null; run.episodes[0]!.costNanoUsd = null;
    run.summary = summarize(run.config.models,run.episodes,run.calls);
    expect(validateRun(run).summary[0]!.costPerDealNanoUsd).toBeNull();
  });
  it('gives both models identical initial prompts and seeds, bounds attempts and retains failures', async () => {
    let id=0; const requests: { model: string; purpose: string; prompt: string }[]=[];
    const run = await evaluate({ runId: 'test', kind: 'synthetic', models: ['a','b'], revision: '1234567', checkpoint: async r => { expect(() => validateRun(r)).not.toThrow(); }, attempt: async r => { requests.push(r); return { id: ++id, purpose: r.purpose, model: r.model, provider: 'openrouter', attempt: 1, ok: false, proposalCents: null, costNanoUsd: 10 }; } });
    expect(requests).toHaveLength(6);
    for (let i=0;i<6;i+=2) { expect(requests[i]!.prompt).toBe(requests[i+1]!.prompt); expect(run.episodes[i]!.seed).toBe(run.episodes[i+1]!.seed); }
    expect(run.status).toBe('failed'); expect(run.summary[0]).toMatchObject({ failed: 3, costNanoUsd: 30, dealRate: 0 });
    expect(requests[0]!.prompt).not.toContain('floor');
  });
  it('persists provider charges on invalid replies and never retries', async () => {
    const order: string[]=[];
    const attempt = openRouterAttempt({ apiKey: 'dummy', journal: async () => { order.push('journal'); }, fetch: async () => { order.push('fetch'); return new Response(JSON.stringify({ choices: [{ message: { content: 'broken' } }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: .0002 } })); }, persist: async row => { order.push('persist'); expect(row.costNanoUsd).toBe(200000); expect(row.ok).toBe(false); return 7; } });
    expect(await attempt({ model: 'test', purpose: 'eval:test:0:1', prompt: 'test' })).toMatchObject({ id: 7, costNanoUsd: 200000, ok: false });
    expect(order).toEqual(['journal','fetch','persist']);
  });
  it('propagates recording failure and marks transport cost unknown', async () => {
    const attempt = openRouterAttempt({ apiKey: 'dummy', journal: async () => {}, fetch: async () => { throw new Error('offline'); }, persist: async row => { expect(row.error).toBe('eval_cost_unknown'); throw new Error('storage unavailable'); } });
    await expect(attempt({ model: 'test', purpose: 'eval:test:0:1', prompt: 'test' })).rejects.toThrow('storage unavailable');
  });
});

it('rejects invalid configuration before any attempt', async () => {
  let attempted = false;
  await expect(evaluate({ runId: '../unsafe', kind: 'measured', models: ['same','same'], revision: '1234567', checkpoint: async () => {}, attempt: async () => { attempted=true; throw new Error('must not run'); } })).rejects.toThrow();
  expect(attempted).toBe(false);
});

it('sends symmetric seed-free requests for the exact selected model snapshots', async () => {
  const { EVALUATION_MODELS } = await import('../../evals/agenticpay/models');
  expect(EVALUATION_MODELS).toEqual(['meta/muse-spark-1.3','deepseek/deepseek-v4.1-flash-1017']);
  const bodies: Record<string, unknown>[] = [];
  let id=0;
  const attempt = openRouterAttempt({ apiKey: 'dummy', journal: async () => {}, persist: async () => ++id, fetch: async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"priceCents":780,"rationale":"fixture"}' } }], usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0 } }));
  } });
  for (const model of EVALUATION_MODELS) await attempt({ model, purpose: 'eval:test:0:1', prompt: 'identical scenario' });
  for (const body of bodies) {
    expect(body).not.toHaveProperty('seed');
    expect(body.provider).toEqual({ require_parameters: true, allow_fallbacks: false });
  }
  expect(bodies.map(body => body.model)).toEqual(EVALUATION_MODELS);
  expect({ ...bodies[0], model: null }).toEqual({ ...bodies[1], model: null });
});

it('rejects measured model substitutions and provider-seed claims', async () => {
  const run = structuredClone(fixture);
  run.kind = 'measured';
  expect(() => validateRun(run)).toThrow();
  expect(() => validateRun({ ...fixture, config: { ...fixture.config, providerSeed: 17 } })).toThrow();
  let attempted = false;
  await expect(evaluate({ runId: 'alias-test', kind: 'measured', models: ['meta/muse-spark-1.3','~deepseek/deepseek-flash-latest'], revision: '1234567', checkpoint: async () => {}, attempt: async () => { attempted = true; throw new Error('must not run'); } })).rejects.toThrow();
  expect(attempted).toBe(false);
});
