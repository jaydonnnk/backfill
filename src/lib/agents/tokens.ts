import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { Executor } from "@/lib/db/client";
import { agents } from "@/lib/db/schema";

// A buyer agent's bearer token: a fixed prefix, so a leaked one is recognisable, and 32 random
// bytes. Only its SHA-256 is stored; the token itself is shown once, when it is minted.
const TOKEN_PREFIX = "bfa_";

export function tokenSha256(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function mintAgent(db: Executor, id: string, label: string): Promise<{ id: string; token: string }> {
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  await db.insert(agents).values({ id, label, tokenSha256: tokenSha256(token) });
  return { id, token };
}

// The agent id behind an Authorization header, or null for a missing, malformed, unknown or revoked
// token. The scheme is case-insensitive (RFC 9110). The token is looked up by its hash, so it never
// reaches the database or a log.
export async function authenticateAgent(db: Executor, authorization: string | null): Promise<string | null> {
  const token = /^Bearer (\S+)$/i.exec(authorization ?? "")?.[1];
  if (token === undefined) return null;
  const [row] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.tokenSha256, tokenSha256(token)), isNull(agents.revokedAt)));
  return row?.id ?? null;
}
