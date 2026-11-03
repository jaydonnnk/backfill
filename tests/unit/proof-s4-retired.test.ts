import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('retired local launchers refuse before configuration, startup or dispatch', () => {
  for (const name of ['proof-s4-live.ts', 'proof-s4-glimmer-cpu.ts']) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', `scripts/verification/${name}`], {
      encoding: 'utf8', env: { PATH: process.env.PATH, NODE_ENV: 'test' }, timeout: 5000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('s4_local_glimmer_retired');
    expect(result.stdout).toBe('');
  }
});
