import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { webEnv } from "@/env";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
// A query runner: the pool, or one open transaction on it.
export type Executor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

const LIBPQ_ONLY = ["sslmode", "channel_binding", "sslrootcert"];
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// postgres.js forwards unknown URL parameters as startup parameters, and its sslmode=require skips
// certificate checks. Strip the libpq-only parameters Neon's strings carry, verify TLS for every
// non-local host, and refuse any other parameter rather than send it to the server.
export function pgConnection(url: string): { url: string; ssl: false | "verify-full" } {
  const parsed = new URL(url);
  const sslmode = parsed.searchParams.get("sslmode");
  for (const name of LIBPQ_ONLY) parsed.searchParams.delete(name);
  const extra = [...parsed.searchParams.keys()];
  if (extra.length > 0) throw new Error(`Unsupported database URL parameters: ${extra.join(", ")}`);
  const local = LOCAL_HOSTS.has(parsed.hostname);
  return { url: parsed.toString(), ssl: sslmode === "disable" || (local && sslmode === null) ? false : "verify-full" };
}

// Pooled connection. Prepared statements are off because Neon's pooler runs in transaction mode.
export function connectDb(url: string, max = 5): { db: Db; close: () => Promise<void> } {
  const connection = pgConnection(url);
  const client = postgres(connection.url, { ssl: connection.ssl, max, prepare: false, idle_timeout: 20, connect_timeout: 15, onnotice: () => {} });
  return { db: drizzle(client, { schema }), close: () => client.end({ timeout: 5 }) };
}

let cached: Db | undefined;

export function webDb(): Db {
  cached ??= connectDb(webEnv().DATABASE_URL).db;
  return cached;
}
