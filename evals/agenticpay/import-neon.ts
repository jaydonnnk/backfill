import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { asc } from 'drizzle-orm';
import { connectDb, type Db } from '../../src/lib/db/client';
import { llmCalls } from '../../src/lib/db/schema';
import { validateRun } from './contract';
import { inRun, verifyStoredRun } from './store';

// One-use import, authorized by the user on 2026-11-02 ("Copy calls to Neon"): copy run 02's
// llm_calls rows from its isolated evaluation database into Neon so the hosted /evals can verify it.
// Neon's identity column assigns new IDs, so the published result is re-keyed to them; the original
// result with local IDs and the ID mapping are kept as evidence. Writes nothing but llm_calls rows.
const runId = 's9-20261102-authorized-02';
if (process.argv[2] !== `--execute-${runId}-neon-import`) throw new Error('This entrypoint requires the exact one-use import flag');
const resultPath = `evals/results/${runId}.json`, evidence = 'docs/plans/backfill/evidence/s9-neon-import';
await mkdir(evidence, { recursive: true });
// Exclusive copy doubles as the one-use marker: a second run fails here before touching Neon.
await copyFile(resultPath, `${evidence}/${runId}.local-ids.json`, 1 /* COPYFILE_EXCL */);
const run = validateRun(JSON.parse(await readFile(resultPath, 'utf8')));

const local = connectDb((await readFile('/tmp/backfill-s9-evaluation-02-url', 'utf8')).trim(), 1);
let rows;
try {
  await verifyStoredRun(local.db, run);
  rows = await local.db.select().from(llmCalls).where(inRun(runId)).orderBy(asc(llmCalls.id));
} finally { await local.close(); }

const neon = connectDb(parseEnv(await readFile('.env.local', 'utf8')).DATABASE_URL!, 1);
const mapping = new Map<number, number>();
let published;
try {
  published = await neon.db.transaction(async tx => {
    if ((await tx.select({ id: llmCalls.id }).from(llmCalls).where(inRun(runId))).length) throw new Error('Run calls already present in Neon');
    for (const { id, ...row } of rows) {
      const [saved] = await tx.insert(llmCalls).values(row).returning({ id: llmCalls.id });
      mapping.set(id, saved!.id);
    }
    const rekeyed = validateRun({ ...run, calls: run.calls.map(c => ({ ...c, id: mapping.get(c.id)! })), episodes: run.episodes.map(e => ({ ...e, rounds: e.rounds.map(r => ({ ...r, callIds: r.callIds.map(id => mapping.get(id)!) })) })) });
    // Same exact-set check the page runs, inside the transaction: any mismatch rolls the import back.
    return verifyStoredRun(tx as unknown as Db, rekeyed);
  });
} finally { await neon.close(); }

await writeFile(`${evidence}/${runId}-neon-ids.json`, JSON.stringify({ runId, importedAt: new Date().toISOString(), rows: rows.length, costNanoUsd: rows.reduce((n, r) => n + r.costNanoUsd, 0), localToNeonIds: Object.fromEntries(mapping) }, null, 2) + '\n', { flag: 'wx' });
await writeFile(resultPath, JSON.stringify(published, null, 2) + '\n');
console.log(JSON.stringify({ runId, imported: rows.length, neonIds: [...mapping.values()] }));
