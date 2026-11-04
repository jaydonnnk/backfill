import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { createTestDatabase, type TestDatabase } from "../../tests/support/db";
import { stopProcessGroup } from "./merchant-access-process";
import { seedSandbox } from "../ops/seed-sandbox";
import { redact } from "../../src/lib/log";

// Runs the real app as its restricted login, without reading the developer's .env.local.
const root = resolve(".");
const scratch = await mkdtemp(join(tmpdir(), "backfill-merchant-access-"));
const source = join(scratch, "app");
let database: TestDatabase | undefined;
const role = `ma_browser_${randomBytes(6).toString("hex")}`;
const fontRoot = join(root, "docs/plans/backfill-proof/evidence/s7-verification-2026-11-04/font-transport");
let server: ChildProcess | undefined;
let serverLog = "";
let roleCreated = false;
const cleanEnv: NodeJS.ProcessEnv = {
  PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
  NODE_ENV: "development",
  NEXT_TELEMETRY_DISABLED: "1", LOG_LEVEL: "error",
  META_API_KEY: "offline-dummy", META_BASE_URL: "https://model.invalid/v1",
  NVIDIA_API_KEY: "offline-dummy", AI_GATEWAY_API_KEY: "offline-dummy",
  BACKFILL_S4_NVIDIA_GLIMMER_APPROVED: "1", BACKFILL_S4_GATEWAY_APPROVED: "1",
  META_MODEL_SPARK: "fixture:menu", META_MODEL_WONDER: "fixture:wonder",
  NODE_OPTIONS: `--import=${join(root, "scripts/verification/final-provider.mjs")}`,
};
try {
  database = await createTestDatabase("merchant_browser");
  await database.admin.unsafe(`CREATE ROLE ${role} LOGIN IN ROLE backfill_app`);
  roleCreated = true;
  await seedSandbox(database.db);
  const runtimeUrl = new URL(database.url);
  runtimeUrl.username = role;
  const portServer = createServer();
  await new Promise<void>(resolve => portServer.listen(0, "127.0.0.1", resolve));
  const address = portServer.address();
  assert(address && typeof address !== "string");
  const appUrl = `http://127.0.0.1:${address.port}`;
  await new Promise<void>((resolve, reject) => portServer.close(error => error ? reject(error) : resolve()));
  await mkdir(source);
  for (const path of ["src", "public", "sim", "package.json", "package-lock.json", "tsconfig.json", "next.config.ts", "postcss.config.mjs"]) {
    await cp(join(root, path), join(source, path), { recursive: true });
  }
  await symlink(join(root, "node_modules"), join(source, "node_modules"));
  const css: Record<string, string> = createRequire(import.meta.url)(join(fontRoot, "responses.cjs"));
  const mockedCss = Object.fromEntries(Object.entries(css).map(([url, styles]) => [url,
    // Webpack's mocked font loader reads absolute file paths; HTTP URLs become literal bytes.
    styles.replace(/font-family:(Silkscreen|IBM Plex Mono);/g, "font-family: '$1';"),
  ]));
  const fontResponses = join(scratch, "fonts.cjs");
  await writeFile(fontResponses, `module.exports = ${JSON.stringify(mockedCss)};\n`);
  server = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(address.port)], {
    cwd: source, detached: true, env: { ...cleanEnv, DATABASE_URL: runtimeUrl.toString(), APP_BASE_URL: appUrl, NEXT_FONT_GOOGLE_MOCKED_RESPONSES: fontResponses }, stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout?.on("data", chunk => { serverLog += chunk; });
  server.stderr?.on("data", chunk => { serverLog += chunk; });
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null || server.signalCode !== null) throw new Error("Isolated preview exited before startup");
    try { ready = (await fetch(`${appUrl}/merchant`, { signal: AbortSignal.timeout(2000) })).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert(ready, "Isolated preview did not become ready");
  if (process.argv.includes("--preview")) {
    console.log(`Isolated merchant preview: ${appUrl}/merchant`);
    await new Promise<void>((resolve, reject) => {
      process.once("SIGTERM", resolve);
      process.once("SIGINT", resolve);
      server?.once("exit", () => reject(new Error("Isolated preview exited")));
    });
  } else {
    const test = spawn(process.execPath, [join(root, "node_modules/@playwright/test/cli.js"), "test", "--config", "config/playwright.final-sandbox.config.ts"], {
      cwd: root, env: { ...cleanEnv, MERCHANT_ACCESS_URL: appUrl, MERCHANT_ACCESS_TEST_DATABASE_URL: database.url }, stdio: "inherit",
    });
    const [code] = await once(test, "exit");
    assert.equal(code, 0, "Merchant browser verification failed");
    console.log("Merchant browser verification passed using a disposable database and restricted role.");
  }
} catch (error) {
  // The app receives only dummy provider config and logs safe error metadata. Never print links.
  const failureLog = join(tmpdir(), `merchant-access-failure-${Date.now()}.log`);
  await writeFile(failureLog, redact(serverLog));
  console.error(`Isolated server log: ${failureLog}`);
  throw error;
} finally {
  const failures: Error[] = [];
  const cleanups: Array<() => Promise<unknown>> = [
    async () => { if (server) await stopProcessGroup(server); },
    async () => { await database?.drop(); },
    async () => {
      if (!roleCreated) return;
      const admin = postgres(process.env.TEST_DATABASE_URL ?? "", { max: 1, onnotice: () => {} });
      try { await admin.unsafe(`DROP ROLE IF EXISTS ${role}`); }
      finally { await admin.end({ timeout: 5 }); }
    },
    () => rm(scratch, { recursive: true, force: true }),
  ];
  for (const cleanup of cleanups) {
    try { await cleanup(); }
    catch (error) { failures.push(error instanceof Error ? error : new Error("Preview cleanup failed")); }
  }
  if (failures.length) throw new AggregateError(failures, "Preview cleanup incomplete");
  console.log("Isolated preview, database, and test role cleaned up.");
}
