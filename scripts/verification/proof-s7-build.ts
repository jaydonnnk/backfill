import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { constants } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { createTestDatabase } from '../../tests/support/db';

const root = resolve('.');
const output = resolve(process.argv[2] ?? '');
const debug = process.argv[3] === '--debug-prerender';
assert(output.startsWith(resolve('docs/plans/backfill-proof/evidence/s7-verification-2026-11-04') + '/'));
await mkdir(output); // A fresh directory is required, including after failures.
const scratch = await mkdtemp(join(tmpdir(), 'backfill-proof-s7-build-'));
const source = join(scratch, 'app');
const db = await createTestDatabase('s7_build');
const fontRoot = join(root, 'docs/plans/backfill-proof/evidence/s7-verification-2026-11-04/font-transport');
const fontRequests: string[] = [];
const fontServer = createServer(async (request, response) => {
  const file = (request.url ?? '').slice(1);
  if (file !== basename(file) || !file.endsWith('.woff2')) { response.writeHead(404).end(); return; }
  try {
    const bytes = await readFile(join(fontRoot, file));
    fontRequests.push(file);
    response.writeHead(200, { 'Content-Type': 'font/woff2' }).end(bytes);
  } catch { response.writeHead(404).end(); }
});
const allowlist = ['src', 'public', 'sim/buyers/buyer.ts', 'sim/buyers/intents.ts', 'package.json', 'package-lock.json', 'tsconfig.json', 'next.config.ts', 'postcss.config.mjs'];
const manifest: { path: string; sha256: string }[] = [];
const digest = async (path: string) => createHash('sha256').update(await readFile(path)).digest('hex');
async function collect(path: string): Promise<void> {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.isDirectory()) await collect(join(path, entry.name));
    else if (entry.isFile()) {
      const relative = join(path, entry.name).slice(source.length + 1);
      assert.equal(await digest(join(root, relative)), await digest(join(source, relative)));
      manifest.push({ path: relative, sha256: await digest(join(root, relative)) });
    }
  }
}
const env: NodeJS.ProcessEnv = {
  PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
  NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', LOG_LEVEL: 'error',
  NODE_OPTIONS: `--import=${join(root, 'scripts/verification/proof-s7-loopback.mjs')}`,
  NEXT_FONT_GOOGLE_MOCKED_RESPONSES: join(root, 'docs/plans/backfill-proof/evidence/s7-verification-2026-11-04/font-transport/responses.cjs'),
  TEST_DATABASE_URL: 'postgres://postgres@127.0.0.1:5432/postgres', DATABASE_URL: db.url,
  META_API_KEY: 'offline-dummy', META_BASE_URL: 'https://model.invalid/v1',
  META_MODEL_SPARK: 'fixture:s1-menu', META_MODEL_WONDER: 'fixture:s3-wonder',
};
const runs: { dependencyLayout: string; command: string; exit: number | null }[] = [];
async function build(layout: string) {
  const args = ['run', 'build', ...(debug ? ['--', '--debug-prerender'] : [])];
  const child = spawn('npm', args, { cwd: source, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let outputText = '';
  child.stdout.on('data', chunk => { outputText += chunk; });
  child.stderr.on('data', chunk => { outputText += chunk; });
  const [exit] = await once(child, 'exit');
  await writeFile(join(output, `${layout}.txt`), outputText);
  runs.push({ dependencyLayout: layout, command: `npm ${args.join(' ')}`, exit });
  return { exit, outputText };
}
try {
  await mkdir(source);
  await mkdir(join(source, 'sim/buyers'), { recursive: true });
  await new Promise<void>(resolve => fontServer.listen(0, '127.0.0.1', resolve));
  const address = fontServer.address();
  assert(address && typeof address !== 'string');
  const responses: Record<string, string> = createRequire(import.meta.url)(join(fontRoot, 'responses.cjs'));
  const localResponses = Object.fromEntries(Object.entries(responses).map(([url, css]) => [url,
    css.replace(/font-family:(Silkscreen|IBM Plex Mono);/g, "font-family: '$1';")
      .replace(/url\([^)]*\/([^/()]+\.woff2)\)/g, `url(http://127.0.0.1:${address.port}/$1)`),
  ]));
  const mockPath = join(source, '.s7-font-responses.cjs');
  await writeFile(mockPath, `module.exports = ${JSON.stringify(localResponses)};\n`);
  env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES = mockPath;
  for (const path of allowlist) await cp(join(root, path), join(source, path), {
    recursive: true, filter: item => !basename(item).startsWith('.env') && !['.DS_Store', '.git', 'archive'].includes(basename(item)),
  });
  for (const path of allowlist) {
    const target = join(source, path);
    if (path.includes('.')) {
      assert.equal(await digest(join(root, path)), await digest(target));
      manifest.push({ path, sha256: await digest(target) });
    } else await collect(target);
  }
  await symlink(join(root, 'node_modules'), join(source, 'node_modules'));
  await writeFile(join(output, 'resources.json'), JSON.stringify({ scratch, database: new URL(db.url).pathname.slice(1) }, null, 2) + '\n');
  const first = await build('symlinked-dependencies');
  if (first.exit !== 0) {
    // Turbopack refuses a node_modules symlink outside its inferred filesystem root.
    assert.match(first.outputText, /outside|symlink|resolve.*next|Next\.js package not found/i, 'Build failure needs a separate diagnosis');
    await rm(join(source, '.next'), { recursive: true, force: true });
    await rm(join(source, 'node_modules'));
    // Keep .bin/next relative so the CLI and compiled app use the same copied Next runtime.
    await cp(join(root, 'node_modules'), join(source, 'node_modules'), { recursive: true, mode: constants.COPYFILE_FICLONE, verbatimSymlinks: true });
    const nextCli = await realpath(join(source, 'node_modules/.bin/next'));
    const copiedNextCli = await realpath(join(source, 'node_modules/next/dist/bin/next'));
    await writeFile(join(output, 'dependency-resolution.json'), JSON.stringify({ nextCli, copiedNextCli }, null, 2) + '\n');
    assert.equal(nextCli, copiedNextCli, 'Build CLI must resolve inside the copied dependency tree');
    const second = await build('copied-installed-dependencies');
    assert.equal(second.exit, 0, 'Declared production build failed with local installed dependencies');
  }
  for (const item of manifest) {
    assert.equal(await digest(join(root, item.path)), item.sha256);
    assert.equal(await digest(join(source, item.path)), item.sha256);
  }
  await writeFile(join(output, 'source-manifest.json'), JSON.stringify({ allowlist, files: manifest, fixtureReplacements: [], runs }, null, 2) + '\n');
} finally {
  await writeFile(join(output, 'commands.json'), JSON.stringify(runs, null, 2) + '\n');
  await writeFile(join(output, 'font-transport.json'), JSON.stringify({ provenance: 'Original cached WOFF2 bytes served over loopback; mocked stylesheet transport only; no product source changes', requests: fontRequests }, null, 2) + '\n');
  const failures: string[] = [];
  try { await new Promise<void>((resolve, reject) => fontServer.close(error => error ? reject(error) : resolve())); } catch { failures.push('font-server'); }
  try { await db.drop(); } catch { failures.push('database'); }
  try { await rm(scratch, { recursive: true, force: true }); } catch { failures.push('scratch'); }
  await writeFile(join(output, 'cleanup.json'), JSON.stringify({ failures, scratchRemoved: !failures.includes('scratch'), databaseDropped: !failures.includes('database') }, null, 2) + '\n');
  assert.deepEqual(failures, []);
}
