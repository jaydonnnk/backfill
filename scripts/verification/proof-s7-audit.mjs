import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, access, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from 'postgres';

const evidence = 'docs/plans/backfill-proof/evidence/s7-verification-2026-11-04';
assert.equal(process.env.TEST_DATABASE_URL, 'postgres://postgres@127.0.0.1:5432/postgres');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const historical = await json(join(evidence, 'historical-hashes-before.json'));
for (const file of historical) assert.equal(await hash(file.path), file.sha256, `Historical evidence changed: ${file.path}`);
const retention = await json(join(evidence, 'retention.json'));
assert.equal(retention.archived.length, retention.archivedOnlyFiles);
assert.equal(retention.allOriginalBytesCopiedAndVerified, true);
let localArchiveVerified = false;
let archiveAvailable = true;
try {
  await access(retention.archiveRoot);
} catch (error) { if (error.code !== 'ENOENT') throw error; archiveAvailable = false; }
if (archiveAvailable) {
  for (const file of retention.archived) assert.equal(await hash(file.archivePath), file.sha256);
  localArchiveVerified = true;
}
const databaseNames = [], roleNames = [], screenshots = [], passes = [];
async function absent(path) {
  try { await access(path); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  assert.fail(`Owned scratch still exists: ${path}`);
}
const ownedScratch = new Set();
for (const entry of await json(join(evidence, 'resource-receipts.json'))) {
  if (typeof entry.resource.scratch === 'string') ownedScratch.add(entry.resource.scratch);
}
const browserRoot = 'docs/plans/backfill-proof/evidence/s5-local-2026-11-04';
const ownedFolders = [evidence, ...(await readdir(browserRoot)).filter(name => name.startsWith('s7-')).map(name => join(browserRoot, name))];
for (const folder of ownedFolders) for (const entry of await readdir(folder, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !(entry.name === 'resources.json' || entry.name.endsWith('cleanup.json'))) continue;
  const resource = await json(join(entry.parentPath, entry.name));
  if (typeof resource.scratch === 'string') ownedScratch.add(resource.scratch);
  if (resource.failures) assert.deepEqual(resource.failures, []);
  if (resource.cleanupFailures) assert.deepEqual(resource.cleanupFailures, []);
}
for (const path of ownedScratch) await absent(path);
for (const number of ['02', '03']) {
  const base = `docs/plans/backfill-proof/evidence/s5-local-2026-11-04/s7-verification-2026-11-04-pass-${number}`;
  const cleanup = await json(join(base, 'browser-cleanup.json'));
  assert.deepEqual(cleanup.cleanupFailures, []);
  assert.equal(cleanup.ownedDatabaseRemaining, 0); assert.equal(cleanup.ownedRoleRemaining, 0);
  assert.equal(cleanup.serverStopped, true); assert.equal(cleanup.scratchRemoved, true);
  const attempts = await readdir(join(base, 'attempts'));
  assert.equal(attempts.length, 1);
  const resources = await json(join(base, 'attempts', attempts[0], 'resources.json'));
  databaseNames.push(resources.database); roleNames.push(resources.role); await absent(resources.scratch);
  const log = await readFile(join(base, 'attempts', attempts[0], 'browser-test.txt'), 'utf8');
  assert.match(log, /24 passed/); assert.doesNotMatch(log, /\d+ failed/);
  const manifest = await json(join(base, 'source-manifest.json'));
  for (const file of manifest.files) assert.equal(await hash(file.path), file.rootSha256);
  for (const file of manifest.verificationInputs) assert.equal(await hash(file.path), file.sha256);
  const s1 = await json(join(base, 'combined-regressions/s1/browser-receipt.json'));
  assert.equal(s1.modelCalls, 0); assert.deepEqual(s1.browserErrors, []);
  for (const result of s1.receipts) {
    const success = result.scenario === 'success', totals = result.ledger.totals;
    assert.equal(result.parties.length, success ? 4 : 3);
    assert.equal(new Set(result.parties.map(p => p.agentId)).size, result.parties.length);
    assert.equal(totals.entries, success ? 4 : 0); assert.equal(totals.covers, success ? 8 : 0);
    assert.equal(totals.chargedCents, success ? 4352 : 0); assert.equal(totals.savingsCents, success ? 1088 : 0);
    assert.equal(result.ledger.reconciled, true);
  }
  for (const repeat of [1, 2]) {
    const result = await json(join(base, `combined-regressions/s4/browser-buyers-${repeat}.json`));
    assert.deepEqual([result.failedMedia.phase, result.failedMedia.reason], ['failed', 'segmentation_failed']);
    assert.equal(result.sessions.length, 4); assert.equal(new Set(result.sessions.map(s => s.partyId)).size, 4);
    for (const session of result.sessions) {
      assert.deepEqual(session.approval.terms, session.terms);
      assert.equal(session.result.commitment.ruleId, result.sameOfferThroughMediaFailureAndSettlement);
      assert.equal(session.result.commitment.status, 'pending'); assert.equal(session.result.commitment.covers, 2);
    }
    assert.equal(result.pending.scene.pooled.filledCovers, 0);
    assert.equal(result.settled.scene.pooled.filledCovers, 8); assert.equal(result.settled.ledger.reconciled, true);
  }
  async function images(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) await images(path);
      else if (entry.name.endsWith('.png')) {
        const bytes = await readFile(path);
        screenshots.push({ path, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), sha256: await hash(path) });
      }
    }
  }
  await images(base);
  const httpReceipts = await json(join(base, 'http-receipts.json'));
  assert.equal(httpReceipts.length, 24);
  for (const { receipt: result } of httpReceipts) {
    assert.deepEqual(result.external, []); assert.deepEqual(result.pageErrors, []);
  }
  passes.push({ pass: number, checks: 24, resources, settlementReconciled: true });
}
const reviewed = await json(join(evidence, 'screenshot-review.json'));
assert.equal(screenshots.length, reviewed.screenshots.length);
for (const image of reviewed.screenshots) assert.equal(await hash(image.path), image.sha256);
const archivedScreenshots = retention.archived.filter(file => file.path.endsWith('.png'));
assert.equal(screenshots.length + archivedScreenshots.length, 88);
const declaredBase = join(evidence, 'build-diagnosis-01/final-declared');
const declared = await json(join(declaredBase, 'source-manifest.json'));
assert.deepEqual(declared.fixtureReplacements, []);
assert.equal(declared.runs.at(-1).command, 'npm run build');
assert.equal(declared.runs.at(-1).exit, 0);
for (const file of declared.files) assert.equal(await hash(file.path), file.sha256);
const resolution = await json(join(declaredBase, 'dependency-resolution.json'));
assert.equal(resolution.nextCli, resolution.copiedNextCli);
const buildLog = await readFile(join(declaredBase, 'copied-installed-dependencies.txt'), 'utf8');
assert.match(buildLog, /Compiled successfully/);
assert.match(buildLog, /Generating static pages[^\n]*\(5\/5\)/);
const gates = [];
for (const name of ['lint', 'typecheck', 'suite', 'guards', 's6-audit', 's6-replay', 's6b']) {
  const gate = await json(join(evidence, `publication-01/${name}-command.json`));
  assert.equal(gate.exit, 0, `Required gate failed: ${name}`);
  gates.push({ name, command: gate.argv, exit: gate.exit, log: `publication-01/${gate.log}` });
}
const suiteLog = (await readFile(join(evidence, 'publication-01/suite.txt'), 'utf8')).replace(/\u001b\[[0-9;]*m/g, '');
assert.match(suiteLog, /Tests\s+607 passed/);
assert.match(suiteLog, /Test Files\s+72 passed/);
assert.match(await readFile(join(evidence, 'publication-01/guards.txt'), 'utf8'), /tests 12/);
const admin = postgres(process.env.TEST_DATABASE_URL, { max: 1 });
let cleanup;
try {
  const databases = await admin`select datname from pg_database where datname like 'backfill_t_%'`;
  const roles = await admin`select rolname from pg_roles where rolname like 'backfill_t_%'`;
  const baseline = await json(join(evidence, 'resource-baseline.json'));
  const addedDatabases = databases.filter(row => !baseline.databases.some(b => b.datname === row.datname));
  const addedRoles = roles.filter(row => !baseline.roles.some(b => b.rolname === row.rolname));
  assert.deepEqual(addedDatabases, []); assert.deepEqual(addedRoles, []);
  cleanup = { addedDatabases, addedRoles, unrelatedBaselineDatabasesPreserved: baseline.databases.every(b => databases.some(r => r.datname === b.datname)) };
} finally { await admin.end(); }
const result = { historicalFilesUnchanged: historical.length, ownedScratchVerifiedAbsent: [...ownedScratch], passes, screenshots, cleanup, gates,
  screenshotRetention: { original: 88, committed: screenshots.length, archivedLocally: archivedScreenshots.length, localArchiveVerified },
  defaultProductionBuild: { command: 'npm run build', exit: 0, sourceFiles: declared.files.length, evidence: 'build-diagnosis-01/final-declared/' }, s7Complete: true };
await writeFile(join(evidence, 'audit.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ historicalFilesUnchanged: historical.length, browserChecks: 48, screenshots: screenshots.length, cleanup, s7Complete: true }));
