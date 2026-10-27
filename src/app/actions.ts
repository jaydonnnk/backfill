"use server";

import { redirect } from "next/navigation";
import { webEnv } from "@/env";
import { createMetaProvider, LlmError } from "@/integrations/meta/provider";
import { webDb } from "@/lib/db/client";
import { llmCallRecorder, recentAttempts } from "@/lib/llm-calls";
import { errorFields, log } from "@/lib/log";
import { DAY_MS, runTracer, TRACER_PURPOSE, tracerGate } from "@/lib/tracer";

// The only path that spends Meta credit in S1: a button press, gated by tracerGate.
export async function askSpark(): Promise<never> {
  const env = webEnv();
  const db = webDb();
  const now = new Date();
  const gate = tracerGate(now, await recentAttempts(db, TRACER_PURPOSE, new Date(now.getTime() - DAY_MS)));
  if (!gate.allowed) redirect(`/?status=${gate.reason}`);

  const provider = createMetaProvider({ baseUrl: env.META_BASE_URL, apiKey: env.META_API_KEY, record: llmCallRecorder(db) });
  try {
    const result = await runTracer(provider, env.META_MODEL_SPARK);
    log("info", "tracer.ok", { attempts: result.attempts, costNanoUsd: result.costNanoUsd, latencyMs: result.latencyMs });
  } catch (err) {
    log("error", "tracer.failed", err instanceof LlmError ? { name: err.name, message: err.message, attempts: err.attempts } : errorFields(err));
    redirect("/?status=failed");
  }
  redirect("/?status=ok");
}
