import { z } from "zod";
import { BASIS_POINTS, Cents, Covers, TermsVersion } from "@/domain/money";
import { MINUTES_PER_DAY } from "@/domain/singapore-time";

// One weekly off-peak slot in Singapore time, such as Tuesday 14:00 to 17:00 with commitments due
// by 12:00. Start is inclusive and end exclusive; the deadline is exclusive too. Overnight windows
// are refused: off-peak food and drink slots end the day they start.
export const Window = z
  .object({
    // ISO weekday: 1 is Monday, 7 is Sunday.
    weekday: z.int().min(1).max(7),
    // The two refinements below bound the start: 0 <= commitByMinute <= startMinute < endMinute.
    startMinute: z.int(),
    // 1440 means the window runs to midnight.
    endMinute: z.int().max(MINUTES_PER_DAY),
    commitByMinute: z.int().min(0),
  })
  .refine((w) => w.startMinute < w.endMinute, { message: "the window must end after it starts", path: ["endMinute"] })
  .refine((w) => w.commitByMinute <= w.startMinute, { message: "the commit deadline must not be after the window starts", path: ["commitByMinute"] });
export type Window = z.infer<typeof Window>;

export const DiscountBps = z.int().min(1).max(BASIS_POINTS - 1);

// The terms an agent must accept before a commitment counts (path B). The floor is the lowest
// price per cover the merchant will take; it is private and never leaves the domain in a
// buyer-facing shape (see Offer).
export const AgentTerms = z.object({
  window: Window,
  discountBps: DiscountBps,
  // Covers the pool must reach before anyone gets the discount.
  minPoolCovers: Covers,
  // The most covers one agent may hold on one rule.
  perAgentCapCovers: Covers,
  floorPriceCents: Cents,
});
export type AgentTerms = z.infer<typeof AgentTerms>;

// A merchant's rule: the list price, the capacity for the slot, and the agent terms. termsVersion
// starts at 1 and goes up on every change to the public terms; a commitment names the version it
// accepted.
export const MerchantRule = z
  .object({
    id: z.uuid(),
    merchantId: z.uuid(),
    termsVersion: TermsVersion,
    listPriceCents: Cents,
    capacityCovers: Covers,
    terms: AgentTerms,
  })
  .refine((r) => r.terms.floorPriceCents <= r.listPriceCents, { message: "the floor must not be above the list price", path: ["terms", "floorPriceCents"] });
export type MerchantRule = z.infer<typeof MerchantRule>;

// The public view of a rule, the only shape a buyer or agent sees. It has no floor and no capacity,
// and it is strict so a floor added to it fails to parse.
export const Offer = z.strictObject({
  ruleId: z.uuid(),
  merchantId: z.uuid(),
  termsVersion: TermsVersion,
  listPriceCents: Cents,
  offerPriceCents: Cents,
  discountBps: DiscountBps,
  window: Window,
  minPoolCovers: Covers,
  perAgentCapCovers: Covers,
});
export type Offer = z.infer<typeof Offer>;
