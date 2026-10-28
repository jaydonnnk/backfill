import { z } from "zod";
import { Cents, Covers } from "@/domain/money";

// One cleared commitment's savings and how they split between buyer, agent and network. The split
// rule itself is S8's; this schema only holds the arithmetic every entry must satisfy. The list price
// and savings need no sign check of their own: the shares are non-negative and add up to the
// savings, and the savings are covers times (list minus a non-negative price), so a price above the
// list price is refused too.
export const LedgerEntry = z
  .object({
    commitmentId: z.uuid(),
    merchantId: z.uuid(),
    ruleId: z.uuid(),
    covers: Covers,
    listPriceCents: z.int(),
    pricePerCoverCents: Cents,
    savingsCents: z.int(),
    buyerShareCents: Cents,
    agentShareCents: Cents,
    networkShareCents: Cents,
  })
  .refine((e) => e.savingsCents === e.covers * (e.listPriceCents - e.pricePerCoverCents), { message: "savings must be covers times the discount per cover", path: ["savingsCents"] })
  .refine((e) => e.buyerShareCents + e.agentShareCents + e.networkShareCents === e.savingsCents, { message: "the shares must add up to the savings", path: ["buyerShareCents"] });
export type LedgerEntry = z.infer<typeof LedgerEntry>;
