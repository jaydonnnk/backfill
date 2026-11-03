import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { guardedNvidiaFetch, guardedNvidiaClarificationFetch, NVIDIA_CASES, REFERENCE_CLOCK } from './proof-s4-nvidia-guard.mjs';

test('NVIDIA guard reserves at most two exact requests across guard instances; failures consume slots', async () => {
  const directory = await mkdtemp(join(tmpdir(), 's4-nvidia-guard-'));
  let calls = 0;
  try {
    for (const c of NVIDIA_CASES) {
      await writeFile(join(directory, 'current-case.json'), JSON.stringify({ id: c.id }));
      const body = { model: 'meta/muse-glimmer-30b', max_tokens: 1024, temperature: 1, top_p: 0.95, stream: false, chat_template_kwargs: { reasoning_strength: 'low' }, messages: [{ role: 'system', content: 'synthetic system' }, { role: 'user', content: JSON.stringify({ referenceClock: REFERENCE_CLOCK, timeZone: 'Asia/Singapore', request: c.request }) }] };
      const init = { method: 'POST', redirect: 'error', body: JSON.stringify(body) };
      const factory = () => guardedNvidiaFetch({ directory, system: 'synthetic system', upstream: async () => { calls++; throw Error('synthetic transport failure'); } });
      for (const patch of [{ max_tokens: 8192 }, { model: 'other' }, { messages: [] }, { tools: [{}] }]) await assert.rejects(factory()('https://integrate.api.nvidia.com/v1/chat/completions', { ...init, body: JSON.stringify({ ...body, ...patch }) }));
      await assert.rejects(factory()('https://ai-gateway.vercel.sh/v1/chat/completions', init));
      await assert.rejects(factory()('https://integrate.api.nvidia.com/v1/chat/completions', init), /no_retry/);
      await assert.rejects(factory()('https://integrate.api.nvidia.com/v1/chat/completions', init), /EEXIST/);
    }
    assert.equal(calls, 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('continuation guard forbids explicit inference and permits only one durable clarification slot', async () => {
  const directory = await mkdtemp(join(tmpdir(), 's4-nvidia-one-'));
  let calls = 0;
  try {
    const c = NVIDIA_CASES.find(c => c.id === 'clarification');
    const body = { model: 'meta/muse-glimmer-30b', max_tokens: 1024, temperature: 1, top_p: 0.95, stream: false, chat_template_kwargs: { reasoning_strength: 'low' }, messages: [{ role: 'system', content: 'synthetic' }, { role: 'user', content: JSON.stringify({ referenceClock: REFERENCE_CLOCK, timeZone: 'Asia/Singapore', request: c.request }) }] };
    const init = { method: 'POST', redirect: 'error', body: JSON.stringify(body) };
    const factory = () => guardedNvidiaClarificationFetch({ directory, system: 'synthetic', upstream: async () => { calls++; return Response.json({}); } });
    await writeFile(join(directory, 'current-case.json'), JSON.stringify({ id: 'explicit' }));
    await assert.rejects(factory()('https://integrate.api.nvidia.com/v1/chat/completions', init), /Only one clarification/);
    assert.equal(calls, 0);
    await writeFile(join(directory, 'current-case.json'), JSON.stringify({ id: 'clarification' }));
    await factory()('https://integrate.api.nvidia.com/v1/chat/completions', init);
    await assert.rejects(factory()('https://integrate.api.nvidia.com/v1/chat/completions', init), /EEXIST/);
    assert.equal(calls, 1);
    assert.deepEqual(NVIDIA_CASES[0].expected.requirements, ['kopi']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
