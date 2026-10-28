import type { Commitment } from "@/domain/commitments/schema";
import { BASIS_POINTS } from "@/domain/money";
import { singaporeLocal } from "@/domain/singapore-time";
import type { AgentTerms, MerchantRule, Offer, Window } from "./schema";

export type Refusal = "stale_terms" | "outside_window" | "past_deadline" | "over_agent_cap" | "below_floor";

export type CommitmentVerdict = { ok: true } | { ok: false; reason: Refusal };

// The discounted price per cover. The discount rounds down to a whole cent, so any fraction stays
// with the merchant.
export function offerPriceCents(rule: MerchantRule): number {
  return rule.listPriceCents - Math.floor((rule.listPriceCents * rule.terms.discountBps) / BASIS_POINTS);
}

// True when a price per cover is at or above the merchant's hidden floor.
export function meetsFloor(terms: AgentTerms, priceCents: number): boolean {
  return priceCents >= terms.floorPriceCents;
}

// True when the instant falls inside the weekly window, in Singapore time.
export function inWindow(window: Window, instant: Date): boolean {
  const local = singaporeLocal(instant);
  return local.weekday === window.weekday && local.minute >= window.startMinute && local.minute < window.endMinute;
}

// True when the commitment was made before the deadline on its visit's Singapore day.
function beforeDeadline(window: Window, visitAt: Date, committedAt: Date): boolean {
  const visit = singaporeLocal(visitAt);
  const made = singaporeLocal(committedAt);
  return made.date < visit.date || (made.date === visit.date && made.minute < window.commitByMinute);
}

// Checks one commitment against the rule's current terms. agentCoversHeld is what the same agent
// already holds on this rule, so the per-agent cap spans all of its commitments.
export function evaluateCommitment(rule: MerchantRule, commitment: Commitment, agentCoversHeld: number): CommitmentVerdict {
  if (commitment.ruleId !== rule.id) throw new Error("commitment is for another rule");
  if (commitment.termsVersion !== rule.termsVersion) return { ok: false, reason: "stale_terms" };
  if (!inWindow(rule.terms.window, commitment.visitAt)) return { ok: false, reason: "outside_window" };
  if (!beforeDeadline(rule.terms.window, commitment.visitAt, commitment.committedAt)) return { ok: false, reason: "past_deadline" };
  if (agentCoversHeld + commitment.covers > rule.terms.perAgentCapCovers) return { ok: false, reason: "over_agent_cap" };
  if (!meetsFloor(rule.terms, offerPriceCents(rule))) return { ok: false, reason: "below_floor" };
  return { ok: true };
}

export type PoolEvaluation = {
  accepted: Commitment[];
  refused: { commitmentId: string; reason: Refusal }[];
  totalCovers: number;
  // True once accepted covers reach the rule's minimum pool.
  unlocked: boolean;
};

// Evaluates one occurrence's commitments in arrival order, counting each agent's accepted covers
// toward its cap, and reports whether the accepted covers reach the minimum pool. visitDate is the
// occurrence's Singapore date; pooling across occurrences is a caller error. Capacity and partial
// fills are clearing's job (S3).
export function evaluatePool(rule: MerchantRule, visitDate: string, commitments: readonly Commitment[]): PoolEvaluation {
  const held = new Map<string, number>();
  const accepted: Commitment[] = [];
  const refused: PoolEvaluation["refused"] = [];
  for (const commitment of commitments) {
    if (singaporeLocal(commitment.visitAt).date !== visitDate) throw new Error("commitment is for another occurrence");
    const verdict = evaluateCommitment(rule, commitment, held.get(commitment.agentId) ?? 0);
    if (!verdict.ok) {
      refused.push({ commitmentId: commitment.id, reason: verdict.reason });
      continue;
    }
    held.set(commitment.agentId, (held.get(commitment.agentId) ?? 0) + commitment.covers);
    accepted.push(commitment);
  }
  const totalCovers = accepted.reduce((sum, c) => sum + c.covers, 0);
  return { accepted, refused, totalCovers, unlocked: totalCovers >= rule.terms.minPoolCovers };
}

// The public view of a rule. Built field by field, never by spreading the rule, so the floor and
// capacity cannot ride along.
export function toOffer(rule: MerchantRule): Offer {
  return {
    ruleId: rule.id,
    merchantId: rule.merchantId,
    termsVersion: rule.termsVersion,
    listPriceCents: rule.listPriceCents,
    offerPriceCents: offerPriceCents(rule),
    discountBps: rule.terms.discountBps,
    window: { ...rule.terms.window },
    minPoolCovers: rule.terms.minPoolCovers,
    perAgentCapCovers: rule.terms.perAgentCapCovers,
  };
}
