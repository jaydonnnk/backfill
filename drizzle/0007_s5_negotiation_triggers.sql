-- S5 triggers and grants for negotiation. Each trigger is ENABLE ALWAYS, like S2's and S4's.

-- A commitment stays as it was made, now including the counter-offer it took: the only change is
-- still a cancel. Replaces the S4 function with the two S5 columns added to the fixed tuple.
CREATE OR REPLACE FUNCTION commitments_until_cleared() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.id, NEW.rule_id, NEW.agent_id, NEW.idempotency_key, NEW.terms_version, NEW.covers, NEW.max_price_per_cover_cents, NEW.visit_at, NEW.committed_at, NEW.negotiation_id, NEW.negotiated_price_cents)
        IS DISTINCT FROM (OLD.id, OLD.rule_id, OLD.agent_id, OLD.idempotency_key, OLD.terms_version, OLD.covers, OLD.max_price_per_cover_cents, OLD.visit_at, OLD.committed_at, OLD.negotiation_id, OLD.negotiated_price_cents) THEN
      RAISE EXCEPTION 'a commitment can only be cancelled, never changed'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'commitments_cancel_only';
    END IF;
    IF OLD.cancelled_at IS NOT NULL OR NEW.cancelled_at IS NULL THEN
      RAISE EXCEPTION 'a commitment is cancelled once and never restored'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'commitments_cancel_once';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM clearings WHERE rule_id = NEW.rule_id AND visit_date = (NEW.visit_at AT TIME ZONE 'Asia/Singapore')::date) THEN
    RAISE EXCEPTION 'the occurrence is already cleared'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'commitments_occurrence_cleared';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint

-- A commitment that names a negotiation must be that negotiation's own: the same agent, rule, terms
-- version, occurrence and covers, at the price of its latest round. So no price the model proposed
-- and the domain refused, and no earlier round's price, can become a commitment, whatever the app
-- does. SECURITY DEFINER, so the check does not depend on what the inserting role may read.
CREATE FUNCTION commitments_negotiated_match() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  n negotiations%ROWTYPE;
  latest integer;
BEGIN
  IF NEW.negotiation_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO n FROM negotiations WHERE id = NEW.negotiation_id;
  SELECT counter_cents INTO latest FROM negotiation_rounds WHERE negotiation_id = NEW.negotiation_id ORDER BY round DESC LIMIT 1;
  IF n.agent_id IS DISTINCT FROM NEW.agent_id OR n.rule_id IS DISTINCT FROM NEW.rule_id OR n.terms_version IS DISTINCT FROM NEW.terms_version
      OR n.visit_date IS DISTINCT FROM (NEW.visit_at AT TIME ZONE 'Asia/Singapore')::date OR n.covers IS DISTINCT FROM NEW.covers
      OR latest IS DISTINCT FROM NEW.negotiated_price_cents THEN
    RAISE EXCEPTION 'the commitment does not match its negotiation''s latest counter-offer'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'commitments_negotiated_match';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER commitments_negotiated_match BEFORE INSERT ON commitments FOR EACH ROW EXECUTE FUNCTION commitments_negotiated_match();
--> statement-breakpoint
ALTER TABLE commitments ENABLE ALWAYS TRIGGER commitments_negotiated_match;
--> statement-breakpoint

-- Rounds run 1, 2, 3 in order with no gap, and the merchant's price never rises from one round to
-- the next. The round limit itself is the table's check.
CREATE FUNCTION negotiation_rounds_in_order() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  last_round integer;
  last_counter integer;
BEGIN
  SELECT round, counter_cents INTO last_round, last_counter FROM negotiation_rounds WHERE negotiation_id = NEW.negotiation_id ORDER BY round DESC LIMIT 1;
  IF NEW.round <> COALESCE(last_round, 0) + 1 THEN
    RAISE EXCEPTION 'negotiation rounds run in order'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'negotiation_rounds_in_order';
  END IF;
  IF last_counter IS NOT NULL AND NEW.counter_cents > last_counter THEN
    RAISE EXCEPTION 'the merchant''s price never rises'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'negotiation_rounds_never_rise';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER negotiation_rounds_in_order BEFORE INSERT ON negotiation_rounds FOR EACH ROW EXECUTE FUNCTION negotiation_rounds_in_order();
--> statement-breakpoint
ALTER TABLE negotiation_rounds ENABLE ALWAYS TRIGGER negotiation_rounds_in_order;
--> statement-breakpoint

-- Negotiations and their rounds are a record: refuse_change (from 0005) refuses UPDATE, DELETE and
-- TRUNCATE for every role.
CREATE TRIGGER negotiations_append_only BEFORE UPDATE OR DELETE ON negotiations FOR EACH ROW EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
CREATE TRIGGER negotiations_no_truncate BEFORE TRUNCATE ON negotiations FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
CREATE TRIGGER negotiation_rounds_append_only BEFORE UPDATE OR DELETE ON negotiation_rounds FOR EACH ROW EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
CREATE TRIGGER negotiation_rounds_no_truncate BEFORE TRUNCATE ON negotiation_rounds FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
ALTER TABLE negotiations ENABLE ALWAYS TRIGGER negotiations_append_only;
--> statement-breakpoint
ALTER TABLE negotiations ENABLE ALWAYS TRIGGER negotiations_no_truncate;
--> statement-breakpoint
ALTER TABLE negotiation_rounds ENABLE ALWAYS TRIGGER negotiation_rounds_append_only;
--> statement-breakpoint
ALTER TABLE negotiation_rounds ENABLE ALWAYS TRIGGER negotiation_rounds_no_truncate;
--> statement-breakpoint

-- The runtime role starts negotiations and records rounds; it never changes or removes either.
GRANT SELECT, INSERT ON negotiations, negotiation_rounds TO backfill_app;
