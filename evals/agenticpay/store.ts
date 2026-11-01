import { and, gte, lt } from 'drizzle-orm';
import { llmCalls } from '../../src/lib/db/schema';
import type { Db } from '../../src/lib/db/client';
import { validateRun } from './contract';
import { storedEvidence } from './openrouter';
export async function verifyStoredRun(db: Db, input: unknown) {
  const run = validateRun(input);
  if (run.kind !== 'measured') throw new Error('Synthetic fixture is not measured evidence');
  const prefix = `eval:${run.runId}:`;
  const rows = await db.select().from(llmCalls).where(and(gte(llmCalls.purpose,prefix),lt(llmCalls.purpose,`eval:${run.runId};`)));
  const evidence = rows.map(storedEvidence).sort((a,b) => a.id-b.id);
  if (JSON.stringify(evidence) !== JSON.stringify([...run.calls].sort((a,b) => a.id-b.id))) throw new Error('Stored llm_calls do not match this evaluation');
  return run;
}
