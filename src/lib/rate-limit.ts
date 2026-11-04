import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Executor } from "@/lib/db/client";

// A fixed-window counter in Postgres, shared by every app instance. A client is known only by a
// hash of its address, and only for two days.

export async function takeRateLimit(db: Executor, bucket: string, key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const [row] = await db.execute<{ allowed: boolean }>(sql`select take_rate_limit(${bucket}, ${key}, ${limit}::integer, ${windowSeconds}::integer) as allowed`);
  return row?.allowed === true;
}

// The hashed client address, or null when the proxy gave none. Null means "skip the per-client
// check": lumping unknown clients together would let one of them lock out every other.
export function clientKey(headers: Headers): string | null {
  const address = headers.get("cf-connecting-ip")?.trim() || headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return address ? createHash("sha256").update(address, "utf8").digest("hex") : null;
}

// One global limit and, when the client is known, one per-client limit. The client's is taken
// first, so one client hammering a full bucket does not also spend the global allowance.
export async function takeLimits(db: Executor, bucket: string, client: string | null, perClient: number, global: number, windowSeconds: number): Promise<boolean> {
  if (client !== null && !(await takeRateLimit(db, bucket, client, perClient, windowSeconds))) return false;
  return takeRateLimit(db, `${bucket}:all`, "all", global, windowSeconds);
}
