import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import postgres from 'postgres';
import { createTestDatabase } from '../../tests/support/db';

// Explicit loopback configuration is checked before any env-file loader or DB call.
const configured = new URL(process.env.TEST_DATABASE_URL ?? 'http://missing.invalid');
assert.match(configured.protocol, /^postgres(ql)?:$/);
assert.deepEqual([configured.hostname, configured.port, configured.pathname], ['127.0.0.1', '5432', '/postgres']);
const root = resolve('.');
const ownedEvidenceRoot = resolve('docs/plans/backfill-proof/evidence/s4-buyer-models');
const evidence = resolve(process.env.S4_OUTPUT_DIR ?? ownedEvidenceRoot);
assert(evidence === ownedEvidenceRoot || evidence.startsWith(ownedEvidenceRoot + '/'), 'S4 output must remain under its owned evidence root');
assert(!evidence.includes('/live-authorized-'), 'Offline verification cannot write a genuine-run directory');
if (evidence === ownedEvidenceRoot && (await readdir(ownedEvidenceRoot)).some(name => name.startsWith('live-authorized-'))) throw new Error('Genuine receipts exist. Set S4_OUTPUT_DIR to a fresh owned subdirectory; default output is now protected.');
const combined = join(evidence, 'combined-regressions');
const attemptId = new Date().toISOString().replace(/[:.]/g, '-');
const attempt = join(evidence, 'attempts', attemptId);
await mkdir(attempt, { recursive: true });
await mkdir(join(combined, 's1'), { recursive: true });
await mkdir(join(combined, 's2'), { recursive: true });
await mkdir(join(combined, 's3'), { recursive: true });
// Each attempt begins without stale generated results that could be mistaken for its own.
for (const path of await filesBelow(evidence)) {
  if (path.startsWith(join(evidence, 'attempts'))) continue;
  if (path.endsWith('.png') || (path.endsWith('.json') && (basename(path).startsWith('browser') || basename(path) === 'source-manifest.json'))) {
    const target = join(root, 'archive/proof-s4-browser', `previous-results-${attemptId}`, path.slice(evidence.length + 1));
    await mkdir(join(target, '..'), { recursive: true }); await rename(path, target);
  }
}
const scratch = await mkdtemp(join(tmpdir(), 'backfill-proof-s4-'));
const source = join(scratch, 'app');
await mkdir(source);
// Allowlist rather than copying a repository that may contain archives or credentials.
for (const path of ['src', 'public', 'package.json', 'package-lock.json', 'tsconfig.json', 'next.config.ts', 'postcss.config.mjs']) {
  await cp(join(root, path), join(source, path), {
    recursive: true,
    filter: item => !basename(item).startsWith('.env') && !['archive', '.git', '.next', 'node_modules', '.DS_Store'].includes(basename(item)),
  });
}
await mkdir(join(source, 'tests/support'), { recursive: true });
for (const file of ['proof-s3.ts', 'proof-s4.ts']) await cp(join(root, 'tests/support', file), join(source, 'tests/support', file));
await mkdir(join(source, 'sim/buyers'), { recursive: true });
for (const file of ['buyer.ts', 'intents.ts']) await cp(join(root, 'sim/buyers', file), join(source, 'sim/buyers', file));
async function filesBelow(folder: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}
const hash = async (path: string) => createHash('sha256').update(await readFile(path)).digest('hex');
const sourceFiles = (await Promise.all(['src', 'public', 'sim'].map(path => filesBelow(join(source, path))))).flat().sort();
const manifest = await Promise.all(sourceFiles.map(async path => {
  const relative = path.slice(source.length + 1);
  return { path: relative, rootSha256: await hash(join(root, relative)), snapshotSha256: await hash(path) };
}));
for (const entry of manifest) assert.equal(entry.snapshotSha256, entry.rootSha256, `Source copy differs from root: ${entry.path}`);
const verificationInputs = await Promise.all([
  'drizzle/0016_proof_s4_buyer_sessions.sql', 'drizzle/meta/_journal.json',
  'tests/support/proof-s1.ts', 'tests/support/proof-s2.ts', 'tests/support/proof-s3.ts', 'tests/support/proof-s4.ts', 'sim/buyers/buyer.ts', 'sim/buyers/intents.ts', 'tests/e2e/proof-s1.spec.ts', 'tests/e2e/proof-s2.spec.ts', 'tests/e2e/proof-s3.spec.ts', 'tests/e2e/proof-s4.spec.ts', 'scripts/verification/proof-s4-browser.ts', 'config/playwright.proof-s4.config.ts',
].map(async path => ({ path, sha256: await hash(join(root, path)) })));
const realDeps = await readFile(join(source, 'src/lib/owner-voice/deps.ts'));
let fixtureModuleSha256: string | null = null;
let buyerFixtureSha256: string | null = null;
await symlink(join(root, 'node_modules'), join(source, 'node_modules'));
const listener = createServer();
listener.listen(0, '127.0.0.1');
await once(listener, 'listening');
const address = listener.address();
assert(address && typeof address !== 'string');
const port = address.port;
await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
const appUrl = `http://127.0.0.1:${port}`;
const env: NodeJS.ProcessEnv = {
  PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
  NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', LOG_LEVEL: 'error',
  META_API_KEY: 'offline-dummy', META_BASE_URL: 'https://model.invalid/v1',
  META_MODEL_SPARK: 'fixture:s1-menu', META_MODEL_WONDER: 'fixture:s3-wonder',
  APP_BASE_URL: appUrl, DATABASE_URL: 'postgres://postgres@127.0.0.1:5432/postgres',
};
async function run(args: string[], cwd: string, childEnv: NodeJS.ProcessEnv, logName: string) {
  const child = spawn(process.execPath, args, { cwd, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += String(chunk); });
  child.stderr.on('data', chunk => { output += String(chunk); });
  const [code] = await once(child, 'exit');
  await writeFile(join(attempt, logName), output);
  assert.equal(code, 0, `${logName} failed; inspect the retained log`);
}
let db: Awaited<ReturnType<typeof createTestDatabase>> | undefined;
let server: ReturnType<typeof spawn> | undefined;
const role = `backfill_t_s4_browser_${randomBytes(4).toString('hex')}`;
let roleCreated = false;
let serverOutput = '';
let stage = 'real-production-build';
const startedAt = new Date().toISOString();
try {
  console.log('Building the real allowlisted S4 application with dummy model.invalid configuration.');
  await run([join(root, 'node_modules/next/dist/bin/next'), 'build', '--webpack'], source, env, 'production-build.txt');
  await writeFile(join(source, 'src/lib/buyer/deps.ts'), "export { buyerDeps } from '../../../tests/support/proof-s4';\n");
  await writeFile(join(source, 'src/lib/owner-voice/deps.ts'), "export { voiceFixtureDeps as voiceDeps } from '../../../tests/support/proof-s3';\n");
  fixtureModuleSha256 = await hash(join(source, 'src/lib/owner-voice/deps.ts'));
  buyerFixtureSha256 = await hash(join(source, 'src/lib/buyer/deps.ts'));
  await rm(join(source, '.next'), { recursive: true, force: true });
  console.log('Building the same snapshot with only the Voice/Wonder and buyer model boundaries replaced by fixtures.');
  stage = 'fixture-production-build';
  await run([join(root, 'node_modules/next/dist/bin/next'), 'build', '--webpack'], source, env, 'fixture-production-build.txt');
  // Retain this prefix for unchanged inherited S1/S2 browser safety guards.
  stage = 'disposable-database-and-server';
  db = await createTestDatabase('proof_s1_browser');
  await db.admin.unsafe(`CREATE ROLE ${role} LOGIN IN ROLE backfill_app`);
  roleCreated = true;
  const runtimeUrl = new URL(db.url); runtimeUrl.username = role;
  server = spawn(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: source, env: { ...env, DATABASE_URL: runtimeUrl.toString() }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout?.on('data', chunk => { serverOutput += String(chunk); });
  server.stderr?.on('data', chunk => { serverOutput += String(chunk); });
  let ready = false;
  for (let n = 0; n < 100; n++) {
    if (server.exitCode !== null) throw new Error('Owned server exited during startup');
    try { ready = (await fetch(`${appUrl}/api/health`)).ok; } catch { /* Owned server not listening yet. */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(ready, 'Owned server readiness timed out');
  console.log('Running S4 twice from fresh owner/offer state, plus S1/S2/S3 and Kopi regressions.');
  stage = 'chromium';
  const grep = process.env.S4_TEST_GREP;
  const testArgs = [join(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config', 'config/playwright.proof-s4.config.ts', ...(grep ? ['--grep', grep] : [])];
  await run(testArgs, root, {
    ...env, S1_APP_URL: appUrl, S1_DATABASE_URL: runtimeUrl.toString(), S1_ADMIN_URL: db.url,
    S1_EVIDENCE_DIR: join(combined, 's1'), S2_EVIDENCE_DIR: join(combined, 's2'), S3_EVIDENCE_DIR: join(combined, 's3'), S4_EVIDENCE_DIR: evidence,
    TEST_DATABASE_URL: configured.toString(),
  }, 'browser-test.txt');
  stage = 'source-stability-check';
  for (const entry of manifest) assert.equal(await hash(join(root, entry.path)), entry.rootSha256, `Source changed during verification: ${entry.path}`);
  for (const entry of verificationInputs) assert.equal(await hash(join(root, entry.path)), entry.sha256, `Verification input changed during run: ${entry.path}`);
  for (const entry of manifest) {
    const expected: string | null = entry.path === 'src/lib/owner-voice/deps.ts' ? fixtureModuleSha256 : entry.path === 'src/lib/buyer/deps.ts' ? buyerFixtureSha256 : entry.rootSha256;
    assert.equal(await hash(join(source, entry.path)), expected, `Final snapshot source mismatch: ${entry.path}`);
  }
  await writeFile(join(evidence, 'source-manifest.json'), JSON.stringify({
    fixtureReplacements: [{ path: 'src/lib/owner-voice/deps.ts', sha256: fixtureModuleSha256 }, { path: 'src/lib/buyer/deps.ts', sha256: buyerFixtureSha256 }],
    allOtherSnapshotSourceMatchesRoot: true, rootSourceStableThroughRun: true, files: await Promise.all(manifest.map(async e => ({ ...e, initialCopySha256: e.snapshotSha256, snapshotSha256: await hash(join(source, e.path)) }))), verificationInputs,
  }, null, 2) + '\n');
  await writeFile(join(evidence, 'browser-isolation.json'), JSON.stringify({
    startedAt, completedAt: new Date().toISOString(), appUrl, attemptId, testScope: grep ?? 'all combined regressions',
    sourceAllowlist: ['src', 'public', 'package.json', 'package-lock.json', 'tsconfig.json', 'next.config.ts', 'postcss.config.mjs', 'tests/support/proof-s3.ts', 'tests/support/proof-s4.ts', 'sim/buyers/buyer.ts', 'sim/buyers/intents.ts'],
    fixtureInjection: 'Only src/lib/owner-voice/deps.ts and src/lib/buyer/deps.ts replaced in disposable snapshot; actual actions/service/database run unchanged',
    realOwnerDepsSha256: createHash('sha256').update(realDeps).digest('hex'),
    realBuyerDepsSha256: await hash(join(root, 'src/lib/buyer/deps.ts')),
    modelConfiguration: 'offline-dummy at model.invalid; Voice/Wonder/Glimmer/Spark Open fixtures only',
    audio: 'generated 1 second silence WAV, not speech; fixture transcript is authored independently',
    runtimeRole: 'disposable member of backfill_app', retries: 0, genuineModelCalls: 0,
  }, null, 2) + '\n');
} catch (error) {
  await writeFile(join(attempt, 'launcher-failure.json'), JSON.stringify({
    stage, errorName: error instanceof Error ? error.name : 'Error',
    assertion: error instanceof assert.AssertionError ? error.message : 'Check retained stage log; no external error body is retained',
  }, null, 2) + '\n');
  // Preserve compact failure receipts; move redundant captures to the ignored local archive.
  const archived = join(root, 'archive/proof-s4-browser', attemptId);
  for (const path of await filesBelow(evidence)) {
    if (path.startsWith(join(evidence, 'attempts'))) continue;
    const relative = path.slice(evidence.length + 1);
    if (path.endsWith('.png')) {
      const target = join(archived, relative); await mkdir(join(target, '..'), { recursive: true }); await rename(path, target);
    } else if (path.endsWith('.json') && basename(path).startsWith('browser')) {
      const target = join(attempt, relative); await mkdir(join(target, '..'), { recursive: true }); await cp(path, target);
    }
  }
  throw error;
} finally {
  if (server && server.exitCode === null) {
    const exited = once(server, 'exit'); server.kill('SIGTERM'); await exited;
  }
  await writeFile(join(attempt, 'browser-server.txt'), serverOutput);
  if (db) await db.drop();
  if (roleCreated) {
    const admin = postgres(configured.toString(), { max: 1, onnotice: () => {} });
    try { await admin.unsafe(`DROP ROLE IF EXISTS ${role}`); } finally { await admin.end({ timeout: 5 }); }
  }
  await rm(scratch, { recursive: true, force: true });
  const audit = postgres(configured.toString(), { max: 1, onnotice: () => {} });
  try {
    const roles = await audit`select rolname from pg_roles where rolname=${role}`;
    const databases = db ? await audit`select datname from pg_database where datname=${new URL(db.url).pathname.slice(1)}` : [];
    assert.equal(roles.length, 0); assert.equal(databases.length, 0);
    await writeFile(join(evidence, 'browser-cleanup.json'), JSON.stringify({ attemptId, serverStopped: !server || server.exitCode !== null, ownedRoleRemaining: roles.length, ownedDatabaseRemaining: databases.length, scratchRemoved: true }, null, 2) + '\n');
  } finally { await audit.end({ timeout: 5 }); }
}
console.log(`${process.env.S4_TEST_GREP ? 'Filtered S4 browser check' : 'S4 and combined regressions'} passed. Owned server, database, role and source snapshot removed.`);
