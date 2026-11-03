import { defineConfig } from '@playwright/test';

// Separate from legacy S95 switches. The launcher supplies its owned server URL.
export default defineConfig({
  testDir: '../tests/e2e', testMatch: 'proof-s1.spec.ts', workers: 1, retries: 0,
  reporter: 'list', outputDir: '../test-results/proof-s1',
  use: { baseURL: process.env.S1_APP_URL, browserName: 'chromium', actionTimeout: 10_000, trace: 'off' },
});
