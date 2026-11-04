import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../support/db";
import { connectDb } from "@/lib/db/client";
import { registerMerchant } from "@/lib/onboarding/registration";
import { authenticateMerchant, mintMerchant } from "@/lib/onboarding/links";

let t: TestDatabase;
let app: ReturnType<typeof connectDb>;
let runtime: postgres.Sql;
const role = `ma_${randomBytes(6).toString("hex")}`;

beforeAll(async () => {
  t = await createTestDatabase("merchant_access");
  await t.admin.unsafe(`CREATE ROLE ${role} LOGIN IN ROLE backfill_app`);
  const url = new URL(t.url);
  url.username = role;
  app = connectDb(url.toString(), 3);
  runtime = postgres(url.toString(), { max: 3, onnotice: () => {} });
});
beforeEach(async () => { await t.admin`delete from merchants`; });
afterAll(async () => {
  await runtime?.end({ timeout: 5 });
  await app?.close();
  await t?.drop();
  const root = postgres(process.env.TEST_DATABASE_URL ?? "", { max: 1 });
  try { await root.unsafe(`DROP ROLE IF EXISTS ${role}`); }
  finally { await root.end({ timeout: 5 }); }
});

describe("website merchant registration", () => {
  it("creates a usable hashed-token account through the restricted role", async () => {
    const result = await registerMerchant(app.db, "Kopi Corner");
    expect(result.status).toBe("created");
    if (result.status !== "created") throw new Error("Registration refused");
    expect(await authenticateMerchant(app.db, result.token)).toEqual({ id: result.merchantId, name: "Kopi Corner" });
    const [stored] = await t.admin`select link_token_sha256 from merchants where id=${result.merchantId}`;
    expect(stored?.link_token_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(stored?.link_token_sha256 === result.token).toBe(false);
    for (const privilege of ["INSERT", "UPDATE", "DELETE"]) {
      const [row] = await t.admin`select has_table_privilege('backfill_app', 'merchants', ${privilege}) as allowed`;
      expect(row?.allowed).toBe(false);
    }
    const [permission] = await t.admin`select has_function_privilege('public', 'register_merchant(text,text)', 'EXECUTE') as allowed`;
    expect(permission?.allowed).toBe(false);
    await expect(runtime`insert into merchants(name) values ('Forbidden')`).rejects.toMatchObject({ code: "42501" });
  });
  it.each([["", "a".repeat(64)], ["   ", "a".repeat(64)], ["x".repeat(121), "a".repeat(64)], ["Cafe", "bad"], [null, "a".repeat(64)], ["Cafe", null]])("rejects invalid SQL registration inputs", async (name, hash) => {
    await expect(runtime`select register_merchant(${name}, ${hash})`).rejects.toMatchObject({ code: "23514" });
    expect(await t.admin`select id from merchants`).toHaveLength(0);
  });
  it("keeps same-name workspaces and old CLI links separate", async () => {
    const old = await mintMerchant(t.db, "Same Cafe");
    const added = await registerMerchant(app.db, "Same Cafe");
    if (added.status !== "created") throw new Error("Registration refused");
    expect(added.merchantId === old.id).toBe(false);
    expect(added.token === old.token).toBe(false);
    expect((await authenticateMerchant(app.db, old.token))?.id).toBe(old.id);
    expect((await authenticateMerchant(app.db, added.token))?.id).toBe(added.merchantId);
  });
  it("admits only one concurrent signup when 99 recent merchants exist", async () => {
    await t.admin`insert into merchants(name) select 'Recent' from generate_series(1,99)`;
    const results = await Promise.all([registerMerchant(app.db, "Last slot A"), registerMerchant(app.db, "Last slot B")]);
    expect(results.map(r => r.status).sort()).toEqual(["created", "rate_limited"]);
    const [row] = await t.admin`select count(*)::int as count from merchants`;
    expect(row?.count).toBe(100);
  });
  it("does not count old merchants or create offers and model calls", async () => {
    await t.admin`insert into merchants(name,created_at) select 'Old', now()-interval '2 hours' from generate_series(1,100)`;
    expect((await registerMerchant(app.db, "New cafe")).status).toBe("created");
    for (const table of ["rules", "commitments", "llm_calls"]) {
      expect(await t.admin.unsafe(`select * from ${table}`)).toHaveLength(0);
    }
  });
});
