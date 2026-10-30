import { z } from "zod";
import { BASIS_POINTS } from "@/domain/money";
import { offerPriceCents } from "@/domain/offers/evaluate";
import { DiscountBps, type MerchantRule } from "@/domain/offers/schema";

// When an occurrence sells out, the Muse Wonder merchant agent proposes the rule's next terms. A
// sellout means demand beat supply, so a plan may add capacity, need a bigger pool or give a
// smaller discount, never the reverse; it never touches the window or the floor. What Wonder
// proposes counts only after judgePlan, and only once the merchant applies it.

// Capacity may grow to at most twice its current value in one plan.
export const MAX_CAPACITY_GROWTH = 2;

export const WonderPlan = z.strictObject({
  discountBps: DiscountBps.describe("The next discount in basis points, at most the current one."),
  capacityCovers: z.int().min(1).describe("The next capacity in covers, from the current one up to twice it."),
  minPoolCovers: z.int().min(1).describe("Covers the pool must reach, at least the current minimum and at most the next capacity."),
  perAgentCapCovers: z.int().min(1).describe("The most covers one agent may hold, at most the next capacity."),
  rationale: z.string().min(1).max(400).describe("Two short sentences for the merchant on why, citing the fill history."),
});
export type WonderPlan = z.infer<typeof WonderPlan>;

export type PlanRefusal =
  | "unchanged"
  | "deepens_discount"
  | "capacity_out_of_range"
  | "lowers_min_pool"
  | "min_pool_above_capacity"
  | "cap_above_capacity"
  | "below_floor";

export type PlanVerdict = { ok: true } | { ok: false; reason: PlanRefusal };

export function judgePlan(rule: MerchantRule, plan: WonderPlan): PlanVerdict {
  const { terms } = rule;
  if (
    plan.discountBps === terms.discountBps &&
    plan.capacityCovers === rule.capacityCovers &&
    plan.minPoolCovers === terms.minPoolCovers &&
    plan.perAgentCapCovers === terms.perAgentCapCovers
  ) {
    return { ok: false, reason: "unchanged" };
  }
  if (plan.discountBps > terms.discountBps) return { ok: false, reason: "deepens_discount" };
  if (plan.capacityCovers < rule.capacityCovers || plan.capacityCovers > rule.capacityCovers * MAX_CAPACITY_GROWTH) {
    return { ok: false, reason: "capacity_out_of_range" };
  }
  if (plan.minPoolCovers < terms.minPoolCovers) return { ok: false, reason: "lowers_min_pool" };
  if (plan.minPoolCovers > plan.capacityCovers) return { ok: false, reason: "min_pool_above_capacity" };
  if (plan.perAgentCapCovers > plan.capacityCovers) return { ok: false, reason: "cap_above_capacity" };
  // A smaller discount only raises the offer price, but the check stays for a floor raised since.
  if (offerPriceCents({ ...rule, terms: { ...terms, discountBps: plan.discountBps } }) < terms.floorPriceCents) {
    return { ok: false, reason: "below_floor" };
  }
  return { ok: true };
}

// The rule with a plan's terms, for the merchant's preview before applying it.
export function planned(rule: MerchantRule, plan: WonderPlan): MerchantRule {
  return {
    ...rule,
    capacityCovers: plan.capacityCovers,
    terms: { ...rule.terms, discountBps: plan.discountBps, minPoolCovers: plan.minPoolCovers, perAgentCapCovers: plan.perAgentCapCovers },
  };
}

export const percent = (bps: number) => `${(bps / (BASIS_POINTS / 100)).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
