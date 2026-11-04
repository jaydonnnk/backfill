import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "../tests/e2e",
  testMatch: "merchant-access.spec.ts",
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { baseURL: process.env.MERCHANT_ACCESS_URL ?? "http://127.0.0.1:3198", browserName: "chromium", trace: "off", video: "off", screenshot: "off" },
});
