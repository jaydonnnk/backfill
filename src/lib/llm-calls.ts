import { and, count, desc, eq, gte, max } from "drizzle-orm";
import type { CallRecorder } from "@/integrations/meta/provider";
import type { Db, Executor } from "@/lib/db/client";
import { llmCalls } from "@/lib/db/schema";

export function llmCallRecorder(db: Db): CallRecorder {
  return async (record) => {
    await db.insert(llmCalls).values(record);
  };
}

export type LlmCallRow = typeof llmCalls.$inferSelect;

export async function latestOkCall(db: Db, purpose: string): Promise<LlmCallRow | null> {
  const rows = await db
    .select()
    .from(llmCalls)
    .where(and(eq(llmCalls.purpose, purpose), eq(llmCalls.ok, true)))
    .orderBy(desc(llmCalls.createdAt), desc(llmCalls.id))
    .limit(1);
  return rows[0] ?? null;
}

// Attempts for a purpose since `since`, failed ones included, and when the latest one was made.
export async function recentAttempts(db: Executor, purpose: string, since: Date): Promise<{ count: number; lastAt: Date | null }> {
  const [row] = await db
    .select({ count: count(), lastAt: max(llmCalls.createdAt) })
    .from(llmCalls)
    .where(and(eq(llmCalls.purpose, purpose), gte(llmCalls.createdAt, since)));
  return { count: row?.count ?? 0, lastAt: row?.lastAt ?? null };
}

// Public diagnostic metadata only. Output is deliberately excluded at query time.
export async function recentCalls(db: Db, limit = 50) {
  return db.select({id:llmCalls.id,model:llmCalls.model,purpose:llmCalls.purpose,ok:llmCalls.ok,tokensIn:llmCalls.tokensIn,tokensOut:llmCalls.tokensOut,costNanoUsd:llmCalls.costNanoUsd,latencyMs:llmCalls.latencyMs}).from(llmCalls).orderBy(desc(llmCalls.createdAt),desc(llmCalls.id)).limit(Math.max(1,Math.min(50,limit)));
}
