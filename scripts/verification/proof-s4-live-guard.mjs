import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
export const GATEWAY_CASES = ['eligible-1', 'eligible-2', 'eligible-3', 'eligible-4', 'refusal-1'];
export const CEILING_USD = 6.57;
// Verification only. Install this fetch wrapper only in a separately authorized runner.
// Failed and interrupted attempts consume durable slots; there is no release or retry.
export function guardedGatewayFetch({ directory, upstream }) {
  return async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    assert.equal(url.href, 'https://ai-gateway.vercel.sh/v4/ai/language-model');
    assert.equal(init?.method, 'POST'); assert.equal(init.redirect, 'error');
    const headers = new Headers(init.headers);
    assert.equal(headers.get('ai-language-model-id'), 'meta/muse-spark-open');
    assert.equal(headers.get('ai-language-model-streaming'), 'false');
    assert.equal(typeof init.body, 'string');
    assert(Buffer.byteLength(init.body) <= 16_384);
    const body = JSON.parse(init.body);
    assert.equal(body.reasoning, 'low'); assert.equal(body.maxOutputTokens, 512);
    assert(!body.tools?.length); assert.equal(body.responseFormat, undefined);
    assert.deepEqual(body.providerOptions?.gateway, { only: ['baseten'] });
    const { name } = JSON.parse(await readFile(join(directory, 'current-case.json'), 'utf8'));
    assert(GATEWAY_CASES.includes(name));
    const approved = JSON.parse(await readFile(join(directory, `${name}-approved-request.json`), 'utf8'));
    assert.deepEqual(body.prompt, approved.prompt, 'Request differs from reviewed case');
    assert.deepEqual(Object.keys(body).filter(k => !['headers', 'toolChoice'].includes(k)).sort(), ['maxOutputTokens', 'prompt', 'providerOptions', 'reasoning']);
    const receipt = { case: name, endpoint: url.href, model: 'meta/muse-spark-open', maxOutputTokens: 512, reasoning: 'low', onlyUpstream: 'baseten', startedAt: new Date().toISOString(), bodySha256: createHash('sha256').update(init.body).digest('hex'), ceilingUsd: 1.312896 };
    await writeFile(join(directory, `${name}-dispatch.json`), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
    try {
      const response = await upstream(input, { ...init, redirect: 'error' });
      await writeFile(join(directory, `${name}-http.json`), JSON.stringify({ status: response.status, requestId: response.headers.get('x-request-id'), costUsd: null, attemptConsumed: true }) + '\n', { flag: 'wx' });
      return response;
    } catch {
      await writeFile(join(directory, `${name}-failure.json`), JSON.stringify({ status: 'transport_failed', costUsd: null, attemptConsumed: true }) + '\n', { flag: 'wx' });
      throw Error('Bounded Gateway attempt failed; no retry');
    }
  };
}
