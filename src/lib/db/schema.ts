import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// One row per HTTP attempt to a model, including failed and retried attempts, so cost per deal (S9)
// comes from what was billed rather than from estimates.
export const llmCalls = pgTable(
  "llm_calls",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    // What the call was for, such as "tracer" or "negotiation".
    purpose: text("purpose").notNull(),
    // 1 for the first attempt of a request, 2 for its first retry, and so on.
    attempt: integer("attempt").notNull(),
    tokensIn: integer("tokens_in").notNull(),
    tokensCachedIn: integer("tokens_cached_in").notNull(),
    tokensOut: integer("tokens_out").notNull(),
    // Billionths of a US dollar, so every listed price is a whole number per token.
    costNanoUsd: bigint("cost_nano_usd", { mode: "number" }).notNull(),
    latencyMs: integer("latency_ms").notNull(),
    // True only when the reply passed schema validation.
    ok: boolean("ok").notNull(),
    httpStatus: integer("http_status"),
    error: text("error"),
    output: text("output"),
  },
  (t) => [
    index("llm_calls_purpose_created_at_idx").on(t.purpose, t.createdAt),
    check("llm_calls_attempt_positive", sql`${t.attempt} >= 1`),
    check("llm_calls_tokens_nonnegative", sql`${t.tokensIn} >= 0 and ${t.tokensCachedIn} >= 0 and ${t.tokensOut} >= 0 and ${t.tokensCachedIn} <= ${t.tokensIn}`),
    check("llm_calls_cost_nonnegative", sql`${t.costNanoUsd} >= 0`),
    check("llm_calls_latency_nonnegative", sql`${t.latencyMs} >= 0`),
  ],
);
