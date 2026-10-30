import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { Cents, Covers, TermsVersion } from "@/domain/money";
import { MAX_ROUNDS } from "./rules";

// A merchant counter-offer a buyer agent can commit at, signed with HMAC-SHA256 so the agent cannot
// change the price or anything else it names. The token carries nothing private: no floor, no
// capacity. It is checked against the stored round as well, so the signature proves integrity and
// the database proves it is the negotiation's latest round.

export const CounterOffer = z.strictObject({
  v: z.literal(1),
  negotiationId: z.uuid(),
  round: z.int().min(1).max(MAX_ROUNDS),
  agentId: z.string().min(1).max(200),
  ruleId: z.uuid(),
  termsVersion: TermsVersion,
  visitDate: z.iso.date(),
  covers: Covers,
  priceCents: Cents,
});
export type CounterOffer = z.infer<typeof CounterOffer>;

export const MIN_SECRET_LENGTH = 32;

function mac(secret: string, payload: string): Buffer {
  if (secret.length < MIN_SECRET_LENGTH) throw new Error("negotiation signing secret is too short");
  return createHmac("sha256", secret).update(payload).digest();
}

// payload.signature, both base64url. The payload is the offer's JSON, parsed first so no extra field
// is ever signed.
export function signCounterOffer(secret: string, offer: CounterOffer): string {
  const payload = Buffer.from(JSON.stringify(CounterOffer.parse(offer))).toString("base64url");
  return `${payload}.${mac(secret, payload).toString("base64url")}`;
}

// The offer a token names, or null for any token not signed with this secret or not a valid offer.
export function verifyCounterOffer(secret: string, token: string): CounterOffer | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts as [string, string];
  const expected = mac(secret, payload);
  const given = Buffer.from(signature, "base64url");
  // Buffer skips characters that are not base64url, so a re-encoding must give the signature back.
  if (given.toString("base64url") !== signature) return null;
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const parsed = CounterOffer.safeParse(json);
  return parsed.success ? parsed.data : null;
}
