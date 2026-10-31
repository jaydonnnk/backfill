import { z } from "zod";
import type { LLMProvider } from "@/integrations/meta/provider";
import { redact } from "@/lib/log";
import type { BuyerIntent } from "./intents";

// One Muse Spark buyer agent's decision on one offer: how many covers to commit, none when the
// offer does not fit its intent. The model sees only what the MCP server showed the buyer.
export const BUYER_PURPOSE = "sim_buyer";

export const BuyerDecision = z.strictObject({
  covers: z.int().min(0).describe("Covers to commit for this visit: 0 if the offer does not fit the intent, otherwise how many people the intent names."),
  reason: z.string().min(1).max(200).describe("One short sentence on why."),
});
export type BuyerDecision = z.infer<typeof BuyerDecision>;

// What the buyer saw: the MCP server's own words, plus what one cover is, which the scene states
// since an offer carries no menu.
export type OfferSeen = { merchantName: string; about: string; summary: string; visitDate: string; commitBy: string; startsAt: string; endsAt: string; perAgentCapCovers: number };

export type BuyerRequest = { system: string; prompt: string };

export const BUYER_SYSTEM =
  "You are a buyer agent for one person in Singapore. You commit to a pooled off-peak offer only when it fits the person's intent. A commitment is binding from its deadline on. Reply only with JSON matching the schema.";

export function buyerRequest(buyer: BuyerIntent, offer: OfferSeen): BuyerRequest {
  const at = (iso: string) => new Date(iso).toLocaleString("en-SG", { timeZone: "Asia/Singapore", dateStyle: "medium", timeStyle: "short" });
  return {
    system: BUYER_SYSTEM,
    prompt: [
      `The person you act for wants: ${buyer.intent}.`,
      `Offer from ${offer.merchantName}: ${offer.summary}`,
      `One cover is ${offer.about}.`,
      `Next visit: ${at(offer.startsAt)} to ${at(offer.endsAt)}, commit by ${at(offer.commitBy)} (Singapore time).`,
      `You may commit at most ${offer.perAgentCapCovers} covers. Decide how many covers to commit, or 0 if the offer does not fit.`,
    ].join("\n"),
  };
}

// error is the failure's name and first line, never a key or a prompt.
export type Decided = { request: BuyerRequest; reply: BuyerDecision | null; error: string | null; costNanoUsd: number };

export type DecideBuyer = (buyer: BuyerIntent, offer: OfferSeen) => Promise<Decided>;

// A failed or invalid model call is a buyer that does not commit, recorded with a null reply.
export function sparkBuyer(provider: LLMProvider, model: string): DecideBuyer {
  return async (buyer, offer) => {
    const request = buyerRequest(buyer, offer);
    try {
      const result = await provider.generate({ model, purpose: BUYER_PURPOSE, ...request, schemaName: "BuyerDecision", schema: BuyerDecision, maxCompletionTokens: 2048, reasoningEffort: "low" });
      return { request, reply: result.value, error: null, costNanoUsd: result.costNanoUsd };
    } catch (err) {
      const error = err instanceof Error ? `${err.name}: ${err.message.split("\n")[0]}`.slice(0, 300) : "Error";
      return { request, reply: null, error: redact(error), costNanoUsd: 0 };
    }
  };
}
