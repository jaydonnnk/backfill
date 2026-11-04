import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { clientKey } from "@/lib/rate-limit";

const hash = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

describe("clientKey", () => {
  it("prefers cf-connecting-ip over x-forwarded-for", () => {
    expect(clientKey(new Headers({ "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }))).toBe(hash("1.1.1.1"));
  });
  it("otherwise takes the leftmost forwarded address", () => {
    expect(clientKey(new Headers({ "x-forwarded-for": " 3.3.3.3 , 4.4.4.4" }))).toBe(hash("3.3.3.3"));
  });
  it("returns null without a usable header, so callers skip the per-client check", () => {
    expect(clientKey(new Headers())).toBeNull();
    expect(clientKey(new Headers({ "x-forwarded-for": " , " }))).toBeNull();
  });
  it("never returns the raw address", () => {
    expect(clientKey(new Headers({ "x-forwarded-for": "5.5.5.5" }))).toMatch(/^[0-9a-f]{64}$/);
  });
});
