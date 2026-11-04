import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectDb } from "@/lib/db/client";
import { takeRateLimit } from "@/lib/rate-limit";
import { createTestDatabase, type TestDatabase } from "../support/db";

let t: TestDatabase;
let app: ReturnType<typeof connectDb>;
let runtime: postgres.Sql;
const role = `rl_${randomBytes(6).toString("hex")}`;

beforeAll(async () => {
  t = await createTestDatabase("rate_limit");
  await t.admin.unsafe(`CREATE ROLE ${role} LOGIN IN ROLE backfill_app`);
  const url = new URL(t.url);
  url.username = role;
  app = connectDb(url.toString(), 10);
  runtime = postgres(url.toString(), { max: 1, onnotice: () => {} });
});
afterAll(async () => {
  await runtime?.end({ timeout: 5 });
  await app?.close();
  await t?.drop();
  const root = postgres(process.env.TEST_DATABASE_URL ?? "", { max: 1, onnotice: () => {} });
  try { await root.unsafe(`DROP ROLE IF EXISTS ${role}`); }
  finally { await root.end({ timeout: 5 }); }
});

describe("takeRateLimit", () => {
  it("admits exactly the limit under concurrency", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => takeRateLimit(app.db, "b", "k", 5, 3600)));
    expect(results.filter(Boolean)).toHaveLength(5);
  });
  it("counts each key separately", async () => {
    expect(await takeRateLimit(app.db, "b", "other", 5, 3600)).toBe(true);
  });
  it("stops counting a row older than its window", async () => {
    expect(await takeRateLimit(app.db, "old", "k", 1, 3600)).toBe(true);
    expect(await takeRateLimit(app.db, "old", "k", 1, 3600)).toBe(false);
    await t.admin`update rate_limits set window_start = window_start - interval '2 hours' where bucket = 'old'`;
    expect(await takeRateLimit(app.db, "old", "k", 1, 3600)).toBe(true);
  });
  it("gives the runtime role no direct table access", async () => {
    await expect(runtime`select * from rate_limits`).rejects.toMatchObject({ code: "42501" });
  });
});
