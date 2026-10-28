import { sql } from "drizzle-orm";
import { bigint, boolean, check, date, foreignKey, index, integer, pgTable, primaryKey, smallint, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

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

// The tables below mirror the Zod schemas in src/domain; money is SGD in integer cents and every
// minute is a Singapore wall-clock minute. Triggers that Drizzle cannot express live in the custom
// migration drizzle/0002_s2_triggers.sql: the terms-version bump on rules, the current-terms check on
// commitments, and the append-only ledger.

export const merchants = pgTable("merchants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One row per rule, holding its current terms. A trigger sets terms_version to 1 on insert and bumps
// it on every change to the public terms, so it needs no check of its own; the floor and capacity are
// not public, so changing them leaves the version alone.
export const rules = pgTable(
  "rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    termsVersion: integer("terms_version").notNull().default(1),
    listPriceCents: integer("list_price_cents").notNull(),
    capacityCovers: integer("capacity_covers").notNull(),
    // ISO weekday, 1 is Monday.
    weekday: smallint("weekday").notNull(),
    startMinute: smallint("start_minute").notNull(),
    endMinute: smallint("end_minute").notNull(),
    commitByMinute: smallint("commit_by_minute").notNull(),
    discountBps: integer("discount_bps").notNull(),
    minPoolCovers: integer("min_pool_covers").notNull(),
    perAgentCapCovers: integer("per_agent_cap_covers").notNull(),
    floorPriceCents: integer("floor_price_cents").notNull(),
  },
  (t) => [
    index("rules_merchant_id_idx").on(t.merchantId),
    check("rules_weekday_iso", sql`${t.weekday} between 1 and 7`),
    check("rules_window_order", sql`${t.startMinute} < ${t.endMinute} and ${t.endMinute} <= 1440`),
    check("rules_commit_by_before_start", sql`${t.commitByMinute} >= 0 and ${t.commitByMinute} <= ${t.startMinute}`),
    check("rules_discount_range", sql`${t.discountBps} between 1 and 9999`),
    check("rules_floor_within_list", sql`${t.floorPriceCents} >= 0 and ${t.floorPriceCents} <= ${t.listPriceCents}`),
    check("rules_counts_positive", sql`${t.capacityCovers} >= 1 and ${t.minPoolCovers} >= 1 and ${t.perAgentCapCovers} >= 1`),
    check("rules_min_pool_within_capacity", sql`${t.minPoolCovers} <= ${t.capacityCovers}`),
  ],
);

// A buyer agent allowed to call the MCP server. Its bearer token is shown once when minted and only
// its SHA-256 is stored; the agent id comes from the token, never from a tool argument.
export const agents = pgTable(
  "agents",
  {
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    tokenSha256: text("token_sha256").notNull().unique("agents_token_sha256_unique"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    check("agents_id_present", sql`length(${t.id}) between 1 and 200`),
    check("agents_token_sha256_hex", sql`${t.tokenSha256} ~ '^[0-9a-f]{64}$'`),
  ],
);

// A binding commitment. A trigger refuses one whose terms_version is not the rule's current version.
export const commitments = pgTable(
  "commitments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => rules.id),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id),
    // Chosen by the agent, so a retried submission (S4) does not commit twice.
    idempotencyKey: text("idempotency_key").notNull(),
    termsVersion: integer("terms_version").notNull(),
    covers: integer("covers").notNull(),
    maxPricePerCoverCents: integer("max_price_per_cover_cents").notNull(),
    visitAt: timestamp("visit_at", { withTimezone: true }).notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow(),
    // Set once when the agent cancels before the deadline; a trigger refuses any other change.
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (t) => [
    unique("commitments_agent_idempotency_key").on(t.agentId, t.idempotencyKey),
    index("commitments_rule_id_visit_at_idx").on(t.ruleId, t.visitAt),
    check("commitments_agent_id_present", sql`length(${t.agentId}) between 1 and 200`),
    check("commitments_covers_positive", sql`${t.covers} >= 1`),
    check("commitments_max_price_nonnegative", sql`${t.maxPricePerCoverCents} >= 0`),
  ],
);

// The stored outcome of clearing one occurrence of a rule, written once by the first status read
// after the occurrence's deadline, so a later change to the floor or capacity cannot change it.
// Append-only by trigger, like the ledger.
export const clearings = pgTable(
  "clearings",
  {
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => rules.id),
    // The occurrence's Singapore date.
    visitDate: date("visit_date", { mode: "string" }).notNull(),
    termsVersion: integer("terms_version").notNull(),
    unlocked: boolean("unlocked").notNull(),
    pricePerCoverCents: integer("price_per_cover_cents").notNull(),
    clearedAt: timestamp("cleared_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: "clearings_pkey", columns: [t.ruleId, t.visitDate] }), check("clearings_price_nonnegative", sql`${t.pricePerCoverCents} >= 0`)],
);

// One row per commitment a stored clearing filled. A commitment fills at most once.
export const clearingFills = pgTable(
  "clearing_fills",
  {
    commitmentId: uuid("commitment_id")
      .primaryKey()
      .references(() => commitments.id),
    ruleId: uuid("rule_id").notNull(),
    visitDate: date("visit_date", { mode: "string" }).notNull(),
    covers: integer("covers").notNull(),
  },
  (t) => [
    foreignKey({ name: "clearing_fills_clearing_fk", columns: [t.ruleId, t.visitDate], foreignColumns: [clearings.ruleId, clearings.visitDate] }),
    check("clearing_fills_covers_positive", sql`${t.covers} >= 1`),
  ],
);

// One row per cleared commitment's savings split. Append-only: triggers refuse UPDATE, DELETE and
// TRUNCATE for every role, the owner and the superuser included.
export const ledger = pgTable(
  "ledger",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    commitmentId: uuid("commitment_id")
      .notNull()
      .unique("ledger_commitment_once")
      .references(() => commitments.id),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => rules.id),
    covers: integer("covers").notNull(),
    listPriceCents: integer("list_price_cents").notNull(),
    pricePerCoverCents: integer("price_per_cover_cents").notNull(),
    savingsCents: integer("savings_cents").notNull(),
    buyerShareCents: integer("buyer_share_cents").notNull(),
    agentShareCents: integer("agent_share_cents").notNull(),
    networkShareCents: integer("network_share_cents").notNull(),
  },
  (t) => [
    index("ledger_merchant_id_idx").on(t.merchantId),
    check("ledger_covers_positive", sql`${t.covers} >= 1`),
    check("ledger_price_nonnegative", sql`${t.pricePerCoverCents} >= 0`),
    check("ledger_savings_match", sql`${t.savingsCents} = ${t.covers} * (${t.listPriceCents} - ${t.pricePerCoverCents})`),
    check(
      "ledger_split_sums",
      sql`${t.buyerShareCents} >= 0 and ${t.agentShareCents} >= 0 and ${t.networkShareCents} >= 0 and ${t.buyerShareCents} + ${t.agentShareCents} + ${t.networkShareCents} = ${t.savingsCents}`,
    ),
  ],
);
