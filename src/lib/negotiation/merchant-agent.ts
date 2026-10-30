import { z } from "zod";
import { LlmError, type LLMProvider } from "@/integrations/meta/provider";
import { errorFields, log } from "@/lib/log";

// The merchant side of a negotiation: Muse Spark proposes a price per cover. It is told the public
// numbers and the round's bounds, never the hidden floor, so nothing it writes can reveal the floor.
// What it proposes counts only after the domain checks it (src/domain/negotiation/rules.ts); its
// rationale is logged with the call and never sent to a buyer.

export const NEGOTIATION_PURPOSE = "negotiation";

export type ProposalInput = {
  merchantName: string;
  listPriceCents: number;
  offerPriceCents: number;
  previousPriceCents: number;
  bidCents: number;
  covers: number;
  round: number;
  maxRounds: number;
  maxConcessionCents: number;
};

// A price per cover in cents, or null when the model gave none (it failed after its retries).
export type ProposeCounter = (input: ProposalInput) => Promise<number | null>;

export const MerchantProposal = z.strictObject({
  priceCents: z.int().describe("Your price per cover in SGD cents for this round."),
  rationale: z.string().max(300).describe("One short sentence on why, for the merchant's log."),
});

const dollars = (cents: number) => `S$${(cents / 100).toFixed(2)}`;

export function proposalPrompt(input: ProposalInput): string {
  return [
    `You price off-peak covers for ${input.merchantName}, a Singapore food and drink merchant.`,
    `List price ${dollars(input.listPriceCents)} (${input.listPriceCents} cents); published agent offer ${dollars(input.offerPriceCents)} (${input.offerPriceCents} cents).`,
    `A buyer agent wants ${input.covers} cover(s) and bids ${input.bidCents} cents per cover. Your current price is ${input.previousPriceCents} cents.`,
    `This is round ${input.round} of at most ${input.maxRounds}.`,
    `Propose your price per cover in cents: not above ${input.previousPriceCents}, not below ${input.previousPriceCents - input.maxConcessionCents}, and not below the bid.`,
    "Holding at your current price is allowed. Concede slowly: an empty off-peak seat earns nothing, but every cent conceded is margin lost.",
  ].join("\n");
}

export function sparkMerchant(provider: LLMProvider, model: string): ProposeCounter {
  return async (input) => {
    try {
      const result = await provider.generate({
        model,
        purpose: NEGOTIATION_PURPOSE,
        system: "You are the pricing agent of a small Singapore food and drink merchant on Backfill. Reply only with JSON matching the schema.",
        prompt: proposalPrompt(input),
        schemaName: "MerchantProposal",
        schema: MerchantProposal,
        maxCompletionTokens: 1024,
        reasoningEffort: "low",
      });
      log("info", "negotiation.proposal", {
        attempts: result.attempts,
        costNanoUsd: result.costNanoUsd,
        latencyMs: result.latencyMs,
        priceCents: result.value.priceCents,
        rationale: result.value.rationale,
      });
      return result.value.priceCents;
    } catch (err) {
      log("error", "negotiation.proposal_failed", err instanceof LlmError ? { name: err.name, message: err.message, attempts: err.attempts } : errorFields(err));
      return null;
    }
  };
}
