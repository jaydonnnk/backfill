import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { guardedGatewayFetch, GATEWAY_CASES, CEILING_USD } from './proof-s4-live-guard.mjs';
const endpoint = 'https://ai-gateway.vercel.sh/v4/ai/language-model';
const body = { maxOutputTokens: 512, reasoning: 'low', providerOptions: { gateway: { only: ['baseten'] } }, prompt: [{ role: 'system', content: 'Bounded synthetic case' }] };
const init = { method: 'POST', redirect: 'error', headers: { 'ai-language-model-id': 'meta/muse-spark-open', 'ai-language-model-streaming': 'false', Authorization: 'Bearer offline-dummy' }, body: JSON.stringify(body) };
async function setup(work) {
  const directory = await mkdtemp(join(tmpdir(), 'backfill-s4-guard-'));
  try {
    await writeFile(join(directory, 'current-case.json'), JSON.stringify({ name: GATEWAY_CASES[0] }));
    await writeFile(join(directory, `${GATEWAY_CASES[0]}-approved-request.json`), JSON.stringify({ prompt: body.prompt }));
    await work(directory);
  } finally { await rm(directory, { recursive: true }); }
}
test('reserves all five cases once across independent guard instances; never stores auth headers', () => setup(async directory => {
  let calls = 0;
  const upstream = async () => { calls++; return new Response('{}'); };
  for (const name of GATEWAY_CASES) {
    await writeFile(join(directory, 'current-case.json'), JSON.stringify({ name }));
    await writeFile(join(directory, `${name}-approved-request.json`), JSON.stringify({ prompt: body.prompt }));
    await guardedGatewayFetch({ directory, upstream })(endpoint, init);
    await assert.rejects(guardedGatewayFetch({ directory, upstream })(endpoint, init), /EEXIST/);
  }
  assert.equal(calls, 5); assert.equal((await readdir(directory)).filter(p => p.endsWith('-dispatch.json')).length, 5);
  assert(CEILING_USD >= 5 * (1048576 * 0.00000125 + 512 * 0.00000425));
}));
test('failure consumes its durable slot; modified settings, unknown cases and remote paths dispatch nothing', () => setup(async directory => {
  let calls = 0;
  const guard = guardedGatewayFetch({ directory, upstream: async () => { calls++; throw Error('network'); } });
  await assert.rejects(guard(endpoint, init), /no retry/);
  await assert.rejects(guard(endpoint, init), /EEXIST/);
  assert.equal(calls, 1);
  for (const patch of [{ maxOutputTokens: 513 }, { reasoning: 'high' }, { providerOptions: { gateway: { only: ['fireworks'] } } }, { prompt: [{ role: 'user', content: 'changed' }] }, { tools: [{ name: 'commit' }] }]) await assert.rejects(guard(endpoint, { ...init, body: JSON.stringify({ ...body, ...patch }) }));
  await assert.rejects(guard('https://other.invalid/v4/ai/language-model', init));
  await writeFile(join(directory, 'current-case.json'), JSON.stringify({ name: 'sixth-call' }));
  await assert.rejects(guard(endpoint, init));
  assert.equal(calls, 1);
}));
