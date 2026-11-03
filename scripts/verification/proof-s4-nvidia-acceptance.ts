import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import postgres from 'postgres';
import { createTestDatabase } from '../../tests/support/db';
import { mintAgent } from '../../src/lib/agents/tokens';
import { buyerHandler } from '../../src/lib/buyer/http';
import { glimmerParser } from '../../src/lib/buyer/models';
import { Session } from '../../src/lib/buyer/service';
import { guardedNvidiaClarificationFetch, NVIDIA_CASES, REFERENCE_CLOCK } from './proof-s4-nvidia-guard.mjs';

const local = new URL(process.env.TEST_DATABASE_URL ?? 'http://missing.invalid');
assert.match(local.protocol, /^postgres(ql)?:$/);
assert.deepEqual([local.hostname, local.port, local.pathname], ['127.0.0.1', '5432', '/postgres']);
const directory = resolve('docs/plans/backfill-proof/evidence/s4-buyer-models/nvidia-acceptance-authorized-2026-11-03-02');
const priorPath = 'docs/plans/backfill-proof/evidence/s4-buyer-models/nvidia-live-authorized-2026-11-03-01/explicit-result.json';
const prior = Session.parse(JSON.parse(await readFile(priorPath, 'utf8')).session);
assert(prior.proposal && prior.parseReceipt);
assert.equal(prior.parseReceipt.source, 'provider');
assert.equal(prior.parseReceipt.servedModel, 'meta/muse-glimmer-30b');
assert.deepEqual(prior.proposal, NVIDIA_CASES[0]!.expected);
const hash = async (path: string) => createHash('sha256').update(await readFile(path)).digest('hex');
const hasNvidiaKey = () => Boolean(process.env.NVIDIA_API_KEY?.trim() && process.env.NVIDIA_API_KEY !== 'NVIDIA_API_KEY');
const files = ['src/lib/buyer/models.ts', 'src/lib/buyer/service.ts', 'src/lib/buyer/http.ts', 'scripts/verification/proof-s4-nvidia-acceptance.ts', 'scripts/verification/proof-s4-nvidia-guard.mjs', priorPath];
const manifest = await Promise.all(files.map(async path => ({ path, sha256: await hash(path) })));
// Prepare the exact parser envelope using a dummy key and no network or env loading.
process.env.NVIDIA_API_KEY = 'offline-dummy';
let system = '';
await assert.rejects(glimmerParser(async (_input, init) => {
  const envelope = JSON.parse(String(init?.body)); system = envelope.messages[0].content;
  throw Error('offline_envelope_capture');
})(NVIDIA_CASES[0]!.request, REFERENCE_CLOCK), /offline_envelope_capture/);
delete process.env.NVIDIA_API_KEY;
assert(system.length > 100);
if (!process.argv.includes('--execute')) {
  console.log('Offline preflight passed: one new NVIDIA clarification case plus exact-input explicit replay, 1024 tokens/45 seconds each, no retries or polling.');
} else {
  // Exclusive run marker closes the allowance even if interrupted before dispatch.
  await writeFile(join(directory, 'run-consumed.json'), JSON.stringify({ at: new Date().toISOString(), attemptsMaximum: 1, retries: 0, cases: NVIDIA_CASES, referenceClock: REFERENCE_CLOCK }) + '\n', { flag: 'wx' });
  await writeFile(join(directory, 'source-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  const originalFetch = globalThis.fetch;
  const transport = guardedNvidiaClarificationFetch({ directory, system, upstream: originalFetch });
  globalThis.fetch = transport;
  const databaseLabel = `proof_s4_nvidia_live_${randomUUID().slice(0, 8)}`;
  const databasePrefix = `backfill_t_${databaseLabel}_`;
  let db: Awaited<ReturnType<typeof createTestDatabase>> | undefined;
  let passed = false;
  try {
    // Explicit local configuration is fixed before normal runtime env loading.
    process.env.DATABASE_URL = local.toString();
    process.loadEnvFile('.env.local');
    process.env.TEST_DATABASE_URL = local.toString(); process.env.DATABASE_URL = local.toString();
    assert(hasNvidiaKey(), 'nvidia_key_required');
    db = await createTestDatabase(databaseLabel);
    const ping = await db.admin`select 1 as ok`; assert.equal(ping[0]!.ok, 1);
    const liveParser = glimmerParser(transport);
    const parse: typeof liveParser = async (request, referenceClock) => {
      if (request === prior.request) {
        assert.equal(referenceClock, prior.referenceClock);
        assert(prior.proposal && prior.parseReceipt);
        return { value: prior.proposal, receipt: { ...prior.parseReceipt, source: 'recorded_replay' } };
      }
      assert.equal(request, NVIDIA_CASES[1]!.request);
      return liveParser(request, referenceClock);
    };
    const handler = buyerHandler(() => db!.db, () => ({ parse, decide: async () => { throw Error('Spark calls forbidden'); } }), () => new Date(REFERENCE_CLOCK));
    const other = await mintAgent(db.db, randomUUID(), 'Synthetic other NVIDIA party');
    const results = [];
    for (const c of NVIDIA_CASES) {
      await writeFile(join(directory, 'current-case.json'), JSON.stringify({ id: c.id }) + '\n');
      const party = await mintAgent(db.db, randomUUID(), `Synthetic NVIDIA ${c.id}`);
      const id = randomUUID();
      const act = async (action: Record<string, unknown>, token = party.token) => {
        const response = await handler(new Request('http://127.0.0.1/api/buyer', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...action }) }));
        return response.json();
      };
      assert.equal((await act({ action: 'start', request: c.request })).status, 'ok');
      const result = await act({ action: 'parse', revision: 0 });
      await writeFile(join(directory, `${c.id}-result.json`), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
      assert.equal(result.status, 'ok', 'Parser failed; allowance closed without retry');
      const session = Session.parse(result.session);
      assert.deepEqual(session.proposal, c.expected);
      assert.equal(session.phase, c.id === 'explicit' ? 'parsed' : 'clarification');
      assert.equal(session.parseReceipt?.source, c.id === 'explicit' ? 'recorded_replay' : 'provider'); assert.equal(session.parseReceipt?.route, 'nvidia_nim');
      assert.equal(session.approval, null); assert.equal(session.decision, null); assert.equal(session.result, null);
      assert.equal((await act({ action: 'parse', revision: 0 })).status, 'already_attempted');
      assert.equal((await act({ action: 'get' }, other.token)).session, null);
      const corrected = { ...NVIDIA_CASES[0]!.expected, budgetPerCoverCents: 500 };
      const reviewed = await act({ action: 'review', revision: 0, constraints: corrected });
      assert.equal(reviewed.session.phase, 'reviewed'); assert.equal(reviewed.session.approval, null);
      const edited = await act({ action: 'edit', revision: 1, request: 'Corrected synthetic request. No booking approval.' });
      assert.equal(edited.session.revision, 2); assert.equal(edited.session.proposal, null); assert.equal(edited.session.parseReceipt, null);
      assert.equal((await act({ action: 'submit', revision: 1 })).status, 'revision_changed');
      assert.equal((await act({ action: 'submit', revision: 2 })).status, 'no_decision');
      assert.equal((await act({ action: 'discard', revision: 2 })).session.phase, 'discarded');
      results.push({ id: c.id, session, correctionReviewDiscardPassed: true, duplicateCallBlocked: true, crossPartyBlocked: true });
    }
    assert.equal((await db.admin`select count(*)::int as count from commitments`)[0]!.count, 0);
    for (const e of manifest) assert.equal(await hash(e.path), e.sha256, 'Source changed during live verification');
    await writeFile(join(directory, 'acceptance.json'), JSON.stringify({ s4aPassed: true, explicitSource: 'prior genuine output, exact-input recorded replay', clarificationSource: 'new genuine NVIDIA output', maximumNewRequests: 1, parserOutputPassed: true, sourceStable: true, actualServiceAndDatabase: true, actualBrowser: false, newSparkCalls: 0, commitments: 0, actualInvoicedCostUsd: null, hiddenReasoningRetained: false, results }, null, 2) + '\n', { flag: 'wx' });
    passed = true;
    console.log('S4a acceptance passed: saved explicit output replay and one new genuine clarification; local correction, ownership and duplicate guards passed.');
  } catch (error) {
    await writeFile(join(directory, 'failure.json'), JSON.stringify({ errorName: error instanceof Error ? error.name : 'Error', assertion: error instanceof assert.AssertionError ? error.message : 'Inspect bounded result receipts; raw provider errors are not retained', noRetry: true, allowanceClosed: true }) + '\n', { flag: 'wx' });
    process.exitCode = 1;
    console.log('NVIDIA verification stopped. Inspect bounded receipts; no retry or fallback.');
  } finally {
    globalThis.fetch = originalFetch;
    if (db) await db.drop();
    const admin = postgres(local.toString(), { max: 1, onnotice: () => {} });
    try {
      // Setup can fail after CREATE DATABASE but before returning its handle.
      const abandoned = await admin`select datname from pg_database where left(datname, ${databasePrefix.length})=${databasePrefix}`;
      for (const row of abandoned) {
        assert.match(row.datname, /^backfill_t_proof_s4_nvidia_live_[a-f0-9]{8}_[a-f0-9]{8}$/);
        await admin.unsafe(`DROP DATABASE "${row.datname}" WITH (FORCE)`);
      }
      const remaining = await admin`select datname from pg_database where left(datname, ${databasePrefix.length})=${databasePrefix}`;
      assert.equal(remaining.length, 0);
      await writeFile(join(directory, 'cleanup.json'), JSON.stringify({ passed, setupOrphansRemoved: abandoned.length, ownedDatabasesRemaining: remaining.length, newRoles: 0, serversStarted: 0, modelDownloads: 0 }) + '\n', { flag: 'wx' });
    } finally { await admin.end({ timeout: 5 }); }
  }
}
