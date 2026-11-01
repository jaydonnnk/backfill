import { llmCalls } from '../../src/lib/db/schema';
import type { Db } from '../../src/lib/db/client';
import { createRunFiles } from './files';
import { openRouterAttempt } from './openrouter';
import { evaluate } from './runner';
import { verifyStoredRun } from './store';

// Dependency-injected for offline verification. CLI does not enable paid execution.
export async function runStoredEvaluation(options: { db: Db; directory: string; runId: string; models: [string,string]; revision: string; reasoningEffort?: 'low'; apiKey: string; fetch: typeof fetch; beforeAttempt?: () => Promise<void> }) {
  const files = await createRunFiles(options.directory,options.runId);
  try {
    const attempt = openRouterAttempt({ apiKey: options.apiKey, reasoningEffort: options.reasoningEffort, fetch: options.fetch, journal: async request => { await options.beforeAttempt?.(); await files.append({ kind: 'started', purpose: request.purpose, model: request.model }); }, diagnose: diagnostic => files.append({ kind: 'diagnostic', ...diagnostic }), persist: async row => {
      const [saved] = await options.db.insert(llmCalls).values(row).returning({ id: llmCalls.id });
      if (!saved) throw new Error('Evaluation call was not stored');
      await files.append({ kind: 'stored', id: saved.id, purpose: row.purpose });
      return saved.id;
    } });
    const run = await evaluate({ ...options, kind: 'measured', attempt, checkpoint: run => files.append({ kind: 'checkpoint', run }) });
    await verifyStoredRun(options.db,run);
    await files.finish(run);
    return run;
  } catch (error) {
    await files.append({ kind: 'interrupted' });
    throw error;
  } finally { await files.close(); }
}
