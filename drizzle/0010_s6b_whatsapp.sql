CREATE TABLE "owner_change_outcomes" (
	"change_id" uuid PRIMARY KEY NOT NULL,
	"outcome" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owner_change_outcomes_outcome" CHECK ("owner_change_outcomes"."outcome" in ('applied', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "owner_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"terms_version" integer NOT NULL,
	"wamid" text NOT NULL,
	"message_text" text NOT NULL,
	"model" text NOT NULL,
	"discount_bps" integer,
	"capacity_covers" integer,
	"min_pool_covers" integer,
	"per_agent_cap_covers" integer,
	"verdict" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "owner_changes_wamid_once" UNIQUE("wamid"),
	CONSTRAINT "owner_changes_message_length" CHECK (length("owner_changes"."message_text") between 1 and 500),
	CONSTRAINT "owner_changes_verdict" CHECK ("owner_changes"."verdict" in ('ok', 'no_proposal', 'not_understood', 'unchanged', 'discount_out_of_range', 'capacity_out_of_range', 'min_pool_out_of_range', 'cap_out_of_range', 'below_floor')),
	CONSTRAINT "owner_changes_proposal_together" CHECK (("owner_changes"."verdict" in ('no_proposal', 'not_understood')) = ("owner_changes"."discount_bps" is null) and ("owner_changes"."discount_bps" is null) = ("owner_changes"."capacity_covers" is null) and ("owner_changes"."discount_bps" is null) = ("owner_changes"."min_pool_covers" is null) and ("owner_changes"."discount_bps" is null) = ("owner_changes"."per_agent_cap_covers" is null)),
	CONSTRAINT "owner_changes_expiry" CHECK ("owner_changes"."expires_at" > "owner_changes"."created_at")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_inbound" (
	"wamid" text PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_inbound_wamid_length" CHECK (length("whatsapp_inbound"."wamid") between 1 and 200),
	CONSTRAINT "whatsapp_inbound_phone_shape" CHECK ("whatsapp_inbound"."phone" ~ '^[1-9][0-9]{6,14}$')
);
--> statement-breakpoint
CREATE TABLE "whatsapp_link_codes" (
	"code_sha256" text PRIMARY KEY NOT NULL,
	"merchant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "whatsapp_link_codes_sha256_hex" CHECK ("whatsapp_link_codes"."code_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "whatsapp_link_codes_expiry" CHECK ("whatsapp_link_codes"."expires_at" > "whatsapp_link_codes"."created_at")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"merchant_id" uuid NOT NULL,
	"code_sha256" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_links_code_once" UNIQUE("code_sha256"),
	CONSTRAINT "whatsapp_links_phone_shape" CHECK ("whatsapp_links"."phone" ~ '^[1-9][0-9]{6,14}$')
);
--> statement-breakpoint
ALTER TABLE "owner_change_outcomes" ADD CONSTRAINT "owner_change_outcomes_change_id_owner_changes_id_fk" FOREIGN KEY ("change_id") REFERENCES "public"."owner_changes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_changes" ADD CONSTRAINT "owner_changes_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_changes" ADD CONSTRAINT "owner_changes_rule_id_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_changes" ADD CONSTRAINT "owner_changes_wamid_whatsapp_inbound_wamid_fk" FOREIGN KEY ("wamid") REFERENCES "public"."whatsapp_inbound"("wamid") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_link_codes" ADD CONSTRAINT "whatsapp_link_codes_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_links" ADD CONSTRAINT "whatsapp_links_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_links" ADD CONSTRAINT "whatsapp_links_code_sha256_whatsapp_link_codes_code_sha256_fk" FOREIGN KEY ("code_sha256") REFERENCES "public"."whatsapp_link_codes"("code_sha256") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "owner_changes_merchant_id_idx" ON "owner_changes" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE INDEX "whatsapp_link_codes_merchant_id_idx" ON "whatsapp_link_codes" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "whatsapp_links_phone_idx" ON "whatsapp_links" USING btree ("phone","linked_at");--> statement-breakpoint
CREATE INDEX "whatsapp_links_merchant_id_idx" ON "whatsapp_links" USING btree ("merchant_id","linked_at");