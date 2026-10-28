CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"token_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "agents_token_sha256_unique" UNIQUE("token_sha256"),
	CONSTRAINT "agents_id_present" CHECK (length("agents"."id") between 1 and 200),
	CONSTRAINT "agents_token_sha256_hex" CHECK ("agents"."token_sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "clearing_fills" (
	"commitment_id" uuid PRIMARY KEY NOT NULL,
	"rule_id" uuid NOT NULL,
	"visit_date" date NOT NULL,
	"covers" integer NOT NULL,
	CONSTRAINT "clearing_fills_covers_positive" CHECK ("clearing_fills"."covers" >= 1)
);
--> statement-breakpoint
CREATE TABLE "clearings" (
	"rule_id" uuid NOT NULL,
	"visit_date" date NOT NULL,
	"terms_version" integer NOT NULL,
	"unlocked" boolean NOT NULL,
	"price_per_cover_cents" integer NOT NULL,
	"cleared_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clearings_pkey" PRIMARY KEY("rule_id","visit_date"),
	CONSTRAINT "clearings_price_nonnegative" CHECK ("clearings"."price_per_cover_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "commitments" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "clearing_fills" ADD CONSTRAINT "clearing_fills_commitment_id_commitments_id_fk" FOREIGN KEY ("commitment_id") REFERENCES "public"."commitments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clearing_fills" ADD CONSTRAINT "clearing_fills_clearing_fk" FOREIGN KEY ("rule_id","visit_date") REFERENCES "public"."clearings"("rule_id","visit_date") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clearings" ADD CONSTRAINT "clearings_rule_id_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;