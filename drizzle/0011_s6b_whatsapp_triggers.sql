-- Linking an owner's phone: the code must exist and be unexpired, and links the number to the
-- merchant that made the code. A code links once (the link's unique code hash). SECURITY DEFINER,
-- so the runtime role can link a number without INSERT on whatsapp_links. Returns the merchant id.
CREATE FUNCTION claim_whatsapp_link(p_code_sha256 text, p_phone text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  c whatsapp_link_codes%ROWTYPE;
BEGIN
  SELECT * INTO c FROM whatsapp_link_codes WHERE code_sha256 = p_code_sha256;
  IF c.code_sha256 IS NULL OR c.expires_at <= now() THEN
    RAISE EXCEPTION 'the link code is unknown or expired'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'claim_whatsapp_link_code';
  END IF;
  INSERT INTO whatsapp_links (phone, merchant_id, code_sha256) VALUES (p_phone, c.merchant_id, c.code_sha256);
  RETURN c.merchant_id;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION claim_whatsapp_link(text, text) FROM PUBLIC;
--> statement-breakpoint
-- Applying an owner's change after they confirmed it: only a change that counted, for the rule's own
-- merchant, still within its confirmation window, still the merchant's latest proposal, made against
-- the rule's current terms version, within the owner bounds (checked again here), and only while no
-- live commitment is pending on the rule, since a terms change would leave it on stale terms. Once
-- per change (the outcome's primary key). Returns the rule's terms version after the change.
CREATE FUNCTION apply_owner_change(p_merchant_id uuid, p_change_id uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  o owner_changes%ROWTYPE;
  r rules%ROWTYPE;
  version integer;
BEGIN
  SELECT * INTO o FROM owner_changes WHERE id = p_change_id;
  SELECT * INTO r FROM rules WHERE id = o.rule_id FOR UPDATE;
  IF o.id IS NULL OR o.merchant_id IS DISTINCT FROM p_merchant_id THEN
    RAISE EXCEPTION 'no such change for this merchant'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'apply_owner_change_owner';
  END IF;
  IF o.verdict <> 'ok' THEN
    RAISE EXCEPTION 'only a change that counted can be applied'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'apply_owner_change_verdict';
  END IF;
  IF o.expires_at <= now() THEN
    RAISE EXCEPTION 'the change expired before it was confirmed'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'apply_owner_change_expired';
  END IF;
  IF EXISTS (SELECT 1 FROM owner_changes n WHERE n.merchant_id = o.merchant_id AND n.created_at > o.created_at) THEN
    RAISE EXCEPTION 'a newer change replaced this one'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'apply_owner_change_superseded';
  END IF;
  IF r.terms_version <> o.terms_version THEN
    RAISE EXCEPTION 'the rule changed since the change was proposed'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'apply_owner_change_stale';
  END IF;
  IF o.discount_bps NOT BETWEEN 1 AND 9999 OR o.capacity_covers NOT BETWEEN 1 AND 10000
      OR o.min_pool_covers NOT BETWEEN 1 AND o.capacity_covers OR o.per_agent_cap_covers NOT BETWEEN 1 AND o.capacity_covers
      OR r.list_price_cents - (r.list_price_cents::bigint * o.discount_bps / 10000) < r.floor_price_cents THEN
    RAISE EXCEPTION 'the change is outside the owner bounds'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'apply_owner_change_bounds';
  END IF;
  IF EXISTS (
    SELECT 1 FROM commitments c
    WHERE c.rule_id = r.id AND c.cancelled_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM clearings k WHERE k.rule_id = c.rule_id AND k.visit_date = (c.visit_at AT TIME ZONE 'Asia/Singapore')::date)
  ) THEN
    RAISE EXCEPTION 'commitments are pending on the rule'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'apply_owner_change_pending';
  END IF;
  INSERT INTO owner_change_outcomes (change_id, outcome) VALUES (p_change_id, 'applied');
  UPDATE rules SET discount_bps = o.discount_bps, capacity_covers = o.capacity_covers, min_pool_covers = o.min_pool_covers, per_agent_cap_covers = o.per_agent_cap_covers
    WHERE id = r.id RETURNING terms_version INTO version;
  RETURN version;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION apply_owner_change(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
-- Cancelling an owner's change: only the merchant's own, and only once (the outcome's primary key).
CREATE FUNCTION cancel_owner_change(p_merchant_id uuid, p_change_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  o owner_changes%ROWTYPE;
BEGIN
  SELECT * INTO o FROM owner_changes WHERE id = p_change_id;
  IF o.id IS NULL OR o.merchant_id IS DISTINCT FROM p_merchant_id THEN
    RAISE EXCEPTION 'no such change for this merchant'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'cancel_owner_change_owner';
  END IF;
  INSERT INTO owner_change_outcomes (change_id, outcome) VALUES (p_change_id, 'cancelled');
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION cancel_owner_change(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
-- Link codes, links, inbound ids, proposed changes and their outcomes are a record: refuse_change
-- (from 0005) refuses UPDATE, DELETE and TRUNCATE for every role.
CREATE TRIGGER whatsapp_link_codes_append_only BEFORE UPDATE OR DELETE ON whatsapp_link_codes FOR EACH ROW EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
CREATE TRIGGER whatsapp_link_codes_no_truncate BEFORE TRUNCATE ON whatsapp_link_codes FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
CREATE TRIGGER whatsapp_links_append_only BEFORE UPDATE OR DELETE ON whatsapp_links FOR EACH ROW EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
CREATE TRIGGER whatsapp_links_no_truncate BEFORE TRUNCATE ON whatsapp_links FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
CREATE TRIGGER whatsapp_inbound_append_only BEFORE UPDATE OR DELETE ON whatsapp_inbound FOR EACH ROW EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
CREATE TRIGGER whatsapp_inbound_no_truncate BEFORE TRUNCATE ON whatsapp_inbound FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
CREATE TRIGGER owner_changes_append_only BEFORE UPDATE OR DELETE ON owner_changes FOR EACH ROW EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
CREATE TRIGGER owner_changes_no_truncate BEFORE TRUNCATE ON owner_changes FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
CREATE TRIGGER owner_change_outcomes_append_only BEFORE UPDATE OR DELETE ON owner_change_outcomes FOR EACH ROW EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
CREATE TRIGGER owner_change_outcomes_no_truncate BEFORE TRUNCATE ON owner_change_outcomes FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
ALTER TABLE whatsapp_link_codes ENABLE ALWAYS TRIGGER whatsapp_link_codes_append_only;
--> statement-breakpoint
ALTER TABLE whatsapp_link_codes ENABLE ALWAYS TRIGGER whatsapp_link_codes_no_truncate;
--> statement-breakpoint
ALTER TABLE whatsapp_links ENABLE ALWAYS TRIGGER whatsapp_links_append_only;
--> statement-breakpoint
ALTER TABLE whatsapp_links ENABLE ALWAYS TRIGGER whatsapp_links_no_truncate;
--> statement-breakpoint
ALTER TABLE whatsapp_inbound ENABLE ALWAYS TRIGGER whatsapp_inbound_append_only;
--> statement-breakpoint
ALTER TABLE whatsapp_inbound ENABLE ALWAYS TRIGGER whatsapp_inbound_no_truncate;
--> statement-breakpoint
ALTER TABLE owner_changes ENABLE ALWAYS TRIGGER owner_changes_append_only;
--> statement-breakpoint
ALTER TABLE owner_changes ENABLE ALWAYS TRIGGER owner_changes_no_truncate;
--> statement-breakpoint
ALTER TABLE owner_change_outcomes ENABLE ALWAYS TRIGGER owner_change_outcomes_append_only;
--> statement-breakpoint
ALTER TABLE owner_change_outcomes ENABLE ALWAYS TRIGGER owner_change_outcomes_no_truncate;
--> statement-breakpoint
-- The runtime role records link codes, inbound ids and proposed changes and reads all five tables;
-- it links a number, applies a change and cancels one only through the three functions.
GRANT SELECT, INSERT ON whatsapp_link_codes, whatsapp_inbound, owner_changes TO backfill_app;
--> statement-breakpoint
GRANT SELECT ON whatsapp_links, owner_change_outcomes TO backfill_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION claim_whatsapp_link(text, text) TO backfill_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION apply_owner_change(uuid, uuid) TO backfill_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cancel_owner_change(uuid, uuid) TO backfill_app;
