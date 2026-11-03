import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Session } from '../../src/lib/buyer/service';
import { buyerRecording, replayBuyer } from '../../src/lib/buyer/recording';
const directory = resolve('docs/plans/backfill-proof/evidence/s4-buyer-models/live-authorized-2026-11-03-01');
const files = await readdir(directory);
const gateway = files.filter(n => /^(eligible-[1-4]|refusal-1)-dispatch\.json$/.test(n));
const local = files.filter(n => /^glimmer-.*-dispatch\.json$/.test(n));
assert.equal(gateway.length, 5); assert.equal(local.length, 0);
let inputTokens = 0, outputTokens = 0;
const replays = [];
for (const name of ['eligible-1', 'eligible-2', 'eligible-3', 'eligible-4', 'refusal-1']) {
  const decision = Session.parse(JSON.parse(await readFile(join(directory, `${name}-decision.json`), 'utf8')));
  const final = name === 'refusal-1' ? decision : Session.parse(JSON.parse(await readFile(join(directory, `${name}-final.json`), 'utf8')).session);
  assert.equal(final.decisionReceipt?.source, 'provider'); assert.equal(final.decisionReceipt?.upstream, 'baseten');
  assert.equal(JSON.parse(await readFile(join(directory, `${name}-http.json`), 'utf8')).status, 200);
  const recording = buyerRecording(final), replay = replayBuyer(recording);
  const result = await replay.decide(recording.partyId, recording.request, recording.constraints, recording.offer);
  assert.deepEqual(result.value, final.decision); assert.equal(result.receipt.source, 'recorded_replay');
  await assert.rejects(replay.parse(recording.request, recording.referenceClock), /missing_parser_recording/);
  await assert.rejects(replay.decide('wrong-party', recording.request, recording.constraints, recording.offer));
  await assert.rejects(replay.decide(recording.partyId, recording.request, recording.constraints, { ...recording.offer, visitDate: '2026-11-12' }));
  assert.equal(final.decision?.covers, name === 'refusal-1' ? 0 : 2);
  if (name === 'refusal-1') { assert.equal(final.approval, null); assert.equal(final.result, null); }
  else { assert(final.result?.ok); assert(final.approval); assert.deepEqual(final.approval.terms, final.terms); }
  const prompt = JSON.parse(await readFile(join(directory, `${name}-approved-request.json`), 'utf8'));
  assert(!/floorPrice|floor_price|owner_voice|tokenSha|bfa_/.test(JSON.stringify(prompt)));
  assert(final.decisionReceipt?.inputTokens !== null && final.decisionReceipt?.outputTokens !== null);
  inputTokens += final.decisionReceipt!.inputTokens!; outputTokens += final.decisionReceipt!.outputTokens!;
  replays.push({ case: name, recording, source: result.receipt.source, parserEvidence: 'missing; not fabricated', wrongPartyAndOccurrenceRejected: true });
}
const audit = JSON.parse(await readFile(join(directory, 'ui-and-database-audit.json'), 'utf8'));
assert.equal(audit.s4bPassed, true); assert.equal(audit.s4aPassed, false);
assert.equal(audit.pending.scene.pooled.filledCovers, 0); assert.equal(audit.settled.scene.pooled.filledCovers, 8);
const manifest = JSON.parse(await readFile(join(directory, 'live-source-manifest.json'), 'utf8'));
for (const f of manifest.files) assert.equal(createHash('sha256').update(await readFile(f.path)).digest('hex'), f.rootSha256);
await writeFile(join(directory, 'replay-audit.json'), JSON.stringify({ networkCalls: 0, cases: replays }, null, 2) + '\n');
await writeFile(join(directory, 'acceptance-and-cost.json'), JSON.stringify({ genuineGatewayAttempts: 5, genuineLocalParserAttempts: 0, gatewayHttp200: 5, s4aPassed: false, s4bPassed: true, fullS4Passed: false, inputTokens, outputTokens, uncachedPublishedRateEstimateUsd: inputTokens * .00000125 + outputTokens * .00000425, cacheTokenBreakdown: 'not retained by this adapter; estimate charges all input at uncached rate', actualInvoicedCostUsd: null, approvedCeilingUsd: 6.57, allowance: 'five Gateway slots consumed; no retries or additional calls authorized', glimmer: 'one load attempt stopped by memory-pressure watchdog before inference; no restart', genuineReplayCases: replays.length, productSourceHashesVerified: manifest.files.length, privacyChecksPassed: true }, null, 2) + '\n');
console.log('Actual Gateway decisions, five offline replays, privacy, exact approvals and stored settlement verified. S4a remains blocked.');
