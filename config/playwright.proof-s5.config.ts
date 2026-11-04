import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '../tests/e2e', testMatch: ['proof-s1.spec.ts', 'proof-s2.spec.ts', 'proof-s3.spec.ts', 'proof-s4.spec.ts', 'proof-s5.spec.ts', 'kopi-lifecycle.spec.ts'],
  workers: 1, retries: 0, reporter: 'list', outputDir: '../test-results/proof-s5',
  use: { baseURL: process.env.S1_APP_URL, browserName: 'chromium', actionTimeout: 10_000, trace: 'off' },
});
