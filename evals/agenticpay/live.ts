import { readFile, writeFile, open, mkdir, readdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createHash } from 'node:crypto';
import postgres from 'postgres';
import { connectDb } from '../../src/lib/db/client';
import { runMigrations } from '../../src/lib/db/migrate';
import { llmCalls } from '../../src/lib/db/schema';
import { EVALUATION_MODELS } from './models';
import { checkAllowance, checkCatalog } from './activation';
import { runStoredEvaluation } from './pipeline';

// Explicitly approved executions, one each. A consumed marker refuses any reuse of its run ID.
// Run 01 (2026-11-01) used the provider-default reasoning effort; its replies were cut off at the
// shared 1024-token budget. Run 02 (2026-11-02) sends effort "low" to both models, as production does.
const authorized = { 's9-20261101-authorized-01': { effort: undefined, database: 'backfill_s9_authorized_20261101_01', url: '/tmp/backfill-s9-evaluation-url' }, 's9-20261102-authorized-02': { effort: 'low', database: 'backfill_s9_authorized_20261102_02', url: '/tmp/backfill-s9-evaluation-02-url' } } as const;
const runId = Object.keys(authorized).find(id => process.argv[2] === `--execute-${id}`) as keyof typeof authorized | undefined;
if (!runId) throw new Error('This entrypoint requires an exact approved one-use run ID');
const { effort: reasoningEffort, database: databaseName, url: urlFile } = authorized[runId];
const evidenceDirectory = 'docs/plans/backfill/evidence/s9-activation';
await mkdir(evidenceDirectory,{recursive:true});
const config = parseEnv(await readFile('.env.local','utf8'));
const apiKey = config.OPENROUTER_API_KEY;
if (!apiKey) throw new Error('Missing OpenRouter credential');
async function get(path: string, authenticated = false): Promise<unknown> {
  const response = await fetch(`https://openrouter.ai/api/v1/${path}`,{ headers: authenticated ? {Authorization:`Bearer ${apiKey}`} : {}, signal:AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`OpenRouter preflight HTTP ${response.status}`);
  return response.json();
}
const catalog = await get('models');
checkCatalog(catalog);
const startingKey = checkAllowance(await get('key',true),0,[]);
const base = new URL((await readFile('/tmp/backfill-kopi-local-url','utf8')).trim());
if (!['localhost','127.0.0.1','[::1]'].includes(base.hostname)) throw new Error('Evaluation requires local isolated storage');
const sourcePaths = (await readdir('evals/agenticpay')).filter(p=>p.endsWith('.ts')).sort().map(p=>`evals/agenticpay/${p}`);
sourcePaths.push('src/domain/negotiation/rules.ts','src/domain/offers/evaluate.ts','src/domain/offers/schema.ts','src/lib/negotiation/merchant-agent.ts');
const hashes = Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
const revision = createHash('sha256').update(JSON.stringify(hashes)).digest('hex');
const marker = await open(`${evidenceDirectory}/${runId}.consumed.json`,'wx',0o600);
try { await marker.writeFile(JSON.stringify({runId,models:EVALUATION_MODELS,revision,hashes,approvedEpisodes:6,maxCalls:18,retries:0,providerSeed:null,reasoningEffort:reasoningEffort ?? null,spendingTargetUsd:1,providerKeyCapUsd:startingKey.limit,startingUsageUsd:startingKey.usage,createdAt:new Date().toISOString()},null,2)+'\n'); await marker.sync(); } finally { await marker.close(); }
const root = postgres(base.toString(),{max:1,onnotice:()=>{}});
try { await root.unsafe(`CREATE DATABASE "${databaseName}"`); } finally { await root.end(); }
base.pathname = `/${databaseName}`;
await runMigrations(base.toString());
await writeFile(urlFile,base.toString(),{mode:0o600,flag:'wx'});
const {db,close} = connectDb(base.toString(),1);
try {
  const run = await runStoredEvaluation({db,directory:'evals/results',runId,models:EVALUATION_MODELS,revision,reasoningEffort,apiKey,fetch,beforeAttempt:async()=>{
    const calls = await db.select({costNanoUsd:llmCalls.costNanoUsd,error:llmCalls.error}).from(llmCalls);
    checkAllowance(await get('key',true),startingKey.usage,calls);
    console.log(JSON.stringify({event:'attempt-starting',attempt:calls.length+1,maxCalls:18}));
  }});
  console.log(JSON.stringify({runId,status:run.status,summary:run.summary}));
  const finalKey = await get('key',true);
  // Save only the same sanitized spending fields as preflight, never key labels or IDs.
  const {z} = await import('zod');
  const final = z.object({data:z.object({usage:z.number(),limit:z.number(),limit_remaining:z.number()})}).parse(finalKey).data;
  await writeFile(`${evidenceDirectory}/${runId}-spend.json`,JSON.stringify({startingUsageUsd:startingKey.usage,endingUsageUsd:final.usage,accountUsageDeltaUsd:final.usage-startingKey.usage,remainingKeyAllowanceUsd:final.limit_remaining,providerKeyCapUsd:final.limit,runCostsNanoUsd:run.summary.map(s=>({model:s.model,costNanoUsd:s.costNanoUsd}))},null,2)+'\n',{flag:'wx'});
} finally { await close(); }
