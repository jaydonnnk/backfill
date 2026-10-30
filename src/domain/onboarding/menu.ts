import { z } from "zod";
import { type AgentTerms, MerchantRule } from "@/domain/offers/schema";
import { offerPriceCents } from "@/domain/offers/evaluate";

// A menu photo becomes an offer in two steps: Muse Spark reads the photo into a MenuDraft, then the
// merchant sets the agent terms and confirms. The model never names the list price: it picks the
// menu items that make one cover, and the price is their printed prices summed here.

// A photo is at most 4 MiB and must be a JPEG, PNG or WebP by its own bytes, whatever its name says.
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export type PhotoType = "image/jpeg" | "image/png" | "image/webp";

export function sniffPhoto(bytes: Uint8Array): PhotoType | null {
  const at = (offset: number, ...expected: number[]) => expected.every((byte, i) => bytes[offset + i] === byte);
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  // RIFF....WEBP
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}

export type PhotoVerdict = { ok: true; mediaType: PhotoType } | { ok: false; reason: "empty" | "too_large" | "not_an_image" };

export function judgePhoto(bytes: Uint8Array): PhotoVerdict {
  if (bytes.length === 0) return { ok: false, reason: "empty" };
  if (bytes.length > MAX_PHOTO_BYTES) return { ok: false, reason: "too_large" };
  const mediaType = sniffPhoto(bytes);
  return mediaType ? { ok: true, mediaType } : { ok: false, reason: "not_an_image" };
}

// The most a single menu item may cost, S$500, so a misread number cannot become a list price.
export const MAX_ITEM_CENTS = 50_000;
export const MAX_MENU_ITEMS = 60;
export const MAX_COVER_ITEMS = 4;

export const MenuItem = z.strictObject({
  name: z.string().min(1).max(80).describe("The item's name as printed."),
  priceCents: z.int().min(1).max(MAX_ITEM_CENTS).describe("The printed price in SGD cents, for example 650 for S$6.50."),
});
export type MenuItem = z.infer<typeof MenuItem>;

// What Muse Spark returns for a menu photo.
export const MenuDraft = z.strictObject({
  currency: z.enum(["SGD", "other"]).describe("SGD when the printed prices are Singapore dollars, otherwise other."),
  items: z.array(MenuItem).max(MAX_MENU_ITEMS).describe("Every item with a readable printed price, in menu order."),
  cover: z.strictObject({
    itemIndexes: z
      .array(z.int().min(0))
      .min(1)
      .max(MAX_COVER_ITEMS)
      .describe("Zero-based indexes into items that make one typical off-peak cover, for example one main and one drink."),
    description: z.string().min(1).max(120).describe("One short line naming the cover, for example 'Iced latte and a slice of cake'."),
  }),
});
export type MenuDraft = z.infer<typeof MenuDraft>;

export type DraftRefusal = "not_sgd" | "no_items" | "cover_item_missing" | "cover_item_repeated";
export type DraftVerdict = { ok: true; listPriceCents: number } | { ok: false; reason: DraftRefusal };

// A draft counts only when its prices are SGD and its cover names distinct items that exist; the
// list price is then the sum of those items' printed prices.
export function judgeDraft(draft: MenuDraft): DraftVerdict {
  if (draft.currency !== "SGD") return { ok: false, reason: "not_sgd" };
  if (draft.items.length === 0) return { ok: false, reason: "no_items" };
  const indexes = draft.cover.itemIndexes;
  if (indexes.some((i) => i >= draft.items.length)) return { ok: false, reason: "cover_item_missing" };
  if (new Set(indexes).size !== indexes.length) return { ok: false, reason: "cover_item_repeated" };
  return { ok: true, listPriceCents: indexes.reduce((sum, i) => sum + (draft.items[i]?.priceCents ?? 0), 0) };
}

// What the merchant sets on the review screen. The list price is not here: it comes from the draft.
export type RuleSettings = { capacityCovers: number; terms: AgentTerms };

export type PublishRefusal = "invalid_terms" | "floor_above_offer_price";
export type PublishVerdict = { ok: true; rule: MerchantRule } | { ok: false; reason: PublishRefusal; problems?: string[] };

// The rule a confirmed draft publishes. A floor above the offer price is refused here, since such an
// offer could never clear and buyers would only ever be told it is unavailable.
export function ruleFromDraft(listPriceCents: number, settings: RuleSettings, ids: { ruleId: string; merchantId: string }): PublishVerdict {
  const parsed = MerchantRule.safeParse({ id: ids.ruleId, merchantId: ids.merchantId, termsVersion: 1, listPriceCents, ...settings });
  if (!parsed.success) {
    return { ok: false, reason: "invalid_terms", problems: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
  }
  if (offerPriceCents(parsed.data) < parsed.data.terms.floorPriceCents) return { ok: false, reason: "floor_above_offer_price" };
  return { ok: true, rule: parsed.data };
}
