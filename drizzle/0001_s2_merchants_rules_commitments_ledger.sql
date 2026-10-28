CREATE TABLE "commitments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"agent_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"terms_version" integer NOT NULL,
	"covers" integer NOT NULL,
	"max_price_per_cover_cents" integer NOT NULL,
	"visit_at" timestamp with time zone NOT NULL,
	"committed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commitments_agent_idempotency_key" UNIQUE("agent_id","idempotency_key"),
	CONSTRAINT "commitments_agent_id_present" CHECK (length("commitments"."agent_id") between 1 and 200),
	CONSTRAINT "commitments_covers_positive" CHECK ("commitments"."covers" >= 1),
	CONSTRAINT "commitments_max_price_nonnegative" CHECK ("commitments"."max_price_per_cover_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ledger" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ledger_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"commitment_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"covers" integer NOT NULL,
	"list_price_cents" integer NOT NULL,
	"price_per_cover_cents" integer NOT NULL,
	"savings_cents" integer NOT NULL,
	"buyer_share_cents" integer NOT NULL,
	"agent_share_cents" integer NOT NULL,
	"network_share_cents" integer NOT NULL,
	CONSTRAINT "ledger_commitment_once" UNIQUE("commitment_id"),
	CONSTRAINT "ledger_covers_positive" CHECK ("ledger"."covers" >= 1),
	CONSTRAINT "ledger_price_nonnegative" CHECK ("ledger"."price_per_cover_cents" >= 0),
	CONSTRAINT "ledger_savings_match" CHECK ("ledger"."savings_cents" = "ledger"."covers" * ("ledger"."list_price_cents" - "ledger"."price_per_cover_cents")),
	CONSTRAINT "ledger_split_sums" CHECK ("ledger"."buyer_share_cents" >= 0 and "ledger"."agent_share_cents" >= 0 and "ledger"."network_share_cents" >= 0 and "ledger"."buyer_share_cents" + "ledger"."agent_share_cents" + "ledger"."network_share_cents" = "ledger"."savings_cents")
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"terms_version" integer DEFAULT 1 NOT NULL,
	"list_price_cents" integer NOT NULL,
	"capacity_covers" integer NOT NULL,
	"weekday" smallint NOT NULL,
	"start_minute" smallint NOT NULL,
	"end_minute" smallint NOT NULL,
	"commit_by_minute" smallint NOT NULL,
	"discount_bps" integer NOT NULL,
	"min_pool_covers" integer NOT NULL,
	"per_agent_cap_covers" integer NOT NULL,
	"floor_price_cents" integer NOT NULL,
	CONSTRAINT "rules_weekday_iso" CHECK ("rules"."weekday" between 1 and 7),
	CONSTRAINT "rules_window_order" CHECK ("rules"."start_minute" < "rules"."end_minute" and "rules"."end_minute" <= 1440),
	CONSTRAINT "rules_commit_by_before_start" CHECK ("rules"."commit_by_minute" >= 0 and "rules"."commit_by_minute" <= "rules"."start_minute"),
	CONSTRAINT "rules_discount_range" CHECK ("rules"."discount_bps" between 1 and 9999),
	CONSTRAINT "rules_floor_within_list" CHECK ("rules"."floor_price_cents" >= 0 and "rules"."floor_price_cents" <= "rules"."list_price_cents"),
	CONSTRAINT "rules_counts_positive" CHECK ("rules"."capacity_covers" >= 1 and "rules"."min_pool_covers" >= 1 and "rules"."per_agent_cap_covers" >= 1)
);
--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_rule_id_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_commitment_id_commitments_id_fk" FOREIGN KEY ("commitment_id") REFERENCES "public"."commitments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_rule_id_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commitments_rule_id_visit_at_idx" ON "commitments" USING btree ("rule_id","visit_at");--> statement-breakpoint
CREATE INDEX "ledger_merchant_id_idx" ON "ledger" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "rules_merchant_id_idx" ON "rules" USING btree ("merchant_id");