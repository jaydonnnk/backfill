import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { tokenSha256 } from "@/lib/agents/tokens";
import type { Executor } from "@/lib/db/client";
import { merchants } from "@/lib/db/schema";
import { MerchantToken } from "@/domain/onboarding/access";

// A merchant's secret link token: a fixed prefix, so a leaked one is recognisable, and 32 random
// bytes. Only its SHA-256 is stored, and minting a new one replaces the old.
export function newMerchantToken(): string {
  return "bfm_" + randomBytes(32).toString("base64url");
}

// The cookie that holds the token once the link is opened, scoped to the merchant pages.
export const MERCHANT_COOKIE = "backfill_merchant";

export type MerchantIdentity = { id: string; name: string };

// Creates the merchant and its link token. The token is returned once and never stored.
export async function mintMerchant(db: Executor, name: string): Promise<{ id: string; token: string }> {
  const token = newMerchantToken();
  const [row] = await db.insert(merchants).values({ name, linkTokenSha256: tokenSha256(token) }).returning({ id: merchants.id });
  if (!row) throw new Error("merchant insert returned no row");
  return { id: row.id, token };
}

// The merchant behind a link token, or null for a missing, malformed or unknown one. The token is
// looked up by its hash, so it never reaches the database or a log.
export async function authenticateMerchant(db: Executor, token: string | undefined): Promise<MerchantIdentity | null> {
  if (!MerchantToken.safeParse(token).success || token === undefined) return null;
  const [row] = await db.select({ id: merchants.id, name: merchants.name }).from(merchants).where(eq(merchants.linkTokenSha256, tokenSha256(token)));
  return row ?? null;
}
