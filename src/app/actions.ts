"use server";

import { redirect } from "next/navigation";
import { webEnv } from "@/env";
import { createMetaProvider } from "@/integrations/meta/provider";
import { webDb } from "@/lib/db/client";
import { llmCallRecorder } from "@/lib/llm-calls";
import { pressTracer } from "@/lib/tracer-press";

// The only path that spends Meta credit in S1: a button press, gated inside pressTracer.
export async function askSpark(): Promise<never> {
  const env = webEnv();
  const db = webDb();
  const provider = createMetaProvider({ baseUrl: env.META_BASE_URL, apiKey: env.META_API_KEY, record: llmCallRecorder(db) });
  redirect(`/?status=${await pressTracer(db, provider, env.META_MODEL_SPARK)}`);
}
