import { z } from "zod";
import type { LLMProvider } from "@/integrations/meta/provider";

// The S1 tracer call: one Muse Spark reply on a public page. The page is open to anyone, so each
// call is gated by a cooldown and a daily cap to protect the Meta credit.

export const TRACER_PURPOSE = "tracer";
export const TRACER_COOLDOWN_MS = 60_000;
export const TRACER_DAILY_CAP = 20;
export const DAY_MS = 24 * 60 * 60 * 1000;

export type TracerGate = { allowed: true } | { allowed: false; reason: "cooldown" | "daily_cap"; retryAfterMs: number };

export function tracerGate(now: Date, recent: { count: number; lastAt: Date | null }): TracerGate {
  if (recent.count >= TRACER_DAILY_CAP) return { allowed: false, reason: "daily_cap", retryAfterMs: DAY_MS };
  if (recent.lastAt) {
    const elapsed = now.getTime() - recent.lastAt.getTime();
    if (elapsed < TRACER_COOLDOWN_MS) return { allowed: false, reason: "cooldown", retryAfterMs: TRACER_COOLDOWN_MS - elapsed };
  }
  return { allowed: true };
}

export const tracerReplySchema = z.object({ reply: z.string().min(1).max(400) });

export async function runTracer(provider: LLMProvider, model: string) {
  return provider.generate({
    model,
    purpose: TRACER_PURPOSE,
    system: "You are the pricing assistant of Backfill, a marketplace where small restaurants sell empty off-peak tables to AI buyer agents.",
    prompt: "In one sentence of at most 30 words, tell a small restaurant owner why an empty Tuesday 3pm table is worth selling at a discount.",
    schemaName: "TracerReply",
    schema: tracerReplySchema,
    maxCompletionTokens: 2048,
    reasoningEffort: "low",
  });
}
