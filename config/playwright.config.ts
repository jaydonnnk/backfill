import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '../tests/e2e',
  testMatch: '**/*.spec.ts',
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { baseURL: process.env.S95_MUTATION === '1' ? 'http://127.0.0.1:3197' : process.env.S95_REVIEW === '1' ? 'http://127.0.0.1:3196' : 'http://127.0.0.1:3195', browserName: 'chromium', actionTimeout: 10_000, trace: 'off' },
});
