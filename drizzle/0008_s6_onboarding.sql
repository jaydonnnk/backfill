CREATE TABLE "menu_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"photo_sha256" text NOT NULL,
	"photo_bytes" integer NOT NULL,
	"photo_type" text NOT NULL,
	"model" text NOT NULL,
	"draft" jsonb NOT NULL,
	"verdict" text NOT NULL,
	"list_price_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_drafts_photo_sha256_hex" CHECK ("menu_drafts"."photo_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "menu_drafts_photo_bytes_range" CHECK ("menu_drafts"."photo_bytes" between 1 and 4194304),
	CONSTRAINT "menu_drafts_photo_type" CHECK ("menu_drafts"."photo_type" in ('image/jpeg', 'image/png', 'image/webp')),
	CONSTRAINT "menu_drafts_verdict" CHECK ("menu_drafts"."verdict" in ('ok', 'not_sgd', 'no_items', 'cover_item_missing', 'cover_item_repeated')),
	CONSTRAINT "menu_drafts_price_with_ok" CHECK (("menu_drafts"."verdict" = 'ok') = ("menu_drafts"."list_price_cents" is not null) and "menu_drafts"."list_price_cents" >= 1)
);
--> statement-breakpoint
CREATE TABLE "offer_publications" (
	"draft_id" uuid PRIMARY KEY NOT NULL,
	"rule_id" uuid NOT NULL,
	"merchant_id" uuid NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offer_publications_rule_once" UNIQUE("rule_id")
);
--> statement-breakpoint
CREATE TABLE "plan_applications" (
	"plan_id" uuid PRIMARY KEY NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wonder_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"visit_date" date NOT NULL,
	"terms_version" integer NOT NULL,
	"model" text NOT NULL,
	"discount_bps" integer,
	"capacity_covers" integer,
	"min_pool_covers" integer,
	"per_agent_cap_covers" integer,
	"rationale" text,
	"verdict" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wonder_plans_once_per_clearing" UNIQUE("rule_id","visit_date"),
	CONSTRAINT "wonder_plans_verdict" CHECK ("wonder_plans"."verdict" in ('ok', 'no_proposal', 'unchanged', 'deepens_discount', 'capacity_out_of_range', 'lowers_min_pool', 'min_pool_above_capacity', 'cap_above_capacity', 'below_floor')),
	CONSTRAINT "wonder_plans_proposal_together" CHECK (("wonder_plans"."verdict" = 'no_proposal') = ("wonder_plans"."discount_bps" is null) and ("wonder_plans"."discount_bps" is null) = ("wonder_plans"."capacity_covers" is null) and ("wonder_plans"."discount_bps" is null) = ("wonder_plans"."min_pool_covers" is null) and ("wonder_plans"."discount_bps" is null) = ("wonder_plans"."per_agent_cap_covers" is null) and ("wonder_plans"."discount_bps" is null) = ("wonder_plans"."rationale" is null))
);
--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "link_token_sha256" text;--> statement-breakpoint
ALTER TABLE "menu_drafts" ADD CONSTRAINT "menu_drafts_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_publications" ADD CONSTRAINT "offer_publications_draft_id_menu_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."menu_drafts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_publications" ADD CONSTRAINT "offer_publications_rule_id_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_publications" ADD CONSTRAINT "offer_publications_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_applications" ADD CONSTRAINT "plan_applications_plan_id_wonder_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."wonder_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wonder_plans" ADD CONSTRAINT "wonder_plans_clearing_fk" FOREIGN KEY ("rule_id","visit_date") REFERENCES "public"."clearings"("rule_id","visit_date") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "menu_drafts_merchant_id_idx" ON "menu_drafts" USING btree ("merchant_id");--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_link_token_sha256_unique" UNIQUE("link_token_sha256");--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_link_token_sha256_hex" CHECK ("merchants"."link_token_sha256" ~ '^[0-9a-f]{64}$');