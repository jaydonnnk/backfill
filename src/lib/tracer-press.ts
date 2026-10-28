import { sql } from "drizzle-orm";
import { LlmError, type LLMProvider } from "@/integrations/meta/provider";
import type { Db } from "@/lib/db/client";
import { recentAttempts } from "@/lib/llm-calls";
import { errorFields, log } from "@/lib/log";
import { DAY_MS, runTracer, TRACER_PURPOSE, tracerGate } from "@/lib/tracer";

// Arbitrary constant naming the tracer's advisory lock; no other code takes this key.
export const TRACER_LOCK_KEY = 4_151_001;

export type PressStatus = "ok" | "failed" | "busy" | "cooldown" | "daily_cap";

// One press of "Ask Muse Spark". The gate is read and the model is called while holding a
// transaction-scoped advisory lock, so simultaneous presses cannot all pass the same read: one
// holds the lock, the others are refused as busy without waiting. Attempts are logged on the
// recorder's own connection and committed before the lock is released, so the next press sees them.
export async function pressTracer(db: Db, provider: LLMProvider, model: string, clock: () => Date = () => new Date()): Promise<PressStatus> {
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx.execute<{ locked: boolean }>(sql`select pg_try_advisory_xact_lock(${TRACER_LOCK_KEY}) as locked`);
      if (!row?.locked) return "busy";
      const now = clock();
      const gate = tracerGate(now, await recentAttempts(tx, TRACER_PURPOSE, new Date(now.getTime() - DAY_MS)));
      if (!gate.allowed) return gate.reason;
      const result = await runTracer(provider, model);
      log("info", "tracer.ok", { attempts: result.attempts, costNanoUsd: result.costNanoUsd, latencyMs: result.latencyMs });
      return "ok";
    });
  } catch (err) {
    log("error", "tracer.failed", err instanceof LlmError ? { name: err.name, message: err.message, attempts: err.attempts } : errorFields(err));
    return "failed";
  }
}
