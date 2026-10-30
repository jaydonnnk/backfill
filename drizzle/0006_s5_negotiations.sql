CREATE TABLE "negotiation_rounds" (
	"negotiation_id" uuid NOT NULL,
	"round" smallint NOT NULL,
	"bid_cents" integer NOT NULL,
	"proposed_cents" integer,
	"proposal_verdict" text,
	"status" text NOT NULL,
	"counter_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "negotiation_rounds_pkey" PRIMARY KEY("negotiation_id","round"),
	CONSTRAINT "negotiation_rounds_round_range" CHECK ("negotiation_rounds"."round" between 1 and 3),
	CONSTRAINT "negotiation_rounds_status" CHECK ("negotiation_rounds"."status" in ('accepted', 'countered', 'held')),
	CONSTRAINT "negotiation_rounds_verdict" CHECK ("negotiation_rounds"."proposal_verdict" in ('ok', 'rises', 'concedes_too_much', 'below_bid', 'below_floor')),
	CONSTRAINT "negotiation_rounds_proposal_together" CHECK (("negotiation_rounds"."proposed_cents" is null) = ("negotiation_rounds"."proposal_verdict" is null)),
	CONSTRAINT "negotiation_rounds_cents_nonnegative" CHECK ("negotiation_rounds"."bid_cents" >= 0 and "negotiation_rounds"."counter_cents" >= 0 and "negotiation_rounds"."proposed_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "negotiations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" text NOT NULL,
	"rule_id" uuid NOT NULL,
	"terms_version" integer NOT NULL,
	"visit_date" date NOT NULL,
	"covers" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "negotiations_once_per_occurrence" UNIQUE("agent_id","rule_id","visit_date"),
	CONSTRAINT "negotiations_covers_positive" CHECK ("negotiations"."covers" >= 1)
);
--> statement-breakpoint
ALTER TABLE "clearing_fills" ADD COLUMN "price_per_cover_cents" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "commitments" ADD COLUMN "negotiation_id" uuid;--> statement-breakpoint
ALTER TABLE "commitments" ADD COLUMN "negotiated_price_cents" integer;--> statement-breakpoint
ALTER TABLE "negotiation_rounds" ADD CONSTRAINT "negotiation_rounds_negotiation_id_negotiations_id_fk" FOREIGN KEY ("negotiation_id") REFERENCES "public"."negotiations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negotiations" ADD CONSTRAINT "negotiations_rule_id_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_negotiation_id_negotiations_id_fk" FOREIGN KEY ("negotiation_id") REFERENCES "public"."negotiations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_negotiation_once" UNIQUE("negotiation_id");--> statement-breakpoint
ALTER TABLE "clearing_fills" ADD CONSTRAINT "clearing_fills_price_nonnegative" CHECK ("clearing_fills"."price_per_cover_cents" >= 0);--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_negotiated_together" CHECK (("commitments"."negotiation_id" is null) = ("commitments"."negotiated_price_cents" is null));--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_negotiated_price_nonnegative" CHECK ("commitments"."negotiated_price_cents" >= 0);