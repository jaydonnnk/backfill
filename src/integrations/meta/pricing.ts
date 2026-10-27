// [vendor claim] Standard-tier prices from Meta's pricing page,
// https://dev.meta.ai/docs/pricing-rate-limits, read 2026-10-27. Not yet reconciled against a Meta
// invoice. Listed per million tokens in USD; stored here per token in billionths of a dollar (nano-USD),
// so $1.25 per million is 1250 and every cost is a whole number.
// A model missing from this table has no known price, and the provider refuses to call it.
export const PRICES_NANO_USD_PER_TOKEN: Readonly<Record<string, { input: number; cachedInput: number; output: number }>> = {
  "muse-spark-1.3": { input: 1250, cachedInput: 150, output: 4250 },
  "muse-wonder-1.0": { input: 4000, cachedInput: 200, output: 20000 },
};

export type Usage = { tokensIn: number; tokensCachedIn: number; tokensOut: number };

export function hasPrice(model: string): boolean {
  return Object.hasOwn(PRICES_NANO_USD_PER_TOKEN, model);
}

// tokensIn includes the cached tokens, as the API's prompt_tokens does; they are billed at the
// cached rate instead of the input rate. [hypothesis] reasoning tokens are inside tokensOut and billed
// as output, as the API counts them inside completion_tokens.
export function costNanoUsd(model: string, usage: Usage): number {
  const price = hasPrice(model) ? PRICES_NANO_USD_PER_TOKEN[model] : undefined;
  if (!price) throw new Error(`No price for model ${model}`);
  const { tokensIn, tokensCachedIn, tokensOut } = usage;
  for (const count of [tokensIn, tokensCachedIn, tokensOut]) {
    if (!Number.isSafeInteger(count) || count < 0) throw new Error("Token counts must be non-negative integers");
  }
  if (tokensCachedIn > tokensIn) throw new Error("Cached tokens cannot exceed input tokens");
  return (tokensIn - tokensCachedIn) * price.input + tokensCachedIn * price.cachedInput + tokensOut * price.output;
}

// Rounds half up to the micro-dollar in integers, since a float division can round $0.0004725 down.
export function formatUsd(nanoUsd: number): string {
  const micro = Math.floor((nanoUsd + 500) / 1000);
  return `$${Math.floor(micro / 1e6)}.${String(micro % 1e6).padStart(6, "0")}`;
}
