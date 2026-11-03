import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const INPUTS = {
  clear: '8c4759bcd5643bb15248c523ad707edef90a4916752009ef4d4d13afda96c90c',
  ambiguous: 'd327a817bc757a8308c5ec1e4e65fc79157d4b63e578e7e355b68931dfeedbf0',
};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const boundedText = (value, limit = 200) => typeof value === 'string' ? value.slice(0, limit) : null;
const count = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

// Verification-only. Durable exclusive slots bound attempts across processes and restarts.
export function guardedFetch({ directory, upstream }) {
  return async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    assert.equal(url.origin, 'https://api.meta.ai', 'Unapproved provider host');
    assert.equal(url.search, '');
    assert.equal(init?.method, 'POST');
    assert.equal(init.redirect, 'error');
    const { name } = JSON.parse(await readFile(join(directory, 'current-case.json'), 'utf8'));
    assert(Object.hasOwn(INPUTS, name), 'Unapproved case');
    const kind = url.pathname === '/v1/asr/transcribe' ? 'voice' : url.pathname === '/v1/chat/completions' ? 'wonder' : null;
    assert(kind, 'Unapproved endpoint');
    let request;
    if (kind === 'voice') {
      assert(init.body instanceof FormData);
      const audio = init.body.get('audio'); const settings = init.body.get('request');
      assert(audio instanceof File && settings instanceof File);
      assert.equal(settings.type, 'application/json');
      assert.deepEqual(JSON.parse(await settings.text()), { model: 'muse-voice-transcribe-1.0', audioEncoding: 'WAV', mode: 'PUSH_TO_TALK' });
      const bytes = Buffer.from(await audio.arrayBuffer());
      assert.equal(sha(bytes), INPUTS[name], 'Unapproved audio bytes');
      request = { model: 'muse-voice-transcribe-1.0', audioSha256: sha(bytes), audioBytes: bytes.length, reservedCeilingUsd: 0.00075 };
    } else {
      assert.equal(typeof init.body, 'string');
      const body = JSON.parse(init.body);
      assert.deepEqual(Object.keys(body).sort(), ['max_completion_tokens', 'messages', 'model', 'reasoning_effort', 'response_format']);
      assert.equal(body.model, 'muse-wonder-1.0');
      assert.equal(body.max_completion_tokens, 1024);
      assert.equal(body.reasoning_effort, 'low');
      assert.equal(body.tools, undefined); assert.equal(body.stream, undefined);
      assert.equal(body.messages.length, 2);
      assert.equal(body.messages[0].role, 'system'); assert.equal(body.messages[1].role, 'user');
      assert.equal(body.response_format?.json_schema?.name, 'OwnerChange');
      assert.equal(body.response_format?.json_schema?.strict, true);
      assert.equal(body.response_format.type, 'json_schema');
      assert.deepEqual(Object.keys(body.response_format.json_schema).sort(), ['name', 'schema', 'strict']);
      assert.deepEqual(body.response_format.json_schema.schema, JSON.parse(await readFile(join(directory, 'owner-change-schema.json'), 'utf8')), 'Schema differs from verified OwnerChange');
      assert(Buffer.byteLength(init.body) < 16_384, 'Unbounded request');
      const reviewed = JSON.parse(await readFile(join(directory, `review-${name}.json`), 'utf8'));
      const voice = JSON.parse(await readFile(join(directory, `voice-${name}-result.json`), 'utf8'));
      assert.equal(voice.status, 200, 'No successful ASR result');
      assert.equal(reviewed.audioSha256, INPUTS[name]);
      assert(body.messages[1].content.includes(JSON.stringify(reviewed.text)), 'Request does not match saved transcript review');
      request = { model: body.model, maxCompletionTokens: 1024, reasoningEffort: 'low', bodySha256: sha(init.body), messages: body.messages, reservedCeilingUsd: 4.214784 };
    }
    const id = `${kind}-${name}`;
    // A failed HTTP request or lost response consumes this slot too. Never release it.
    await writeFile(join(directory, `${id}-dispatch.json`), JSON.stringify({ id, case: name, endpoint: url.href, startedAt: new Date().toISOString(), ...request }, null, 2) + '\n', { flag: 'wx' });
    const started = performance.now();
    try {
      const response = await upstream(input, { ...init, redirect: 'error' });
      const clone = response.clone();
      const reader = clone.body?.getReader();
      let raw = ''; let bytes = 0; const chunks = [];
      if (reader) {
        try { for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; assert(bytes <= 65_536, 'Unbounded provider response'); chunks.push(part.value); } }
        finally { await reader.cancel(); }
        raw = Buffer.concat(chunks).toString('utf8');
      }
      let body; try { body = JSON.parse(raw); } catch { body = null; }
      // Persist bounded actual output, never hidden reasoning or credentials/error bodies.
      const output = kind === 'voice' ? {
        sessionId: boundedText(body?.sessionId), transcript: boundedText(body?.transcript, 2000),
        audioDurationMs: count(body?.audioDurationMs), turnsCount: Array.isArray(body?.turns) ? body.turns.length : null,
      } : {
        id: boundedText(body?.id), model: boundedText(body?.model),
        content: boundedText(body?.choices?.[0]?.message?.content, 4000),
        finishReason: boundedText(body?.choices?.[0]?.finish_reason),
        usage: body?.usage ? { promptTokens: count(body.usage.prompt_tokens), completionTokens: count(body.usage.completion_tokens), cachedTokens: count(body.usage.prompt_tokens_details?.cached_tokens) } : null,
      };
      await writeFile(join(directory, `${id}-result.json`), JSON.stringify({ id, status: response.status, latencyMs: Math.round(performance.now() - started), providerRequestId: response.headers.get('x-request-id'), output }, null, 2) + '\n', { flag: 'wx' });
      return response;
    } catch (error) {
      await writeFile(join(directory, `${id}-failure.json`), JSON.stringify({ id, errorName: error instanceof Error ? error.name : 'Error', latencyMs: Math.round(performance.now() - started), cost: 'unknown; attempt slot consumed; no retry' }, null, 2) + '\n', { flag: 'wx' });
      throw new Error('Bounded provider attempt failed; no retry');
    }
  };
}

if (process.env.S3_LIVE_RUN_DIR) {
  assert.equal(process.env.S3_LIVE_AUTHORITY, 'approved-4-calls-usd8.44');
  assert.equal(new URL(process.env.DATABASE_URL ?? '').hostname, '127.0.0.1');
  globalThis.fetch = guardedFetch({ directory: process.env.S3_LIVE_RUN_DIR, upstream: globalThis.fetch });
}
