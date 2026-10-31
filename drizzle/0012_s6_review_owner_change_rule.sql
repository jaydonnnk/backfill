-- S6 and S6b review fix F1: apply_owner_change checked that the change was filed under the calling
-- merchant but not that the rule it names is that merchant's, so a change row written by the runtime
-- role with another merchant's rule id changed that merchant's offer. The function now also requires
-- the rule's own merchant, as apply_wonder_plan does. Its grants are kept by CREATE OR REPLACE.
CREATE OR REPLACE FUNCTION apply_owner_change(p_merchant_id uuid, p_change_id uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  o owner_changes%ROWTYPE;
  r rules%ROWTYPE;
  version integer;
BEGIN
  SELECT * INTO o FROM owner_changes WHERE id = p_change_id;
  SELECT * INTO r FROM rules WHERE id = o.rule_id FOR UPDATE;
  IF o.id IS NULL OR o.merchant_id IS DISTINCT FROM p_merchant_id OR r.merchant_id IS DISTINCT FROM p_merchant_id THEN
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
  IF o.discount_bps NOT BETWEEN 1 AND 9999 OR o.capacity_covers > 10000
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
