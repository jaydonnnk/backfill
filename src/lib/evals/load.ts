import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { validateRun, type Run } from '../../../evals/agenticpay/contract';
import { verifyStoredRun } from '../../../evals/agenticpay/store';
import { webDb } from '../db/client';
export type EvaluationState = { kind: 'empty' | 'invalid' } | { kind: 'ready'; run: Run };
export async function loadEvaluation(preview = false): Promise<EvaluationState> {
  if (preview && process.env.NODE_ENV === 'development') {
    const fixture: unknown = JSON.parse(await readFile('evals/fixtures/synthetic-preview.json','utf8'));
    return { kind: 'ready', run: validateRun(fixture) };
  }
  let manifest: string;
  try { manifest = await readFile('evals/results/published.json','utf8'); }
  catch (error) { return { kind: error instanceof Error && 'code' in error && error.code === 'ENOENT' ? 'empty' : 'invalid' }; }
  try {
    const { runId } = z.strictObject({ runId: z.string().regex(/^[a-z0-9-]{1,64}$/) }).parse(JSON.parse(manifest));
    const input: unknown = JSON.parse(await readFile(`evals/results/${runId}.json`,'utf8'));
    const run = validateRun(input);
    if (run.runId !== runId) throw new Error('Run mismatch');
    return { kind: 'ready', run: await verifyStoredRun(webDb(),run) };
  } catch { return { kind: 'invalid' }; }
}
