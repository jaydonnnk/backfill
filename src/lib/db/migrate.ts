import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { loadLocalEnvFile, migrationEnv } from "@/env";
import { pgConnection } from "@/lib/db/client";
import { isEntrypoint } from "@/lib/entrypoint";
import { redact } from "@/lib/log";

export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../../drizzle", import.meta.url));

// Run by hand (npm run db:migrate), never in the Render build. Drizzle applies all pending
// migrations in one transaction, which Neon's transaction-mode pooler supports.
export async function runMigrations(url: string): Promise<void> {
  const connection = pgConnection(url);
  const client = postgres(connection.url, { ssl: connection.ssl, max: 1, prepare: false, onnotice: () => {} });
  try {
    await migrate(drizzle(client), {
      migrationsFolder: MIGRATIONS_FOLDER,
      migrationsSchema: "public",
      migrationsTable: "__drizzle_migrations",
    });
  } finally {
    await client.end({ timeout: 5 });
  }
}

if (isEntrypoint(import.meta.url)) {
  loadLocalEnvFile();
  runMigrations(migrationEnv().DATABASE_URL)
    .then(() => console.log("migrations applied"))
    .catch((err: unknown) => {
      console.error("migration failed:", redact(err instanceof Error ? `${err.name}: ${err.message}` : "Error"));
      process.exitCode = 1;
    });
}
