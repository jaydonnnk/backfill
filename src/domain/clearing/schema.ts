import { z } from "zod";
import { Cents, Covers, TermsVersion } from "@/domain/money";

// The outcome of clearing one occurrence of a rule. Schema only in S2; S3 builds the engine that
// produces it and decides whether results are stored.
export const ClearingResult = z
  .object({
    ruleId: z.uuid(),
    termsVersion: TermsVersion,
    // The occurrence's Singapore date.
    visitDate: z.iso.date(),
    unlocked: z.boolean(),
    pricePerCoverCents: Cents,
    fills: z.array(z.object({ commitmentId: z.uuid(), covers: Covers })),
  })
  .refine((r) => r.unlocked || r.fills.length === 0, { message: "a locked result must fill nothing", path: ["fills"] })
  .refine((r) => new Set(r.fills.map((f) => f.commitmentId)).size === r.fills.length, { message: "each commitment fills at most once", path: ["fills"] });
export type ClearingResult = z.infer<typeof ClearingResult>;
