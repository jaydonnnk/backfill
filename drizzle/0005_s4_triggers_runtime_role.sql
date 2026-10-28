-- S4 triggers and the runtime role. Each trigger is ENABLE ALWAYS, like S2's.

-- Commitments stay as they were made. The only change allowed is a cancel: cancelled_at goes from
-- NULL to a time, once. Once an occurrence is cleared, its commitments are binding: no new
-- commitment for it and no cancel. The trigger's name sorts after commitments_require_current_terms,
-- so that trigger runs first and holds the rule FOR SHARE; clearing takes the rule FOR UPDATE, so an
-- insert racing a clearing waits for it and then sees the stored clearing here. The deadline itself
-- is checked by the app, which can be given a clock in tests. SECURITY DEFINER, like the terms
-- check, so the check does not depend on what the inserting role may read.
CREATE FUNCTION commitments_until_cleared() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.id, NEW.rule_id, NEW.agent_id, NEW.idempotency_key, NEW.terms_version, NEW.covers, NEW.max_price_per_cover_cents, NEW.visit_at, NEW.committed_at)
        IS DISTINCT FROM (OLD.id, OLD.rule_id, OLD.agent_id, OLD.idempotency_key, OLD.terms_version, OLD.covers, OLD.max_price_per_cover_cents, OLD.visit_at, OLD.committed_at) THEN
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
CREATE TRIGGER commitments_until_cleared BEFORE INSERT OR UPDATE ON commitments FOR EACH ROW EXECUTE FUNCTION commitments_until_cleared();
--> statement-breakpoint
ALTER TABLE commitments ENABLE ALWAYS TRIGGER commitments_until_cleared;
--> statement-breakpoint

-- Stored clearings are final: row triggers refuse UPDATE and DELETE for every role, and a statement
-- trigger refuses TRUNCATE on clearing_fills. clearings needs no TRUNCATE trigger of its own:
-- clearing_fills references it, so a TRUNCATE without CASCADE is refused by the foreign key and one
-- with CASCADE reaches clearing_fills' trigger.
CREATE FUNCTION refuse_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % refused', TG_TABLE_NAME, TG_OP USING ERRCODE = 'restrict_violation';
END
$$;
--> statement-breakpoint
CREATE TRIGGER clearings_append_only BEFORE UPDATE OR DELETE ON clearings FOR EACH ROW EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
CREATE TRIGGER clearing_fills_append_only BEFORE UPDATE OR DELETE ON clearing_fills FOR EACH ROW EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
CREATE TRIGGER clearing_fills_no_truncate BEFORE TRUNCATE ON clearing_fills FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
ALTER TABLE clearings ENABLE ALWAYS TRIGGER clearings_append_only;
--> statement-breakpoint
ALTER TABLE clearing_fills ENABLE ALWAYS TRIGGER clearing_fills_append_only;
--> statement-breakpoint
ALTER TABLE clearing_fills ENABLE ALWAYS TRIGGER clearing_fills_no_truncate;
--> statement-breakpoint

-- Clearing holds the rule FOR UPDATE, so it waits for every commitment insert that holds the rule
-- FOR SHARE. FOR UPDATE needs UPDATE on rules, which the runtime role must not have, so it takes the
-- lock through this function. The lock belongs to the caller's transaction.
CREATE FUNCTION lock_rule_for_clearing(rule uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM rules WHERE id = rule FOR UPDATE);
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION lock_rule_for_clearing(uuid) FROM PUBLIC;
--> statement-breakpoint

-- The runtime role: the least the web app needs, so it no longer connects as the table owner. It
-- cannot log in; a login role that is a member of it is created by hand (on Neon, in the console)
-- and its URL becomes the app's DATABASE_URL. Roles are cluster-wide, so an existing one is kept.
-- No DELETE or TRUNCATE anywhere, no UPDATE except a commitment's cancelled_at, and nothing on the
-- ledger until S8 writes it.
DO $$
BEGIN
  CREATE ROLE backfill_app NOLOGIN;
EXCEPTION WHEN duplicate_object OR unique_violation THEN
  NULL;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO backfill_app;
--> statement-breakpoint
GRANT SELECT ON merchants, rules, agents TO backfill_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON commitments, clearings, clearing_fills, llm_calls TO backfill_app;
--> statement-breakpoint
GRANT UPDATE (cancelled_at) ON commitments TO backfill_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION lock_rule_for_clearing(uuid) TO backfill_app;
