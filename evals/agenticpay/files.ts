import { open, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { validateRun, type Run } from './contract';

// Reserve the run before calls. Append-only fsynced journal survives interrupted episodes.
export async function createRunFiles(directory: string, runId: string) {
  z.string().regex(/^[a-z0-9-]{1,64}$/).parse(runId);
  await mkdir(directory,{recursive:true});
  const journal = await open(join(directory,`${runId}.journal.jsonl`),'wx',0o600);
  let sequence=0;
  return {
    async append(event: unknown) { await journal.writeFile(JSON.stringify({sequence:++sequence,event})+'\n'); await journal.sync(); },
    async finish(input: Run) {
      const run = validateRun(input);
      if (run.runId !== runId) throw new Error('Run identity mismatch');
      const file = await open(join(directory,`${runId}.json`),'wx',0o600);
      try { await file.writeFile(JSON.stringify(run,null,2)+'\n'); await file.sync(); } finally { await file.close(); }
    },
    async close() { await journal.close(); },
  };
}
