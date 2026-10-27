import { describe, expect, it } from "vitest";
import { costNanoUsd, formatUsd } from "@/integrations/meta/pricing";

describe("costNanoUsd", () => {
  it("prices Muse Spark at $1.25 in and $4.25 out per million tokens", () => {
    expect(costNanoUsd("muse-spark-1.3", { tokensIn: 1_000_000, tokensCachedIn: 0, tokensOut: 0 })).toBe(1_250_000_000);
    expect(costNanoUsd("muse-spark-1.3", { tokensIn: 0, tokensCachedIn: 0, tokensOut: 1_000_000 })).toBe(4_250_000_000);
  });

  it("bills cached input at the cached rate instead of the input rate", () => {
    // 100 uncached * 1250 + 900 cached * 150 + 50 out * 4250
    expect(costNanoUsd("muse-spark-1.3", { tokensIn: 1000, tokensCachedIn: 900, tokensOut: 50 })).toBe(125_000 + 135_000 + 212_500);
  });

  it("prices Muse Wonder at $4.00 in, $0.20 cached and $20.00 out per million tokens", () => {
    expect(costNanoUsd("muse-wonder-1.0", { tokensIn: 10, tokensCachedIn: 4, tokensOut: 3 })).toBe(6 * 4000 + 4 * 200 + 3 * 20000);
  });

  it("refuses an unpriced model, including the contributor tier", () => {
    expect(() => costNanoUsd("muse-spark-1.3-contributor", { tokensIn: 1, tokensCachedIn: 0, tokensOut: 1 })).toThrow("No price for model muse-spark-1.3-contributor");
    expect(() => costNanoUsd("toString", { tokensIn: 1, tokensCachedIn: 0, tokensOut: 1 })).toThrow("No price for model toString");
  });

  it("refuses negative, fractional and impossible token counts", () => {
    expect(() => costNanoUsd("muse-spark-1.3", { tokensIn: -1, tokensCachedIn: 0, tokensOut: 0 })).toThrow("non-negative integers");
    expect(() => costNanoUsd("muse-spark-1.3", { tokensIn: 1.5, tokensCachedIn: 0, tokensOut: 0 })).toThrow("non-negative integers");
    expect(() => costNanoUsd("muse-spark-1.3", { tokensIn: 1, tokensCachedIn: 2, tokensOut: 0 })).toThrow("Cached tokens cannot exceed input tokens");
  });
});

describe("formatUsd", () => {
  it("shows dollars to the micro-dollar", () => {
    expect(formatUsd(472_500)).toBe("$0.000473");
    expect(formatUsd(1_250_000_000)).toBe("$1.250000");
    expect(formatUsd(499)).toBe("$0.000000");
    expect(formatUsd(12_345_678_900)).toBe("$12.345679");
  });
});
