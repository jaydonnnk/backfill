CREATE TABLE "llm_calls" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "llm_calls_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"purpose" text NOT NULL,
	"attempt" integer NOT NULL,
	"tokens_in" integer NOT NULL,
	"tokens_cached_in" integer NOT NULL,
	"tokens_out" integer NOT NULL,
	"cost_nano_usd" bigint NOT NULL,
	"latency_ms" integer NOT NULL,
	"ok" boolean NOT NULL,
	"http_status" integer,
	"error" text,
	"output" text,
	CONSTRAINT "llm_calls_attempt_positive" CHECK ("llm_calls"."attempt" >= 1),
	CONSTRAINT "llm_calls_tokens_nonnegative" CHECK ("llm_calls"."tokens_in" >= 0 and "llm_calls"."tokens_cached_in" >= 0 and "llm_calls"."tokens_out" >= 0 and "llm_calls"."tokens_cached_in" <= "llm_calls"."tokens_in"),
	CONSTRAINT "llm_calls_cost_nonnegative" CHECK ("llm_calls"."cost_nano_usd" >= 0),
	CONSTRAINT "llm_calls_latency_nonnegative" CHECK ("llm_calls"."latency_ms" >= 0)
);
--> statement-breakpoint
CREATE INDEX "llm_calls_purpose_created_at_idx" ON "llm_calls" USING btree ("purpose","created_at");