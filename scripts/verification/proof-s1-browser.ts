import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import postgres from 'postgres';
import { createTestDatabase } from '../../tests/support/db';

// No dotenv loader. Refuse absent/remote configuration before any database access.
const testUrl = new URL(process.env.TEST_DATABASE_URL ?? 'http://missing.invalid');
assert.match(testUrl.protocol, /^postgres(ql)?:$/);
assert.equal(testUrl.hostname, '127.0.0.1');
assert.equal(testUrl.port, '5432');
assert.equal(testUrl.pathname, '/postgres');
const root = resolve('.');
const evidence = resolve('docs/plans/backfill-proof/evidence/s1-journey');
await mkdir(evidence, { recursive: true });
const scratch = await mkdtemp(join(tmpdir(), 'backfill-proof-s1-'));
const source = join(scratch, 'app');
const excluded = new Set(['.git', '.next', 'node_modules', 'docs', '.agents', '.codex', '.aws', 'test-results', 'playwright-report', '.maintenance-build']);
await cp(root, source, { recursive: true, filter: path => !excluded.has(basename(path)) && !basename(path).startsWith('.env') });
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
  NODE_ENV: 'production',
  NEXT_TELEMETRY_DISABLED: '1', LOG_LEVEL: 'error',
  META_API_KEY: 'offline-dummy', META_BASE_URL: 'https://model.invalid/v1',
  META_MODEL_SPARK: 'fixture:s1-menu', META_MODEL_WONDER: 'fixture:s1-wonder',
  APP_BASE_URL: appUrl, DATABASE_URL: 'postgres://postgres@127.0.0.1:5432/postgres',
};

async function run(args: string[], cwd: string, childEnv: NodeJS.ProcessEnv, logName: string) {
  const child = spawn(process.execPath, args, { cwd, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += String(chunk); });
  child.stderr.on('data', chunk => { output += String(chunk); });
  const [code] = await once(child, 'exit');
  await writeFile(join(evidence, logName), output);
  assert.equal(code, 0, `${logName} failed; inspect the retained log`);
}

console.log('Building an isolated production snapshot without environment files.');
await run([join(root, 'node_modules/next/dist/bin/next'), 'build', '--webpack'], source, env, 'production-build.txt');
const t = await createTestDatabase('proof_s1_browser');
const role = `backfill_t_s1_browser_${randomBytes(4).toString('hex')}`;
let server: ReturnType<typeof spawn> | undefined;
let serverOutput = '';
try {
  await t.admin.unsafe(`CREATE ROLE ${role} LOGIN IN ROLE backfill_app`);
  const runtimeUrl = new URL(t.url);
  runtimeUrl.username = role;
  server = spawn(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: source, env: { ...env, DATABASE_URL: runtimeUrl.toString() }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout?.on('data', chunk => { serverOutput += String(chunk); });
  server.stderr?.on('data', chunk => { serverOutput += String(chunk); });
  let ready = false;
  for (let n = 0; n < 100; n++) {
    if (server.exitCode !== null) throw new Error('Owned server exited during startup');
    try { ready = (await fetch(`${appUrl}/api/health`)).ok; } catch { /* Not listening yet. */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(ready, 'Owned server readiness timed out');
  console.log('Running Chromium against the owned disposable server.');
  await run([join(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config', 'config/playwright.proof-s1.config.ts'], root, {
    ...env, S1_APP_URL: appUrl, S1_DATABASE_URL: runtimeUrl.toString(), S1_ADMIN_URL: t.url,
    S1_EVIDENCE_DIR: evidence, TEST_DATABASE_URL: testUrl.toString(),
  }, 'browser-test.txt');
} finally {
  if (server && server.exitCode === null) {
    const exited = once(server, 'exit');
    server.kill('SIGTERM');
    await exited;
  }
  await writeFile(join(evidence, 'browser-server.txt'), serverOutput);
  await t.drop();
  const admin = postgres(testUrl.toString(), { max: 1, onnotice: () => {} });
  try { await admin.unsafe(`DROP ROLE IF EXISTS ${role}`); } finally { await admin.end({ timeout: 5 }); }
}
console.log('S1 browser proof passed; disposable database, role and server removed.');
