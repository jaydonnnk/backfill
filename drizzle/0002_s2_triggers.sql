-- Triggers Drizzle cannot express. Each is ENABLE ALWAYS, so session_replication_role = replica does
-- not switch it off. A table owner can still run ALTER TABLE ... DISABLE TRIGGER; nothing in the app
-- does.

-- Rules: a new rule starts at terms version 1, every change to the public terms bumps the version
-- by one, and the version is never set by hand. The hidden floor and capacity are not public terms,
-- so changing them never bumps the version and a buyer cannot infer a floor change from it.
CREATE FUNCTION rules_terms_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.terms_version := 1;
  ELSIF (NEW.weekday, NEW.start_minute, NEW.end_minute, NEW.commit_by_minute, NEW.list_price_cents, NEW.discount_bps, NEW.min_pool_covers, NEW.per_agent_cap_covers)
      IS DISTINCT FROM (OLD.weekday, OLD.start_minute, OLD.end_minute, OLD.commit_by_minute, OLD.list_price_cents, OLD.discount_bps, OLD.min_pool_covers, OLD.per_agent_cap_covers) THEN
    NEW.terms_version := OLD.terms_version + 1;
  ELSE
    NEW.terms_version := OLD.terms_version;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER rules_terms_version BEFORE INSERT OR UPDATE ON rules FOR EACH ROW EXECUTE FUNCTION rules_terms_version();
--> statement-breakpoint
ALTER TABLE rules ENABLE ALWAYS TRIGGER rules_terms_version;
--> statement-breakpoint

-- Commitments: refuse one whose terms version is not the rule's current version. The rule row is
-- read FOR SHARE, which waits for a concurrent terms change to commit, so a commitment cannot be
-- checked against a version that is being replaced. SECURITY DEFINER because FOR SHARE needs UPDATE
-- on rules, which a role that only submits commitments should not hold.
CREATE FUNCTION commitments_require_current_terms() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  current_version integer;
BEGIN
  SELECT terms_version INTO current_version FROM rules WHERE id = NEW.rule_id FOR SHARE;
  IF current_version IS DISTINCT FROM NEW.terms_version THEN
    RAISE EXCEPTION 'commitment accepts terms version %, but the rule is at version %', NEW.terms_version, current_version
      USING ERRCODE = 'check_violation', CONSTRAINT = 'commitments_terms_current';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER commitments_require_current_terms BEFORE INSERT OR UPDATE OF rule_id, terms_version ON commitments FOR EACH ROW EXECUTE FUNCTION commitments_require_current_terms();
--> statement-breakpoint
ALTER TABLE commitments ENABLE ALWAYS TRIGGER commitments_require_current_terms;
--> statement-breakpoint

-- Ledger: append-only. Row triggers refuse UPDATE and DELETE and a statement trigger refuses
-- TRUNCATE, including a TRUNCATE that cascades from another table. Triggers bind the owner and the
-- superuser too, which grants alone would not.
CREATE FUNCTION ledger_refuse_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ledger is append-only: % refused', TG_OP USING ERRCODE = 'restrict_violation';
END
$$;
--> statement-breakpoint
CREATE TRIGGER ledger_append_only BEFORE UPDATE OR DELETE ON ledger FOR EACH ROW EXECUTE FUNCTION ledger_refuse_change();
--> statement-breakpoint
CREATE TRIGGER ledger_no_truncate BEFORE TRUNCATE ON ledger FOR EACH STATEMENT EXECUTE FUNCTION ledger_refuse_change();
--> statement-breakpoint
ALTER TABLE ledger ENABLE ALWAYS TRIGGER ledger_append_only;
--> statement-breakpoint
ALTER TABLE ledger ENABLE ALWAYS TRIGGER ledger_no_truncate;
