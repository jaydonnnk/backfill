import { expect, it, vi } from 'vitest';
import { gatewayBuyer, glimmerParser } from '@/lib/buyer/models';
import { buyerDeps } from '@/lib/buyer/deps';
import { INTENT } from '../support/proof-s4';
const offer = { merchantName: 'Cafe', about: 'kopi', summary: 'Two covers at SGD5.44', visitDate: '2026-11-03', commitBy: '2026-11-03T04:00:00.000Z', startsAt: '2026-11-03T06:00:00.000Z', endsAt: '2026-11-03T09:00:00.000Z', perAgentCapCovers: 2 };
it('hosted Glimmer uses NVIDIA, explicit intent contract and supplied usage without retaining reasoning', async () => {
  let calls = 0;
  let content = JSON.stringify(INTENT);
  let finish = 'stop';
  let metadata = true;
  const transport: typeof fetch = async (url, init) => {
    calls++; expect(String(url)).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer offline-dummy');
    expect(init?.redirect).toBe('error');
    const request = JSON.parse(String(init?.body));
    expect(request.max_tokens).toBe(1024);
    expect(request.chat_template_kwargs).toEqual({ reasoning_strength: 'low' });
    expect(request.temperature).toBe(1);
    expect(request.model).toBe('meta/muse-glimmer-30b');
    expect(request.top_p).toBe(0.95);
    expect(request.stream).toBe(false);
    expect(request.messages[0].content).toContain('exactly');
    for (const key of Object.keys(INTENT)) expect(request.messages[0].content).toContain(key);
    expect(request.messages[1].content).toBe(JSON.stringify({ referenceClock: '2026-11-03T01:00:00.000Z', timeZone: 'Asia/Singapore', request: 'Synthetic request' }));
    expect(JSON.stringify(request)).not.toMatch(/floorPrice|owner_voice|merchant rationale/);
    return Response.json({ ...(metadata ? { model: 'synthetic-served-glimmer' } : {}), choices: [{ finish_reason: finish, message: { content, reasoning_content: 'DO_NOT_RETAIN' } }], usage: { prompt_tokens: 100, completion_tokens: 40 } });
  };
  process.env.NVIDIA_API_KEY = 'offline-dummy';
  try {
    const parse = () => glimmerParser(transport)('Synthetic request', '2026-11-03T01:00:00.000Z');
    const r = await parse();
    expect(r.value).toEqual(INTENT);
    expect(r.receipt).toEqual({ source: 'provider', route: 'nvidia_nim', model: 'meta/muse-glimmer-30b', servedModel: 'synthetic-served-glimmer', upstream: null, inputTokens: 100, outputTokens: 40, costUsd: null });
    expect(JSON.stringify(r)).not.toContain('DO_NOT_RETAIN');
    content = JSON.stringify({ ...INTENT, budgetPerCoverCents: null, currency: null });
    expect((await parse()).value.currency).toBeNull();
    for (const invalid of ['not JSON', JSON.stringify({ ...INTENT, partySize: 2.5 }), JSON.stringify({ ...INTENT, hidden_reasoning: 'private' }), '```json\n{}\n```', JSON.stringify({ ...INTENT, earliest: '18:00' })]) {
      content = invalid;
      await expect(parse()).rejects.toMatchObject({ receipt: { model: 'meta/muse-glimmer-30b', inputTokens: 100, outputTokens: 40 } });
    }
    content = JSON.stringify(INTENT); finish = 'length';
    await expect(parse()).rejects.toThrow('invalid_or_incomplete_model_output');
    finish = 'stop'; metadata = false;
    expect((await parse()).receipt.servedModel).toBeNull();
    expect(calls).toBe(9);
  } finally { delete process.env.NVIDIA_API_KEY; }
});
it('hosted Glimmer makes one attempt on provider failure and aborts at 45 seconds without retry', async () => {
  process.env.NVIDIA_API_KEY = 'offline-dummy';
  let calls = 0;
  try {
    await expect(glimmerParser(async () => { calls++; return new Response('Synthetic failure', { status: 503 }); })('Synthetic', '2026-11-03T01:00:00.000Z')).rejects.toThrow();
    expect(calls).toBe(1);
    vi.useFakeTimers();
    // Native AbortSignal.timeout uses real timers. Stub only the clock at the transport boundary.
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      expect(ms).toBe(45_000);
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), ms);
      return controller.signal;
    });
    const transport: typeof fetch = async (_url, init) => {
      calls++;
      return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true }));
    };
    const pending = glimmerParser(transport)('Synthetic', '2026-11-03T01:00:00.000Z');
    const rejected = expect(pending).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(45_000);
    await rejected;
    expect(calls).toBe(2);
    timeout.mockRestore();
  } finally { vi.restoreAllMocks(); vi.useRealTimers(); delete process.env.NVIDIA_API_KEY; }
});
it('Gateway sends the installed SDK route with low reasoning, bounded tokens and exactly one attempt on provider error', async () => {
  let calls = 0;
  const transport: typeof fetch = async (url, init) => {
    calls++;
    expect(String(url)).toContain('ai-gateway.vercel.sh');
    expect(init?.redirect).toBe('error');
    const request = JSON.parse(String(init?.body));
    expect(JSON.stringify(request)).toContain('low');
    expect(JSON.stringify(request)).toContain('512');
    expect(JSON.stringify(request)).not.toMatch(/floorPrice|owner_voice|merchant rationale/);
    return new Response('Synthetic provider failure', { status: 503 });
  };
  // Dummy configuration only. Never load an env file.
  const previous = process.env.AI_GATEWAY_API_KEY;
  process.env.AI_GATEWAY_API_KEY = 'offline-dummy';
  try { await expect(gatewayBuyer(transport)('party', 'Two for kopi', INTENT, offer)).rejects.toThrow(); }
  finally { if (previous === undefined) delete process.env.AI_GATEWAY_API_KEY; else process.env.AI_GATEWAY_API_KEY = previous; }
  expect(calls).toBe(1);
});
it('default production dependencies require separate authorities before either model dispatch', async () => {
  const deps = buyerDeps();
  await expect(deps.parse('Synthetic request', '2026-11-03T01:00:00.000Z')).rejects.toThrow('nvidia_glimmer_approval_required');
  await expect(deps.decide('party', 'Synthetic request', INTENT, offer)).rejects.toThrow('gateway_approval_required');
  process.env.BACKFILL_S4_GLIMMER_APPROVED = '1';
  process.env.BACKFILL_S4_HOSTED_GLIMMER_APPROVED = '1';
  process.env.BACKFILL_S4_GATEWAY_APPROVED = '1';
  try { await expect(deps.parse('Synthetic request', '2026-11-03T01:00:00.000Z')).rejects.toThrow('nvidia_glimmer_approval_required'); }
  finally { delete process.env.BACKFILL_S4_HOSTED_GLIMMER_APPROVED; delete process.env.BACKFILL_S4_GLIMMER_APPROVED; delete process.env.BACKFILL_S4_GATEWAY_APPROVED; }
});
it('parses actual SDK final text, refuses malformed or truncated decisions and retains no reasoning', async () => {
  let content = JSON.stringify({ covers: 2, reason: 'Fits the reviewed request' });
  let finish = 'stop';
  const transport: typeof fetch = async (_url, init) => {
    expect(new Headers(init?.headers).get('ai-language-model-id')).toBe('meta/muse-spark-open');
    const request = JSON.parse(String(init?.body));
    expect(request.providerOptions.gateway).toEqual({ only: ['baseten'] });
    expect(request.prompt[0].content).toContain('exactly two fields');
    expect(request.prompt[0].content).toContain('1-200');
    return Response.json({ content: [{ type: 'reasoning', text: 'HIDDEN_DO_NOT_RETAIN' }, { type: 'text', text: content }], finishReason: { unified: finish, raw: finish }, usage: { inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 40, text: 20, reasoning: 20 } }, providerMetadata: { gateway: { routing: { finalProvider: 'baseten' } } } });
  };
  const previous = process.env.AI_GATEWAY_API_KEY; process.env.AI_GATEWAY_API_KEY = 'offline-dummy';
  try {
    const decide = gatewayBuyer(transport);
    const r = await decide('synthetic', 'Two for kopi', INTENT, offer);
    expect(r.value).toEqual({ covers: 2, reason: 'Fits the reviewed request' });
    expect(r.receipt).toMatchObject({ route: 'vercel_gateway', upstream: 'baseten', inputTokens: 100, outputTokens: 40, costUsd: null });
    expect(JSON.stringify(r)).not.toContain('HIDDEN_DO_NOT_RETAIN');
    finish = 'length'; await expect(decide('synthetic', 'Two for kopi', INTENT, offer)).rejects.toThrow('invalid_or_incomplete_model_output');
    finish = 'stop'; content = 'not JSON'; await expect(decide('synthetic', 'Two for kopi', INTENT, offer)).rejects.toMatchObject({ receipt: { inputTokens: 100, outputTokens: 40, costUsd: null } });
    content = JSON.stringify({ covers: 2, reason: 'Fits', hidden_reasoning: 'not allowed' }); await expect(decide('synthetic', 'Two for kopi', INTENT, offer)).rejects.toThrow();
  } finally { if (previous === undefined) delete process.env.AI_GATEWAY_API_KEY; else process.env.AI_GATEWAY_API_KEY = previous; }
});

it('missing NVIDIA key refuses before dispatch', async () => {
  delete process.env.NVIDIA_API_KEY;
  let calls = 0;
  await expect(glimmerParser(async () => { calls++; return Response.json({}); })('Synthetic', '2026-11-03T01:00:00.000Z')).rejects.toThrow('nvidia_key_required');
  expect(calls).toBe(0);
});

it('NVIDIA refuses pending, authentication, quota and server errors without polling or retries', async () => {
  process.env.NVIDIA_API_KEY = 'offline-dummy';
  try {
    for (const status of [202, 401, 429, 503]) {
      let calls = 0;
      await expect(glimmerParser(async () => { calls++; return Response.json({ detail: 'synthetic' }, { status }); })('Synthetic', '2026-11-03T01:00:00.000Z')).rejects.toThrow('nvidia_model_failed');
      expect(calls).toBe(1);
    }
  } finally { delete process.env.NVIDIA_API_KEY; }
});
it('NVIDIA rejects empty final text, multiple choices and tool calls while retaining usage only', async () => {
  process.env.NVIDIA_API_KEY = 'offline-dummy';
  const valid = { finish_reason: 'stop', message: { content: JSON.stringify(INTENT) } };
  try {
    for (const choices of [[], [valid, valid], [{ ...valid, message: { content: '', reasoning_content: 'PRIVATE' } }], [{ ...valid, message: { ...valid.message, tool_calls: [{ function: 'commit' }] } }]]) {
      const parse = glimmerParser(async () => Response.json({ choices, usage: { prompt_tokens: 12, completion_tokens: 30 } }));
      await expect(parse('Synthetic', '2026-11-03T01:00:00.000Z')).rejects.toMatchObject({ receipt: { route: 'nvidia_nim', inputTokens: 12, outputTokens: 30, costUsd: null } });
    }
  } finally { delete process.env.NVIDIA_API_KEY; }
});
it('NVIDIA accepts a text-only response with explicitly null tool calls', async () => {
  process.env.NVIDIA_API_KEY = 'offline-dummy';
  try {
    const result = await glimmerParser(async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(INTENT), tool_calls: null } }] }))('Synthetic', '2026-11-03T01:00:00.000Z');
    expect(result.value).toEqual(INTENT);
  } finally { delete process.env.NVIDIA_API_KEY; }
});
