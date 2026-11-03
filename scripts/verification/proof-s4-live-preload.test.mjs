import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('historical preload refuses consumed authority before any upstream dispatch', () => {
  const script = `
    import assert from 'node:assert/strict';
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw Error('Unexpected network'); };
    await assert.rejects(import(${JSON.stringify(pathToFileURL(join(process.cwd(), 'scripts/verification/proof-s4-live-preload.mjs')).href)}), /s4_live_authority_consumed/);
    assert.equal(calls, 0);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8', env: { PATH: process.env.PATH, S4_LIVE_RUN_DIR: '/nonexistent', S4_LIVE_AUTHORITY: 'approved-5-calls-usd6.57' },
  });
  assert.equal(result.status, 0, result.stderr);
});
