import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { tokenSha256 } from "@/lib/agents/tokens";
import { newMerchantToken } from "./links";

export type RegistrationResult =
  | { status: "created"; merchantId: string; token: string }
  | { status: "rate_limited" };

export async function registerMerchant(db: Db, name: string): Promise<RegistrationResult> {
  const token = newMerchantToken();
  const [row] = await db.execute<{ id: string | null }>(sql`select register_merchant(${name}, ${tokenSha256(token)}) as id`);
  if (!row) throw new Error("Merchant registration returned no result");
  return row.id === null ? { status: "rate_limited" } : { status: "created", merchantId: row.id, token };
}
