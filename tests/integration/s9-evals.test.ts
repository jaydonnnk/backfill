import { EVALUATION_MODELS } from '../../evals/agenticpay/models';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../support/db';
import { llmCalls } from '@/lib/db/schema';
import { evaluate } from '../../evals/agenticpay/runner';
import { openRouterAttempt } from '../../evals/agenticpay/openrouter';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runStoredEvaluation } from '../../evals/agenticpay/pipeline';
import { verifyStoredRun } from '../../evals/agenticpay/store';
let database: TestDatabase;
beforeAll(async () => {
  database = await createTestDatabase('s9');
  // CI's Postgres uses a linguistic collation; reproduce it so collation-sensitive run selection fails here too.
  await database.admin`ALTER TABLE llm_calls ALTER COLUMN purpose TYPE text COLLATE "und-x-icu"`;
});
afterAll(async () => { await database?.drop(); });
it('joins only this run, includes failed charges, and rejects missing or changed persisted evidence', async () => {
  const attempt = openRouterAttempt({ apiKey: 'synthetic', journal: async () => {}, fetch: async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"priceCents":780,"rationale":"synthetic fixture"}' } }], usage: { prompt_tokens: 20, completion_tokens: 10, cost: .0001 } })), persist: async row => { const [stored] = await database.db.insert(llmCalls).values(row).returning({ id: llmCalls.id }); if (!stored) throw new Error('Insert failed'); return stored.id; } });
  const run = await evaluate({ runId: 'stored-test', kind: 'measured', models: EVALUATION_MODELS, revision: 'fixture-test', checkpoint: async () => {}, attempt });
  // The measured code path is tested with explicitly synthetic HTTP responses in a disposable DB.
  await database.admin`INSERT INTO llm_calls(provider,model,purpose,attempt,tokens_in,tokens_cached_in,tokens_out,cost_nano_usd,latency_ms,ok) VALUES ('meta','old','tracer',1,0,0,0,999999,0,true)`;
  expect((await verifyStoredRun(database.db,run)).calls.length).toBe(14);
  await database.admin`UPDATE llm_calls SET cost_nano_usd=7 WHERE id=${run.calls[0]!.id}`;
  await expect(verifyStoredRun(database.db,run)).rejects.toThrow('Stored llm_calls');
  await database.admin`UPDATE llm_calls SET cost_nano_usd=100000 WHERE id=${run.calls[0]!.id}`;
  await database.admin`INSERT INTO llm_calls(provider,model,purpose,attempt,tokens_in,tokens_cached_in,tokens_out,cost_nano_usd,latency_ms,ok) VALUES ('openrouter','fixture/a','eval:stored-test:orphan:1',1,0,0,0,10,0,false)`;
  await expect(verifyStoredRun(database.db,run)).rejects.toThrow('Stored llm_calls');
});

it('writes a verified final artifact and durable journal through the full offline pipeline', async () => {
  const directory = await mkdtemp(join(tmpdir(),'s9-pipeline-'));
  try {
    const run = await runStoredEvaluation({ db: database.db, directory, runId: 'pipeline-test', models: EVALUATION_MODELS, revision: 'synthetic-test', apiKey: 'dummy', fetch: async () => new Response(JSON.stringify({ choices: [{ message: { content: 'invalid' } }], usage: { prompt_tokens: 1, completion_tokens: 1, cost: .00001 } })) });
    expect(run.status).toBe('failed');
    expect(run.summary[0]!.costNanoUsd).toBe(30000);
    expect(JSON.parse(await readFile(join(directory,'pipeline-test.json'),'utf8'))).toEqual(run);
    const journal = await readFile(join(directory,'pipeline-test.journal.jsonl'),'utf8');
    expect(journal).toContain('started'); expect(journal).toContain('stored');
    const last = JSON.parse(journal.trim().split('\n').at(-1)!);
    expect(last.event.run.status).toBe('failed');
  } finally { await rm(directory,{recursive:true,force:true}); }
});

it('stops before HTTP when the activation allowance guard refuses', async () => {
  const directory=await mkdtemp(join(tmpdir(),'s9-gated-'));
  let called=false;
  try {
    await expect(runStoredEvaluation({ db: database.db,directory,runId:'guarded-test',models:EVALUATION_MODELS,revision:'synthetic-test',apiKey:'dummy',beforeAttempt:async()=>{throw new Error('budget stop');},fetch:async()=>{called=true;throw new Error('must not send');} })).rejects.toThrow('budget stop');
    expect(called).toBe(false);
  } finally { await rm(directory,{recursive:true,force:true}); }
});
