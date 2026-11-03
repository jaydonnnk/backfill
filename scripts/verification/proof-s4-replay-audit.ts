import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Session } from '../../src/lib/buyer/service';
import { buyerRecording, replayBuyer } from '../../src/lib/buyer/recording';

// Read genuine receipts; write only a new, explicitly selected offline audit.
const root = resolve('docs/plans/backfill-proof/evidence/s4-buyer-models');
const output = resolve(process.env.S4_REPLAY_OUTPUT ?? '');
assert(output.startsWith(root + '/gateway-migration-') && output.endsWith('/s4b-replay-audit.json'), 'Use a fresh S4 migration output path');
const directory = join(root, 'live-authorized-2026-11-03-01');
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error('Network forbidden during offline replay'); };
try {
  const files = await readdir(directory);
  assert.equal(files.filter(n => /^(eligible-[1-4]|refusal-1)-dispatch\.json$/.test(n)).length, 5);
  assert.equal(files.filter(n => /^glimmer-.*-dispatch\.json$/.test(n)).length, 0);
  const cases = [];
  for (const name of ['eligible-1', 'eligible-2', 'eligible-3', 'eligible-4', 'refusal-1']) {
    const raw = JSON.parse(await readFile(join(directory, `${name === 'refusal-1' ? name + '-decision' : name + '-final'}.json`), 'utf8'));
    const session = Session.parse(name === 'refusal-1' ? raw : raw.session);
    assert.equal(session.decisionReceipt?.source, 'provider');
    assert.equal(session.decisionReceipt?.upstream, 'baseten');
    assert.equal(JSON.parse(await readFile(join(directory, `${name}-http.json`), 'utf8')).status, 200);
    const recording = buyerRecording(session), replay = replayBuyer(recording);
    assert.equal(recording.parsed, null); assert.equal(recording.parseReceipt, null);
    const result = await replay.decide(recording.partyId, recording.request, recording.constraints, recording.offer);
    assert.deepEqual(result.value, session.decision);
    assert.equal(result.receipt.source, 'recorded_replay');
    assert.equal(result.value.covers, name === 'refusal-1' ? 0 : 2);
    await assert.rejects(replay.parse(recording.request, recording.referenceClock), /missing_parser_recording/);
    await assert.rejects(replay.decide('wrong-party', recording.request, recording.constraints, recording.offer));
    await assert.rejects(replay.decide(recording.partyId, recording.request, recording.constraints, { ...recording.offer, visitDate: '2026-11-12' }));
    if (name === 'refusal-1') { assert.equal(session.approval, null); assert.equal(session.result, null); }
    else { assert(session.result?.ok); assert(session.approval); assert.deepEqual(session.approval.terms, session.terms); }
    cases.push({ case: name, replayed: true, parserEvidence: null, wrongPartyAndOccurrenceRejected: true });
  }
  await writeFile(output, JSON.stringify({ checkedAt: new Date().toISOString(), networkCalls: 0, originalEvidence: 'read-only; no relabeling or date changes', allowance: 'all five slots remain consumed', cases }, null, 2) + '\n', { flag: 'wx' });
  console.log('Five genuine S4b recordings passed offline replay; missing parser evidence remains null.');
} finally { globalThis.fetch = originalFetch; }
