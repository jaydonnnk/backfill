import { mkdir, writeFile } from 'node:fs/promises';
import { evaluate } from './runner';

if (process.argv[2] !== '--synthetic') throw new Error('Paid evaluation disabled. Exact models, episodes, retries, provider-enforced spending cap and isolated storage require separate authorization. No environment or database was loaded.');
let id = 0;
const run = await evaluate({ runId: 'synthetic-preview', kind: 'synthetic', revision: 'offline-fixture-v1', models: ['fixture/muse-spark','fixture/deepseek'], checkpoint: async () => {}, attempt: async request => ({ id: ++id, purpose: request.purpose, model: request.model, provider: 'openrouter', attempt: 1, ok: true, costNanoUsd: 1000000, proposalCents: request.model === 'fixture/muse-spark' ? 780 : 800 }) });
await mkdir('evals/fixtures',{ recursive: true });
await writeFile('evals/fixtures/synthetic-preview.json',JSON.stringify(run,null,2)+'\n');
