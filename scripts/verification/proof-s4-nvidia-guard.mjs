import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const NVIDIA_CASES = [
  { id: 'explicit', request: 'Two people for kopi on 2026-11-05, from 14:00 to 17:00 Singapore time. Budget SGD6 per person.', expected: { partySize: 2, visitDate: '2026-11-05', earliest: '14:00', latest: '17:00', budgetPerCoverCents: 600, currency: 'SGD', requirements: ['kopi'] } },
  { id: 'clarification', request: 'Two people on 2026-11-05. Arrival time, departure time, budget and currency are undecided.', expected: { partySize: 2, visitDate: '2026-11-05', earliest: null, latest: null, budgetPerCoverCents: null, currency: null, requirements: [] } },
];
export const REFERENCE_CLOCK = '2026-11-03T12:00:00.000Z';
// Slots are reserved before dispatch, survive failures and are never released.
export function guardedNvidiaFetch({ directory, upstream, system }) {
  return async (input, init) => {
    assert.equal(String(input), 'https://integrate.api.nvidia.com/v1/chat/completions');
    assert.equal(init?.method, 'POST'); assert.equal(init.redirect, 'error');
    assert.equal(typeof init.body, 'string'); assert(Buffer.byteLength(init.body) < 16_384);
    const body = JSON.parse(init.body);
    const { id } = JSON.parse(await readFile(join(directory, 'current-case.json'), 'utf8'));
    const candidate = NVIDIA_CASES.find(c => c.id === id); assert(candidate);
    assert.deepEqual(body, { model: 'meta/muse-glimmer-30b', max_tokens: 1024, temperature: 1, top_p: 0.95, stream: false,
      chat_template_kwargs: { reasoning_strength: 'low' }, messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify({ referenceClock: REFERENCE_CLOCK, timeZone: 'Asia/Singapore', request: candidate.request }) },
      ] });
    const startedAt = new Date().toISOString();
    await writeFile(join(directory, `${id}-dispatch.json`), JSON.stringify({ id, startedAt, endpoint: String(input), model: body.model, maxOutputTokens: 1024, bodySha256: createHash('sha256').update(init.body).digest('hex'), consumed: true }) + '\n', { flag: 'wx' });
    try {
      const response = await upstream(input, init);
      await writeFile(join(directory, `${id}-http.json`), JSON.stringify({ status: response.status, requestId: response.headers.get('x-request-id'), costUsd: null, consumed: true }) + '\n', { flag: 'wx' });
      return response;
    } catch {
      await writeFile(join(directory, `${id}-failure.json`), JSON.stringify({ transportFailed: true, consumed: true }) + '\n', { flag: 'wx' });
      throw Error('nvidia_transport_failed_no_retry');
    }
  };
}
// The continuation permits only the previously unexecuted clarification case.
export function guardedNvidiaClarificationFetch(args) {
  const guarded = guardedNvidiaFetch(args);
  return async (input, init) => {
    const { id } = JSON.parse(await readFile(join(args.directory, 'current-case.json'), 'utf8'));
    assert.equal(id, 'clarification', 'Only one clarification request is authorized');
    return guarded(input, init);
  };
}
