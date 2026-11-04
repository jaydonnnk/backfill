import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'../tests/e2e',testMatch:'final-sandbox.spec.ts',workers:1,retries:0,reporter:'list',use:{baseURL:process.env.MERCHANT_ACCESS_URL,browserName:'chromium',trace:'off',screenshot:'off',video:'off'}});
