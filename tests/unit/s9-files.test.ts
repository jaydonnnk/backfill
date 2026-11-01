import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import fixture from '../../evals/fixtures/synthetic-preview.json';
import { createRunFiles } from '../../evals/agenticpay/files';
import { validateRun } from '../../evals/agenticpay/contract';
it('reserves runs, retains started attempts, validates output and refuses overwrite', async () => {
  const dir=await mkdtemp(join(tmpdir(),'s9-files-'));
  try {
    const files=await createRunFiles(dir,'synthetic-preview');
    try {
      await files.append({kind:'started'});
      expect(await readFile(join(dir,'synthetic-preview.journal.jsonl'),'utf8')).toContain('started');
      await expect(createRunFiles(dir,'synthetic-preview')).rejects.toThrow();
      await files.finish(validateRun(fixture));
      await expect(files.finish(validateRun(fixture))).rejects.toThrow();
      expect(validateRun(JSON.parse(await readFile(join(dir,'synthetic-preview.json'),'utf8'))).kind).toBe('synthetic');
    } finally { await files.close(); }
  } finally { await rm(dir,{recursive:true,force:true}); }
});
