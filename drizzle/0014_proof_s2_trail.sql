-- No historical backfill: prices unknown at submission remain unknown.
ALTER TABLE commitments ADD COLUMN accepted_price_per_cover_cents integer CHECK (accepted_price_per_cover_cents >= 0);
--> statement-breakpoint
CREATE FUNCTION commitment_accepted_price() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.accepted_price_per_cover_cents IS DISTINCT FROM OLD.accepted_price_per_cover_cents THEN
      RAISE EXCEPTION 'accepted commitment price is immutable' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT COALESCE(NEW.negotiated_price_cents, (list_price_cents - (list_price_cents::bigint * discount_bps / 10000))::integer)
      INTO NEW.accepted_price_per_cover_cents FROM rules WHERE id = NEW.rule_id FOR SHARE;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER commitments_z_accepted_price BEFORE INSERT OR UPDATE ON commitments FOR EACH ROW EXECUTE FUNCTION commitment_accepted_price();
--> statement-breakpoint
ALTER TABLE commitments ENABLE ALWAYS TRIGGER commitments_z_accepted_price;
--> statement-breakpoint
CREATE TABLE demo_trails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES rules(id),
  party_id text NOT NULL REFERENCES agents(id),
  visit_date date NOT NULL,
  commitment_id uuid UNIQUE REFERENCES commitments(id),
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX demo_trails_occurrence_idx ON demo_trails(rule_id, visit_date);
--> statement-breakpoint
CREATE TRIGGER demo_trails_append_only BEFORE UPDATE OR DELETE ON demo_trails FOR EACH ROW EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
CREATE TRIGGER demo_trails_no_truncate BEFORE TRUNCATE ON demo_trails FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
ALTER TABLE demo_trails ENABLE ALWAYS TRIGGER demo_trails_append_only;
--> statement-breakpoint
ALTER TABLE demo_trails ENABLE ALWAYS TRIGGER demo_trails_no_truncate;
--> statement-breakpoint
-- Only the local operator provisions public fixture evidence. The web role cannot attest consent.
GRANT SELECT ON demo_trails TO backfill_app;
