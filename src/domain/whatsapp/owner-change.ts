import { z } from "zod";
import { BASIS_POINTS } from "@/domain/money";
import { offerPriceCents } from "@/domain/offers/evaluate";
import type { MerchantRule } from "@/domain/offers/schema";

// The owner of a merchant may change its live offer by WhatsApp. Muse Wonder reads the message and
// proposes the rule's next terms; what it proposes counts only after judgeOwnerChange, and only
// once the owner replies YES. Unlike a Wonder re-plan, the owner may deepen the discount or shrink
// capacity, since the terms are theirs, but the window and the floor never change here and the new
// offer price must stay at or above the floor.

// The most covers a rule may hold, the same bound as the merchant page's form.
export const MAX_COVERS = 10_000;

export const OwnerChange = z.strictObject({
  understood: z.boolean().describe("True only if the message asks to change the discount, capacity, minimum pool or per-agent cap."),
  discountBps: z.int().min(0).max(BASIS_POINTS).describe("The next discount in basis points; the current one if unchanged."),
  capacityCovers: z.int().min(0).describe("The next capacity in covers; the current one if unchanged."),
  minPoolCovers: z.int().min(0).describe("The next minimum pool in covers; the current one if unchanged."),
  perAgentCapCovers: z.int().min(0).describe("The next most covers one agent may hold; the current one if unchanged."),
  reply: z.string().min(1).max(300).describe("One or two short sentences to the owner: what you will change, or what you can change if you did not understand."),
});
export type OwnerChange = z.infer<typeof OwnerChange>;

export type OwnerChangeRefusal =
  | "not_understood"
  | "unchanged"
  | "discount_out_of_range"
  | "capacity_out_of_range"
  | "min_pool_out_of_range"
  | "cap_out_of_range"
  | "below_floor";

export type OwnerChangeVerdict = { ok: true } | { ok: false; reason: OwnerChangeRefusal };

export function judgeOwnerChange(rule: MerchantRule, change: OwnerChange): OwnerChangeVerdict {
  const { terms } = rule;
  if (!change.understood) return { ok: false, reason: "not_understood" };
  if (
    change.discountBps === terms.discountBps &&
    change.capacityCovers === rule.capacityCovers &&
    change.minPoolCovers === terms.minPoolCovers &&
    change.perAgentCapCovers === terms.perAgentCapCovers
  ) {
    return { ok: false, reason: "unchanged" };
  }
  if (change.discountBps < 1 || change.discountBps > BASIS_POINTS - 1) return { ok: false, reason: "discount_out_of_range" };
  if (change.capacityCovers < 1 || change.capacityCovers > MAX_COVERS) return { ok: false, reason: "capacity_out_of_range" };
  if (change.minPoolCovers < 1 || change.minPoolCovers > change.capacityCovers) return { ok: false, reason: "min_pool_out_of_range" };
  if (change.perAgentCapCovers < 1 || change.perAgentCapCovers > change.capacityCovers) return { ok: false, reason: "cap_out_of_range" };
  if (offerPriceCents({ ...rule, terms: { ...terms, discountBps: change.discountBps } }) < terms.floorPriceCents) return { ok: false, reason: "below_floor" };
  return { ok: true };
}

// The rule with a change's terms, for the owner's preview before they confirm.
export function changed(rule: MerchantRule, change: OwnerChange): MerchantRule {
  return {
    ...rule,
    capacityCovers: change.capacityCovers,
    terms: { ...rule.terms, discountBps: change.discountBps, minPoolCovers: change.minPoolCovers, perAgentCapCovers: change.perAgentCapCovers },
  };
}

// What the owner's phone sends, read by code and never by the model: a link code, a confirmation, a
// cancellation, or anything else, which is an instruction for Wonder.
export type Intent = { kind: "link"; code: string } | { kind: "confirm" } | { kind: "cancel" } | { kind: "instruction" };

// Letters and digits without the ones that are easy to misread (no 0, 1, I, L, O, U).
export const LINK_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
export const LINK_CODE_LENGTH = 8;

const CONFIRM = new Set(["yes", "y", "yep", "confirm", "ok", "okay"]);
const CANCEL = new Set(["no", "n", "cancel", "stop"]);

export function readIntent(text: string): Intent {
  const plain = text.trim().replace(/[.!\s]+$/u, "");
  const link = /^link\s+([A-Za-z0-9]{8})$/i.exec(plain);
  if (link?.[1]) return { kind: "link", code: link[1].toUpperCase() };
  const word = plain.toLowerCase();
  if (CONFIRM.has(word)) return { kind: "confirm" };
  if (CANCEL.has(word)) return { kind: "cancel" };
  return { kind: "instruction" };
}
