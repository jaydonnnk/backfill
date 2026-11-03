import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import postgres from 'postgres';
import { z } from 'zod';
import { OwnerChange } from '../../src/domain/whatsapp/owner-change';
import { inspectWav } from '../../src/lib/owner-voice/wav';
import { createTestDatabase } from '../../tests/support/db';
import { proveLiveOwnerVoice } from './proof-s3-live-ui';

// Must run before any application/env-file startup. This process never loads real credentials.
const configured = new URL(process.env.TEST_DATABASE_URL ?? 'http://missing.invalid');
assert.match(configured.protocol, /^postgres(ql)?:$/);
assert.deepEqual([configured.hostname, configured.port, configured.pathname], ['127.0.0.1', '5432', '/postgres']);
assert.equal(process.env.S3_LIVE_APPROVED, '2026-11-03-4-calls-usd8.44');
const root = resolve('.');
const evidence = join(root, 'docs/plans/backfill-proof/evidence/s3-owner-voice');
const directory = join(evidence, 'live-authorized-2026-11-03-01');
const inputs = join(evidence, 'inputs');
await mkdir(directory, { recursive: true });
const ownerSchema = z.toJSONSchema(OwnerChange, { target: 'draft-2020-12' });
delete ownerSchema.$schema;
await writeFile(join(directory, 'owner-change-schema.json'), JSON.stringify(ownerSchema, null, 2) + '\n');
const pinned = { clear: '8c4759bcd5643bb15248c523ad707edef90a4916752009ef4d4d13afda96c90c', ambiguous: 'd327a817bc757a8308c5ec1e4e65fc79157d4b63e578e7e355b68931dfeedbf0' };
for (const [name, sha] of Object.entries(pinned)) {
  const bytes = await readFile(join(inputs, `${name}.wav`));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), sha);
  const wave = inspectWav(bytes); assert(wave.ok && wave.durationMs <= 15_000);
}
const frozen = JSON.parse(await readFile(join(evidence, 'source-manifest.json'), 'utf8'));
for (const file of frozen.files) assert.equal(createHash('sha256').update(await readFile(join(root, file.path))).digest('hex'), file.rootSha256, `Product changed: ${file.path}`);
if (!process.argv.includes('--execute')) {
  console.log('Preflight passed. No env-file startup, provider request or database access occurred.');
  process.exit(0);
}
await writeFile(join(directory, 'dispatch-session.json'), JSON.stringify({ authority: 'User Approved after the four-call US$8.44 local live test proposal', startedAt: new Date().toISOString(), models: ['muse-voice-transcribe-1.0', 'muse-wonder-1.0'], maximumCalls: 4, voiceMaximum: 2, wonderMaximum: 2, retries: 0, maximumUsd: 8.44, audioHashes: pinned, approval: 'scripted authenticated UI actions, not real-person consent', production: 'no access or writes' }, null, 2) + '\n', { flag: 'wx' });
const scratch = await mkdtemp(join(tmpdir(), 'backfill-s3-live-'));
const source = join(scratch, 'app');
await mkdir(source);
for (const path of ['src', 'public', 'package.json', 'package-lock.json', 'tsconfig.json', 'next.config.ts', 'postcss.config.mjs']) {
  await cp(join(root, path), join(source, path), { recursive: true, filter: item => !basename(item).startsWith('.env') && !['archive', '.git', '.next', 'node_modules', '.DS_Store'].includes(basename(item)) });
}
await symlink(join(root, 'node_modules'), join(source, 'node_modules'));
const portOwner = createServer(); portOwner.listen(0, '127.0.0.1'); await once(portOwner, 'listening');
const address = portOwner.address(); assert(address && typeof address !== 'string');
const port = address.port; await new Promise<void>((resolve, reject) => portOwner.close(error => error ? reject(error) : resolve()));
const appUrl = `http://127.0.0.1:${port}`;
const env: NodeJS.ProcessEnv = {
  PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
  NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', LOG_LEVEL: 'error',
  APP_BASE_URL: appUrl, DATABASE_URL: configured.toString(),
  META_BASE_URL: 'https://api.meta.ai/v1', META_MODEL_SPARK: 'muse-spark-1.3', META_MODEL_WONDER: 'muse-wonder-1.0',
  WHATSAPP_APP_SECRET: '', WHATSAPP_VERIFY_TOKEN: '', WHATSAPP_ACCESS_TOKEN: '', WHATSAPP_PHONE_NUMBER_ID: '',
  AI_GATEWAY_API_KEY: '', NEGOTIATION_SIGNING_SECRET: '',
};
let db: Awaited<ReturnType<typeof createTestDatabase>> | undefined;
let server: ReturnType<typeof spawn> | undefined;
let output = ''; let roleCreated = false; let passed = false; let stage = 'build';
const role = `backfill_t_s3_live_${randomBytes(4).toString('hex')}`;
try {
  console.log('Building an unchanged isolated production snapshot with dummy credentials.');
  const build = spawn(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'build', '--webpack'], { cwd: source, env: { ...env, META_API_KEY: 'offline-dummy', META_BASE_URL: 'https://model.invalid/v1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let buildLog = ''; build.stdout.on('data', chunk => { buildLog += String(chunk); }); build.stderr.on('data', chunk => { buildLog += String(chunk); });
  const [code] = await once(build, 'exit'); await writeFile(join(directory, 'production-build.txt'), buildLog); assert.equal(code, 0);
  stage = 'disposable-database'; db = await createTestDatabase('proof_s3_live');
  await db.admin.unsafe(`CREATE ROLE ${role} LOGIN IN ROLE backfill_app`); roleCreated = true;
  const runtimeUrl = new URL(db.url); runtimeUrl.username = role;
  stage = 'owned-server';
  // Normal Node env loading occurs only in this application process. Explicit local settings
  // override env-file DB/model/transport configuration. No credential is inspected or copied.
  server = spawn(process.execPath, [`--env-file=${join(root, '.env.local')}`, '--import', join(root, 'scripts/verification/proof-s3-live-guard.mjs'), join(root, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: source, env: { ...env, DATABASE_URL: runtimeUrl.toString(), S3_LIVE_RUN_DIR: directory, S3_LIVE_AUTHORITY: 'approved-4-calls-usd8.44' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout?.on('data', chunk => { output += String(chunk); }); server.stderr?.on('data', chunk => { output += String(chunk); });
  let ready = false;
  for (let n = 0; n < 100; n++) {
    assert.equal(server.exitCode, null, 'Owned server exited');
    try { ready = (await fetch(`${appUrl}/api/health`)).ok; } catch { /* Owned server not listening yet. */ }
    if (ready) break; await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(ready, 'Owned server readiness failed');
  console.log('Starting the approved genuine Voice/Wonder UI proof. At most four durable attempt slots.');
  stage = 'genuine-ui-proof'; await proveLiveOwnerVoice({ appUrl, adminUrl: db.url, directory, inputs });
  stage = 'source-and-call-audit';
  for (const file of frozen.files) {
    const hash = createHash('sha256').update(await readFile(join(root, file.path))).digest('hex');
    assert.equal(hash, file.rootSha256, `Root source changed: ${file.path}`);
    assert.equal(createHash('sha256').update(await readFile(join(source, file.path))).digest('hex'), hash, `Snapshot mismatch: ${file.path}`);
  }
  const dispatches = (await readdir(directory)).filter(name => /^(voice|wonder)-(clear|ambiguous)-dispatch\.json$/.test(name));
  assert.equal(dispatches.length, 4);
  passed = true;
} catch (error) {
  await writeFile(join(directory, 'run-failure.json'), JSON.stringify({ stage, errorName: error instanceof Error ? error.name : 'Error', assertion: error instanceof assert.AssertionError ? error.message : 'Inspect retained stage/state receipts; external error messages withheld', retry: 'none; do not re-execute this run' }, null, 2) + '\n');
  process.exitCode = 1;
} finally {
  if (server && server.exitCode === null) { const done = once(server, 'exit'); server.kill('SIGTERM'); await done; }
  await writeFile(join(directory, 'server.txt'), output);
  if (db) await db.drop();
  if (roleCreated) {
    const admin = postgres(configured.toString(), { max: 1, onnotice: () => {} });
    try { await admin.unsafe(`DROP ROLE IF EXISTS ${role}`); } finally { await admin.end({ timeout: 5 }); }
  }
  await rm(scratch, { recursive: true, force: true });
  const dispatchFiles = (await readdir(directory)).filter(name => name.endsWith('-dispatch.json'));
  const dispatches = await Promise.all(dispatchFiles.map(async path => JSON.parse(await readFile(join(directory, path), 'utf8'))));
  const reservedCeilingUsd = dispatches.reduce((sum, call) => sum + call.reservedCeilingUsd, 0);
  assert(dispatches.length <= 4 && reservedCeilingUsd <= 8.44);
  await writeFile(join(directory, 'run-result.json'), JSON.stringify({ passed, completedAt: new Date().toISOString(), stage, appUrl, attempts: dispatches.map(call => ({ id: call.id, model: call.model, reservedCeilingUsd: call.reservedCeilingUsd })), attemptCount: dispatches.length, reservedCeilingUsd, spendingCeilingUsd: 8.44, actualBilledCostUsd: null, billingNote: 'Unknown actual invoice cost. Token/duration receipts permit published-rate estimates only.', credentialHandling: 'Existing configuration loaded only by normal application startup; no env file or credential inspection/output/copy. Explicit local DATABASE_URL overrides file configuration.', cleanup: 'Owned server, disposable database/login and source snapshot removed', productionAccess: false }, null, 2) + '\n');
}
console.log(passed ? 'Genuine S3 integration proof passed; local resources removed.' : 'Genuine S3 integration not accepted. No retry; inspect frozen run receipts.');
