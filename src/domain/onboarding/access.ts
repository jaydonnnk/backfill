import { z } from "zod";

// No line breaks or other control characters: a name reaches model prompts and buyer agents.
export const MerchantName = z.string().trim().min(1).max(120).refine(name => !/[\p{Cc}\u2028\u2029]/u.test(name));
export const MerchantToken = z.string().regex(/^bfm_[A-Za-z0-9_-]{43}$/);

export function merchantTokenFromLink(value: string, origin: string): string | null {
  try {
    const link = new URL(value.trim(), origin);
    if (link.origin !== origin || link.username || link.password || link.pathname !== "/merchant/enter" || link.search) return null;
    const parsed = MerchantToken.safeParse(link.hash.slice(1));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
