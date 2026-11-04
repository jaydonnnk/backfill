import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { testEnv } from "@/env";
import { connectDb, type Db } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";

// Each test file gets its own disposable database on the local PostgreSQL (or the CI service
// container), migrated with the real migrations. Never Neon.

export type TestDatabase = {
  db: Db;
  // The disposable database's own URL, for tests that need their own pool.
  url: string;
  admin: postgres.Sql;
  drop: () => Promise<void>;
};

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

export async function createTestDatabase(label: string): Promise<TestDatabase> {
  const configured = new URL(process.env.TEST_DATABASE_URL ?? 'http://missing.invalid');
  if (/neon\.tech/i.test(configured.hostname)) throw new Error("TEST_DATABASE_URL must not point at Neon");
  if (!/^postgres(ql)?:$/.test(configured.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(configured.hostname)) throw new Error('Explicit local TEST_DATABASE_URL required; env-file fallback is disabled');
  const baseUrl = testEnv().TEST_DATABASE_URL;
  const name = `backfill_t_${label}_${randomBytes(4).toString("hex")}`;

  const root = postgres(baseUrl, { max: 1, onnotice: () => {} });
  try {
    await root.unsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await root.end({ timeout: 5 });
  }

  const url = withDatabase(baseUrl, name);
  try {
    await runMigrations(url);
  } catch (error) {
    const cleanup = postgres(baseUrl, { max: 1, onnotice: () => {} });
    try { await cleanup.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`); }
    finally { await cleanup.end({ timeout: 5 }); }
    throw error;
  }
  const admin = postgres(url, { max: 1, onnotice: () => {} });
  const app = connectDb(url, 2);

  return {
    db: app.db,
    url,
    admin,
    drop: async () => {
      await app.close();
      await admin.end({ timeout: 5 });
      const cleanup = postgres(baseUrl, { max: 1, onnotice: () => {} });
      try {
        await cleanup.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      } finally {
        await cleanup.end({ timeout: 5 });
      }
    },
  };
}
