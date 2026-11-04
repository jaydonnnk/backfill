import { describe, expect, it } from "vitest";
import { MerchantName, MerchantToken, merchantTokenFromLink } from "@/domain/onboarding/access";

const token = `bfm_${"a".repeat(43)}`;
const origin = "http://127.0.0.1:3000";

describe("merchant website access", () => {
  it("trims names and rejects empty, non-string, and overlong names", () => {
    expect(MerchantName.parse("  Kopi Corner  ")).toBe("Kopi Corner");
    for (const name of ["", "   ", "a".repeat(121), undefined, 123]) {
      expect(MerchantName.safeParse(name).success).toBe(false);
    }
    expect(MerchantName.safeParse("a".repeat(120)).success).toBe(true);
  });
  it("preserves the existing merchant token format", () => {
    expect(MerchantToken.safeParse(token).success).toBe(true);
    for (const value of [undefined, token + "x", token.replace("bfm_", "bfa_"), "bfm_bad"]) {
      expect(MerchantToken.safeParse(value).success).toBe(false);
    }
  });
  it("accepts same-origin full and relative access links", () => {
    expect(merchantTokenFromLink(`${origin}/merchant/enter#${token}`, origin)).toBe(token);
    expect(merchantTokenFromLink(` /merchant/enter#${token} `, origin)).toBe(token);
  });
  it.each([
    `https://example.com/merchant/enter#${token}`,
    `http://localhost:3000/merchant/enter#${token}`,
    `${origin}/other#${token}`,
    `${origin}/merchant/enter?token=bad#${token}`,
    `http://user@127.0.0.1:3000/merchant/enter#${token}`,
    `${origin}/merchant/enter#bad`,
    `${origin}/merchant/enter`,
    "javascript:alert(1)",
  ])("rejects an invalid or foreign link: %s", value => {
    expect(merchantTokenFromLink(value, origin)).toBeNull();
  });
});
