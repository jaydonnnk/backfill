import type { Commitment } from "@/domain/commitments/schema";
import { evaluatePool, offerPriceCents } from "@/domain/offers/evaluate";
import type { MerchantRule } from "@/domain/offers/schema";
import type { ClearingResult } from "./schema";

// Arrival order: earliest commitment first, then the lower id, so equal timestamps still give one
// order. Ids compare by code unit, never by locale.
function byArrival(a: Commitment, b: Commitment): number {
  const time = a.committedAt.getTime() - b.committedAt.getTime();
  if (time !== 0) return time;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// Clears one occurrence of a rule. The rule's terms, the per-agent cap and the hidden floor are
// evaluatePool's; clearing then drops commitments whose max price is below the offer price and fills
// the rest first come first served up to capacity. A commitment that does not fit what is left is
// skipped whole, and later, smaller ones may still fill. If the filled covers fall short of the
// minimum pool, the rule stays locked and nothing fills. The caller's array order does not matter.
export function clear(rule: MerchantRule, visitDate: string, commitments: readonly Commitment[]): ClearingResult {
  const price = offerPriceCents(rule);
  const pool = evaluatePool(rule, visitDate, [...commitments].sort(byArrival));
  const fills: ClearingResult["fills"] = [];
  let remaining = rule.capacityCovers;
  for (const commitment of pool.accepted) {
    if (commitment.maxPricePerCoverCents < price) continue;
    if (commitment.covers > remaining) continue;
    fills.push({ commitmentId: commitment.id, covers: commitment.covers });
    remaining -= commitment.covers;
  }
  const unlocked = rule.capacityCovers - remaining >= rule.terms.minPoolCovers;
  return { ruleId: rule.id, termsVersion: rule.termsVersion, visitDate, unlocked, pricePerCoverCents: price, fills: unlocked ? fills : [] };
}
