import { z } from "zod";
import { Cents, Covers, TermsVersion } from "@/domain/money";

// An agent's binding, conditional promise to buy covers on one occurrence of a rule's window, at no
// more than its max price per cover, under the terms version it accepted.
export const Commitment = z.object({
  id: z.uuid(),
  ruleId: z.uuid(),
  agentId: z.string().min(1).max(200),
  termsVersion: TermsVersion,
  covers: Covers,
  maxPricePerCoverCents: Cents,
  // The price per cover a signed counter-offer agreed (S5); absent means the offer price.
  negotiatedPriceCents: Cents.optional(),
  // When the buyer means to come; it picks the occurrence of the weekly window.
  visitAt: z.date(),
  // When the commitment was made, stamped by the server.
  committedAt: z.date(),
});
export type Commitment = z.infer<typeof Commitment>;
