import { cookies } from "next/headers";
import { webDb } from "@/lib/db/client";
import { authenticateMerchant, MERCHANT_COOKIE, type MerchantIdentity } from "@/lib/onboarding/links";

// The merchant whose secret link set the cookie, or null.
export async function currentMerchant(): Promise<MerchantIdentity | null> {
  return authenticateMerchant(webDb(), (await cookies()).get(MERCHANT_COOKIE)?.value);
}

export async function setMerchantSession(token: string): Promise<void> {
  (await cookies()).set(MERCHANT_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: "/merchant", maxAge: 30 * 24 * 60 * 60,
  });
}
