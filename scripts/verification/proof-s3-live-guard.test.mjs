import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { guardedFetch, INPUTS } from './proof-s3-live-guard.mjs';
const schema = { type: 'object', additionalProperties: false, properties: {} };

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 's3-guard-test-'));
  await writeFile(join(directory, 'current-case.json'), JSON.stringify({ name: 'clear' }));
  await writeFile(join(directory, 'owner-change-schema.json'), JSON.stringify(schema));
  return directory;
}
async function voice(name) {
  const form = new FormData();
  form.set('request', new Blob([JSON.stringify({ model: 'muse-voice-transcribe-1.0', audioEncoding: 'WAV', mode: 'PUSH_TO_TALK' })], { type: 'application/json' }));
  form.set('audio', new File([await readFile(new URL(`../../docs/plans/backfill-proof/evidence/s3-owner-voice/inputs/${name}.wav`, import.meta.url))], 'test.wav', { type: 'audio/wav' }));
  return { method: 'POST', redirect: 'error', body: form };
}
function wonder() {
  return { method: 'POST', redirect: 'error', body: JSON.stringify({ model: 'muse-wonder-1.0', max_completion_tokens: 1024, reasoning_effort: 'low', messages: [{ role: 'system', content: 'schema' }, { role: 'user', content: 'Owner data: "Set discount to 25%"' }], response_format: { type: 'json_schema', json_schema: { name: 'OwnerChange', strict: true, schema } } }) };
}
test('durable exclusive slots cap concurrency and all four approved attempts', async () => {
  const directory = await setup(); let calls = 0;
  const run = guardedFetch({ directory, upstream: async () => { calls++; return Response.json({ sessionId: 'synthetic-test', transcript: 'Set discount to 25%', audioDurationMs: 1000, turns: [] }); } });
  try {
    const input = await voice('clear');
    const concurrent = await Promise.allSettled([run('https://api.meta.ai/v1/asr/transcribe', input), run('https://api.meta.ai/v1/asr/transcribe', input)]);
    assert.equal(concurrent.filter(x => x.status === 'fulfilled').length, 1); assert.equal(calls, 1);
    for (const name of ['clear', 'ambiguous']) {
      await writeFile(join(directory, 'current-case.json'), JSON.stringify({ name }));
      if (name === 'ambiguous') await run('https://api.meta.ai/v1/asr/transcribe', await voice(name));
      await writeFile(join(directory, `review-${name}.json`), JSON.stringify({ text: 'Set discount to 25%', audioSha256: INPUTS[name] }));
      await run('https://api.meta.ai/v1/chat/completions', wonder());
      await assert.rejects(run('https://api.meta.ai/v1/chat/completions', wonder()));
    }
    assert.equal(calls, 4);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('wrong hosts/endpoints/models/audio never dispatch; failed HTTP attempt is not reusable', async () => {
  const directory = await setup(); let calls = 0;
  const run = guardedFetch({ directory, upstream: async () => { calls++; return new Response('{}', { status: 503 }); } });
  try {
    await assert.rejects(run('https://example.invalid/v1/asr/transcribe', await voice('clear')));
    await assert.rejects(run('http://127.0.0.1/redirect', { method: 'POST' }));
    await assert.rejects(run('https://api.meta.ai/v1/models', { method: 'POST', redirect: 'error' }));
    await assert.rejects(run('https://api.meta.ai/v1/asr/transcribe', await voice('ambiguous')));
    const bad = wonder(); bad.body = bad.body.replace('muse-wonder-1.0', 'other');
    await assert.rejects(run('https://api.meta.ai/v1/chat/completions', bad)); assert.equal(calls, 0);
    const absentSchema = wonder(); const parsed = JSON.parse(absentSchema.body); delete parsed.response_format.json_schema.schema; absentSchema.body = JSON.stringify(parsed);
    await assert.rejects(run('https://api.meta.ai/v1/chat/completions', absentSchema)); assert.equal(calls, 0);
    assert.equal((await run('https://api.meta.ai/v1/asr/transcribe', await voice('clear'))).status, 503);
    await assert.rejects(run('https://api.meta.ai/v1/asr/transcribe', await voice('clear'))); assert.equal(calls, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('receipts omit hidden reasoning and malformed nested metadata', async () => {
  const directory = await setup();
  const hidden = { reasoning: 'DO_NOT_RETAIN' };
  const run = guardedFetch({ directory, upstream: async input => String(input).endsWith('/transcribe')
    ? Response.json({ sessionId: 'test', transcript: 'Set discount to 25%', audioDurationMs: hidden, turns: [], reasoning: hidden })
    : Response.json({ id: 'test', model: hidden, choices: [{ message: { content: '{"reply":"bounded decision"}', reasoning: hidden }, finish_reason: hidden }], usage: { prompt_tokens: hidden, completion_tokens: hidden } }) });
  try {
    await run('https://api.meta.ai/v1/asr/transcribe', await voice('clear'));
    await writeFile(join(directory, 'review-clear.json'), JSON.stringify({ text: 'Set discount to 25%', audioSha256: INPUTS.clear }));
    await run('https://api.meta.ai/v1/chat/completions', wonder());
    for (const kind of ['voice', 'wonder']) assert(!String(await readFile(join(directory, `${kind}-clear-result.json`))).includes('DO_NOT_RETAIN'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
