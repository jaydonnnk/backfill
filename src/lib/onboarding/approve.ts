import { eq } from "drizzle-orm";
import { loadLocalEnvFile, migrationEnv } from "@/env";
import { connectDb, type Executor } from "@/lib/db/client";
import { merchants } from "@/lib/db/schema";
import { isEntrypoint } from "@/lib/entrypoint";
import { redact } from "@/lib/log";

// The operator's review of website signups: npm run merchant:approve -- --list | <merchantId>.
// Runs as the owner, since the web role can only read merchants.

export async function approveMerchant(db: Executor, merchantId: string): Promise<boolean> {
  const rows = await db.update(merchants).set({ visibility: "listed" }).where(eq(merchants.id, merchantId)).returning({ id: merchants.id });
  return rows.length === 1;
}

if (isEntrypoint(import.meta.url)) {
  const [arg] = process.argv.slice(2);
  if (!arg) {
    console.error("usage: npm run merchant:approve -- --list | <merchantId>");
    process.exit(2);
  }
  loadLocalEnvFile();
  const { db, close } = connectDb(migrationEnv().DATABASE_URL, 1);
  const run = arg === "--list"
    ? db.select({ id: merchants.id, visibility: merchants.visibility, name: merchants.name }).from(merchants).then(rows => { for (const r of rows) console.log(`${r.id} ${r.visibility} ${JSON.stringify(r.name)}`); })
    : approveMerchant(db, arg).then(found => { console.log(found ? "merchant listed" : "no such merchant"); });
  run.catch((err: unknown) => {
    console.error("approve failed:", redact(err instanceof Error ? `${err.name}: ${err.message}` : "Error"));
    process.exitCode = 1;
  }).finally(close);
}
