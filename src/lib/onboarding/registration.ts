import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { tokenSha256 } from "@/lib/agents/tokens";
import { takeRateLimit } from "@/lib/rate-limit";
import { newMerchantToken } from "./links";

export type RegistrationResult =
  | { status: "created"; merchantId: string; token: string }
  | { status: "rate_limited" };

export const SIGNUP_CLIENT_HOURLY_CAP = 5;

export async function registerMerchant(db: Db, name: string, client: string | null = null): Promise<RegistrationResult> {
  if (client !== null && !(await takeRateLimit(db, "signup", client, SIGNUP_CLIENT_HOURLY_CAP, 3600))) return { status: "rate_limited" };
  const token = newMerchantToken();
  const [row] = await db.execute<{ id: string | null }>(sql`select register_merchant(${name}, ${tokenSha256(token)}) as id`);
  if (!row) throw new Error("Merchant registration returned no result");
  return row.id === null ? { status: "rate_limited" } : { status: "created", merchantId: row.id, token };
}
