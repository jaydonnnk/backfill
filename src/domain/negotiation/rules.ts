import { BASIS_POINTS } from "@/domain/money";
import { meetsFloor, offerPriceCents } from "@/domain/offers/evaluate";
import type { MerchantRule } from "@/domain/offers/schema";

// A buyer agent haggles over the price per cover of one commitment, before it submits. The merchant
// side is a model (Muse Spark); every price it proposes is checked here against the merchant's hidden
// floor and the round's bounds before it counts. A proposal that fails is never signed and the
// merchant holds at its previous price, with the same outcome as a hold the model chose, so a buyer
// cannot tell a floor from a stubborn merchant.

// A negotiation has at most this many rounds; a bid after the last is refused.
export const MAX_ROUNDS = 3;

// The most the merchant concedes in one round, in basis points of the list price. Small steps keep
// three rounds from walking a buyer down to the floor, and each round's bound is public, so a hold is
// never a sign that the floor was reached.
export const MAX_CONCESSION_BPS = 250;

// The concession bound in cents, rounded down so it never exceeds the published basis points.
export function maxConcessionCents(rule: MerchantRule): number {
  return Math.floor((rule.listPriceCents * MAX_CONCESSION_BPS) / BASIS_POINTS);
}

export type RoundContext = {
  rule: MerchantRule;
  // 1 for the first bid.
  round: number;
  // The merchant's price before this round: the offer price in round 1, then its last counter.
  previousPriceCents: number;
  bidCents: number;
};

// Why a model's proposal does not count. Internal only: never shown to a buyer, since below_floor
// would compare the floor with a price.
export type ProposalRejection = "rises" | "concedes_too_much" | "below_bid" | "below_floor";

export type ProposalVerdict = { ok: true } | { ok: false; reason: ProposalRejection };

// Checks one proposed price per cover against both sides' limits: never above the merchant's
// previous price (so never above the offer price), never more than one concession step below it,
// never below the buyer's bid, and never below the hidden floor.
export function judgeProposal(ctx: RoundContext, proposedCents: number): ProposalVerdict {
  if (proposedCents > ctx.previousPriceCents) return { ok: false, reason: "rises" };
  if (proposedCents < ctx.previousPriceCents - maxConcessionCents(ctx.rule)) return { ok: false, reason: "concedes_too_much" };
  if (proposedCents < ctx.bidCents) return { ok: false, reason: "below_bid" };
  if (!meetsFloor(ctx.rule.terms, proposedCents)) return { ok: false, reason: "below_floor" };
  return { ok: true };
}

// accepted: the merchant's price meets the bid. countered: it came down but not to the bid. held: it
// stayed where it was. closed: the merchant's previous price is now below its floor (the floor was
// raised mid-negotiation), so no counter can be signed.
export type RoundStatus = "accepted" | "countered" | "held" | "closed";

export type RoundOutcome = {
  status: RoundStatus;
  // The merchant's price after this round; absent when closed.
  counterCents?: number;
  // What the model proposed and whether it counted; absent when no proposal was needed.
  proposal?: { cents: number; verdict: ProposalVerdict };
};

export type RoundStart = { ok: true; needsProposal: boolean } | { ok: false; reason: "round_limit" };

// Whether a round may start and whether it needs the model: a bid at or above the merchant's price
// is accepted at that price without asking.
export function startRound(ctx: RoundContext): RoundStart {
  if (ctx.round > MAX_ROUNDS) return { ok: false, reason: "round_limit" };
  return { ok: true, needsProposal: ctx.bidCents < ctx.previousPriceCents };
}

// One round's outcome from the model's proposal, or from null when the model gave none (it failed,
// or the round needs no proposal). Every counter returned is at or above the floor, at or below the
// previous price and so at or below the offer price.
export function settleRound(ctx: RoundContext, proposedCents: number | null): RoundOutcome {
  const start = startRound(ctx);
  if (!start.ok) throw new Error("round past the limit");
  if (!meetsFloor(ctx.rule.terms, ctx.previousPriceCents) || ctx.previousPriceCents > offerPriceCents(ctx.rule)) return { status: "closed" };
  if (!start.needsProposal) return { status: "accepted", counterCents: ctx.previousPriceCents };
  if (proposedCents === null) return { status: "held", counterCents: ctx.previousPriceCents };
  const verdict = judgeProposal(ctx, proposedCents);
  const proposal = { cents: proposedCents, verdict };
  if (!verdict.ok) return { status: "held", counterCents: ctx.previousPriceCents, proposal };
  const status: RoundStatus = proposedCents === ctx.bidCents ? "accepted" : proposedCents < ctx.previousPriceCents ? "countered" : "held";
  return { status, counterCents: proposedCents, proposal };
}
