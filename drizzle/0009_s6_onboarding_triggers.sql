-- S6 triggers, functions and grants for onboarding and the Wonder merchant agent. Each trigger is
-- ENABLE ALWAYS, like S2's, S4's and S5's.
-- A draft's list price is the sum of its cover items' printed prices, recomputed here from the
-- stored draft, so no price the model did not print can reach a rule.
CREATE FUNCTION menu_drafts_price_matches() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  total bigint;
  wanted integer;
  distinct_wanted integer;
  found integer;
BEGIN
  IF NEW.verdict <> 'ok' THEN
    RETURN NEW;
  END IF;
  -- A negative index would count from the end of the array, so it finds no item here.
  SELECT count(*), count(DISTINCT idx.i), count(item), sum((item ->> 'priceCents')::bigint)
    INTO wanted, distinct_wanted, found, total
    FROM jsonb_array_elements_text(NEW.draft -> 'cover' -> 'itemIndexes') AS idx(i)
    LEFT JOIN LATERAL (SELECT CASE WHEN idx.i::integer >= 0 THEN NEW.draft -> 'items' -> (idx.i::integer) END AS item) AS picked ON true;
  IF NEW.draft ->> 'currency' IS DISTINCT FROM 'SGD' OR wanted = 0 OR distinct_wanted <> wanted OR found <> wanted
      OR total IS DISTINCT FROM NEW.list_price_cents THEN
    RAISE EXCEPTION 'the list price must be the sum of the cover''s printed prices'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'menu_drafts_price_matches';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER menu_drafts_price_matches BEFORE INSERT ON menu_drafts FOR EACH ROW EXECUTE FUNCTION menu_drafts_price_matches();
--> statement-breakpoint
ALTER TABLE menu_drafts ENABLE ALWAYS TRIGGER menu_drafts_price_matches;
--> statement-breakpoint
-- Publishing a confirmed draft: the rule takes the draft's list price, never one the caller names,
-- and the publication records which draft made it. SECURITY DEFINER, so the runtime role can
-- publish without INSERT on rules; a draft publishes at most once (the publication's primary key).
CREATE FUNCTION publish_offer(
  p_merchant_id uuid, p_draft_id uuid, p_rule_id uuid, p_capacity_covers integer, p_weekday smallint, p_start_minute smallint,
  p_end_minute smallint, p_commit_by_minute smallint, p_discount_bps integer, p_min_pool_covers integer, p_per_agent_cap_covers integer,
  p_floor_price_cents integer
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d menu_drafts%ROWTYPE;
BEGIN
  SELECT * INTO d FROM menu_drafts WHERE id = p_draft_id;
  IF d.id IS NULL OR d.merchant_id IS DISTINCT FROM p_merchant_id OR d.verdict <> 'ok' THEN
    RAISE EXCEPTION 'only the merchant''s own counted draft can be published'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'publish_offer_draft';
  END IF;
  IF d.list_price_cents - (d.list_price_cents::bigint * p_discount_bps / 10000) < p_floor_price_cents THEN
    RAISE EXCEPTION 'the floor must not be above the offer price'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'publish_offer_floor';
  END IF;
  INSERT INTO rules (id, merchant_id, list_price_cents, capacity_covers, weekday, start_minute, end_minute, commit_by_minute, discount_bps, min_pool_covers, per_agent_cap_covers, floor_price_cents)
    VALUES (p_rule_id, p_merchant_id, d.list_price_cents, p_capacity_covers, p_weekday, p_start_minute, p_end_minute, p_commit_by_minute, p_discount_bps, p_min_pool_covers, p_per_agent_cap_covers, p_floor_price_cents);
  INSERT INTO offer_publications (draft_id, rule_id, merchant_id) VALUES (p_draft_id, p_rule_id, p_merchant_id);
  RETURN p_rule_id;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION publish_offer(uuid, uuid, uuid, integer, smallint, smallint, smallint, smallint, integer, integer, integer, integer) FROM PUBLIC;
--> statement-breakpoint
-- Applying a Wonder plan: only an "ok" plan, by the rule's own merchant, to the terms version it was
-- planned against, within the same bounds as judgePlan, and only while no live commitment is
-- pending on the rule, since a terms change would leave it on stale terms. Once per plan (the
-- application's primary key). Returns the rule's terms version after the change.
CREATE FUNCTION apply_wonder_plan(p_merchant_id uuid, p_plan_id uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  p wonder_plans%ROWTYPE;
  r rules%ROWTYPE;
  version integer;
BEGIN
  SELECT * INTO p FROM wonder_plans WHERE id = p_plan_id;
  SELECT * INTO r FROM rules WHERE id = p.rule_id FOR UPDATE;
  IF p.id IS NULL OR r.merchant_id IS DISTINCT FROM p_merchant_id THEN
    RAISE EXCEPTION 'no such plan for this merchant'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'apply_wonder_plan_owner';
  END IF;
  IF p.verdict <> 'ok' THEN
    RAISE EXCEPTION 'only a plan that counted can be applied'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'apply_wonder_plan_verdict';
  END IF;
  IF r.terms_version <> p.terms_version THEN
    RAISE EXCEPTION 'the rule changed since the plan was made'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'apply_wonder_plan_stale';
  END IF;
  IF p.discount_bps > r.discount_bps OR p.capacity_covers < r.capacity_covers OR p.capacity_covers > 2 * r.capacity_covers
      OR p.min_pool_covers < r.min_pool_covers OR p.min_pool_covers > p.capacity_covers OR p.per_agent_cap_covers < 1
      OR p.per_agent_cap_covers > p.capacity_covers
      OR r.list_price_cents - (r.list_price_cents::bigint * p.discount_bps / 10000) < r.floor_price_cents THEN
    RAISE EXCEPTION 'the plan is outside the re-plan bounds'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'apply_wonder_plan_bounds';
  END IF;
  IF EXISTS (
    SELECT 1 FROM commitments c
    WHERE c.rule_id = r.id AND c.cancelled_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM clearings k WHERE k.rule_id = c.rule_id AND k.visit_date = (c.visit_at AT TIME ZONE 'Asia/Singapore')::date)
  ) THEN
    RAISE EXCEPTION 'commitments are pending on the rule'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'apply_wonder_plan_pending';
  END IF;
  INSERT INTO plan_applications (plan_id) VALUES (p_plan_id);
  UPDATE rules SET discount_bps = p.discount_bps, capacity_covers = p.capacity_covers, min_pool_covers = p.min_pool_covers, per_agent_cap_covers = p.per_agent_cap_covers
    WHERE id = r.id RETURNING terms_version INTO version;
  RETURN version;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION apply_wonder_plan(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
-- Drafts, publications, plans and applications are a record: refuse_change (from 0005) refuses
-- UPDATE, DELETE and TRUNCATE for every role.
CREATE TRIGGER menu_drafts_append_only BEFORE UPDATE OR DELETE ON menu_drafts FOR EACH ROW EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
CREATE TRIGGER menu_drafts_no_truncate BEFORE TRUNCATE ON menu_drafts FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
CREATE TRIGGER offer_publications_append_only BEFORE UPDATE OR DELETE ON offer_publications FOR EACH ROW EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
CREATE TRIGGER offer_publications_no_truncate BEFORE TRUNCATE ON offer_publications FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
CREATE TRIGGER wonder_plans_append_only BEFORE UPDATE OR DELETE ON wonder_plans FOR EACH ROW EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
CREATE TRIGGER wonder_plans_no_truncate BEFORE TRUNCATE ON wonder_plans FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
CREATE TRIGGER plan_applications_append_only BEFORE UPDATE OR DELETE ON plan_applications FOR EACH ROW EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
CREATE TRIGGER plan_applications_no_truncate BEFORE TRUNCATE ON plan_applications FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
ALTER TABLE menu_drafts ENABLE ALWAYS TRIGGER menu_drafts_append_only;
--> statement-breakpoint
ALTER TABLE menu_drafts ENABLE ALWAYS TRIGGER menu_drafts_no_truncate;
--> statement-breakpoint
ALTER TABLE offer_publications ENABLE ALWAYS TRIGGER offer_publications_append_only;
--> statement-breakpoint
ALTER TABLE offer_publications ENABLE ALWAYS TRIGGER offer_publications_no_truncate;
--> statement-breakpoint
ALTER TABLE wonder_plans ENABLE ALWAYS TRIGGER wonder_plans_append_only;
--> statement-breakpoint
ALTER TABLE wonder_plans ENABLE ALWAYS TRIGGER wonder_plans_no_truncate;
--> statement-breakpoint
ALTER TABLE plan_applications ENABLE ALWAYS TRIGGER plan_applications_append_only;
--> statement-breakpoint
ALTER TABLE plan_applications ENABLE ALWAYS TRIGGER plan_applications_no_truncate;
--> statement-breakpoint
-- The runtime role records drafts and plans and reads all four tables; it publishes and applies only
-- through the two functions, and still has no INSERT or UPDATE on rules.
GRANT SELECT, INSERT ON menu_drafts, wonder_plans TO backfill_app;
--> statement-breakpoint
GRANT SELECT ON offer_publications, plan_applications TO backfill_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION publish_offer(uuid, uuid, uuid, integer, smallint, smallint, smallint, smallint, integer, integer, integer, integer) TO backfill_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION apply_wonder_plan(uuid, uuid) TO backfill_app;
