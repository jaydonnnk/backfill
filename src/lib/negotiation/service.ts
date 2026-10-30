import { and, asc, eq } from "drizzle-orm";
import { occurrenceOn } from "@/domain/commitments/occurrence";
import { signCounterOffer } from "@/domain/negotiation/counter-offer";
import { MAX_ROUNDS, maxConcessionCents, type RoundContext, type RoundStatus, settleRound, startRound } from "@/domain/negotiation/rules";
import { offerPriceCents } from "@/domain/offers/evaluate";
import { available, type Clock, constraintOf, deadlineOf, toRule } from "@/lib/commitments/service";
import type { Db } from "@/lib/db/client";
import { commitments, merchants, negotiationRounds, negotiations, rules } from "@/lib/db/schema";
import type { ProposeCounter } from "./merchant-agent";

// A buyer agent's negotiation over the price per cover of a commitment it has not made yet. Each
// call is one round: the buyer bids, the merchant's model proposes, the domain decides what counts,
// and the round is stored before a signed counter-offer is returned. Nothing returned carries the
// floor, and no refusal compares the floor with a price: a proposal below the floor holds like any
// other hold.

export type NegotiateInput = { ruleId: string; termsVersion: number; visitDate: string; covers: number; bidCents: number };

export type NegotiateRefusal =
  | "offer_unavailable"
  | "stale_terms"
  | "not_on_offer_weekday"
  | "past_deadline"
  | "over_agent_cap"
  | "round_limit"
  | "negotiation_mismatch"
  | "negotiation_closed"
  | "negotiation_used"
  | "negotiation_busy";

export type NegotiationView = {
  negotiationId: string;
  round: number;
  roundsLeft: number;
  status: Exclude<RoundStatus, "closed">;
  offerPriceCents: number;
  merchantPriceCents: number;
  visitDate: string;
  covers: number;
  commitBy: string;
  // Pass to submit_commitment to commit at merchantPriceCents.
  counterOffer: string;
};

export type NegotiateResult = { ok: true; negotiation: NegotiationView } | { ok: false; reason: NegotiateRefusal };

export type NegotiationDeps = { secret: string; propose: ProposeCounter; clock?: Clock };

class Refused extends Error {
  constructor(readonly reason: NegotiateRefusal) {
    super(reason);
  }
}

// One round. The model is asked outside any transaction, since a call can take seconds; the round is
// then stored under its primary key, so of two simultaneous bids for one round only the first counts
// and the other is answered negotiation_busy.
export async function negotiate(db: Db, deps: NegotiationDeps, agentId: string, input: NegotiateInput): Promise<NegotiateResult> {
  const now = (deps.clock ?? (() => new Date()))();
  try {
    const [row] = await db.select({ rule: rules, merchantName: merchants.name }).from(rules).innerJoin(merchants, eq(rules.merchantId, merchants.id)).where(eq(rules.id, input.ruleId));
    const rule = row && toRule(row.rule);
    if (!row || !rule || !available(rule)) throw new Refused("offer_unavailable");
    if (input.termsVersion !== rule.termsVersion) throw new Refused("stale_terms");
    const occurrence = occurrenceOn(rule.terms.window, input.visitDate);
    if (!occurrence) throw new Refused("not_on_offer_weekday");
    if (now >= deadlineOf(rule, input.visitDate)) throw new Refused("past_deadline");
    if (input.covers > rule.terms.perAgentCapCovers) throw new Refused("over_agent_cap");

    const [existing] = await db
      .select()
      .from(negotiations)
      .where(and(eq(negotiations.agentId, agentId), eq(negotiations.ruleId, rule.id), eq(negotiations.visitDate, input.visitDate)));
    if (existing && existing.covers !== input.covers) throw new Refused("negotiation_mismatch");
    // A negotiation is bound to the terms it started under; after a terms change it cannot go on.
    if (existing && existing.termsVersion !== rule.termsVersion) throw new Refused("negotiation_closed");
    if (existing) {
      const [used] = await db.select({ id: commitments.id }).from(commitments).where(eq(commitments.negotiationId, existing.id));
      if (used) throw new Refused("negotiation_used");
    }
    const rounds = existing ? await db.select().from(negotiationRounds).where(eq(negotiationRounds.negotiationId, existing.id)).orderBy(asc(negotiationRounds.round)) : [];
    const last = rounds.at(-1);
    const ctx: RoundContext = { rule, round: rounds.length + 1, previousPriceCents: last?.counterCents ?? offerPriceCents(rule), bidCents: input.bidCents };

    const start = startRound(ctx);
    if (!start.ok) throw new Refused(start.reason);
    const proposed = start.needsProposal
      ? await deps.propose({
          merchantName: row.merchantName,
          listPriceCents: rule.listPriceCents,
          offerPriceCents: offerPriceCents(rule),
          previousPriceCents: ctx.previousPriceCents,
          bidCents: ctx.bidCents,
          covers: input.covers,
          round: ctx.round,
          maxRounds: MAX_ROUNDS,
          maxConcessionCents: maxConcessionCents(rule),
        })
      : null;
    const outcome = settleRound(ctx, proposed);
    if (outcome.status === "closed" || outcome.counterCents === undefined) throw new Refused("negotiation_closed");
    const { status, counterCents } = outcome;

    const negotiationId = await db.transaction(async (tx) => {
      let id = existing?.id;
      if (!id) {
        const [created] = await tx
          .insert(negotiations)
          .values({ agentId, ruleId: rule.id, termsVersion: rule.termsVersion, visitDate: input.visitDate, covers: input.covers })
          .onConflictDoNothing()
          .returning({ id: negotiations.id });
        // Another request started this negotiation first; this round is then a duplicate of its round 1.
        if (!created) throw new Refused("negotiation_busy");
        id = created.id;
      }
      await tx.insert(negotiationRounds).values({
        negotiationId: id,
        round: ctx.round,
        bidCents: input.bidCents,
        proposedCents: outcome.proposal?.cents ?? null,
        proposalVerdict: outcome.proposal ? (outcome.proposal.verdict.ok ? "ok" : outcome.proposal.verdict.reason) : null,
        status,
        counterCents,
      });
      return id;
    });

    const counterOffer = signCounterOffer(deps.secret, {
      v: 1,
      negotiationId,
      round: ctx.round,
      agentId,
      ruleId: rule.id,
      termsVersion: rule.termsVersion,
      visitDate: input.visitDate,
      covers: input.covers,
      priceCents: counterCents,
    });
    return {
      ok: true,
      negotiation: {
        negotiationId,
        round: ctx.round,
        roundsLeft: MAX_ROUNDS - ctx.round,
        status,
        offerPriceCents: offerPriceCents(rule),
        merchantPriceCents: counterCents,
        visitDate: input.visitDate,
        covers: input.covers,
        commitBy: occurrence.commitBy.toISOString(),
        counterOffer,
      },
    };
  } catch (err) {
    if (err instanceof Refused) return { ok: false, reason: err.reason };
    if (constraintOf(err) === "negotiation_rounds_pkey" || constraintOf(err) === "negotiation_rounds_in_order") return { ok: false, reason: "negotiation_busy" };
    throw err;
  }
}
