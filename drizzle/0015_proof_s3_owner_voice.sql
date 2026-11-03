-- Local S3 schema only. Applying it to any persistent environment requires separate approval.
CREATE TABLE owner_voice_edits (
  id uuid PRIMARY KEY,
  merchant_id uuid NOT NULL REFERENCES merchants(id),
  rule_id uuid NOT NULL REFERENCES rules(id),
  terms_version integer NOT NULL CHECK (terms_version > 0),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  proposal_attempts integer NOT NULL DEFAULT 0 CHECK (proposal_attempts BETWEEN 0 AND 30),
  phase text NOT NULL CHECK (phase IN ('transcribing','transcribed','reviewed','proposing','proposed','failed','cancelled','applied','superseded')),
  audio_sha256 text NOT NULL CHECK (audio_sha256 ~ '^[a-f0-9]{64}$'),
  audio_duration_ms integer NOT NULL CHECK (audio_duration_ms BETWEEN 1 AND 60000),
  sample_rate integer NOT NULL CHECK (sample_rate IN (16000,24000)),
  source text NOT NULL CHECK (source IN ('fixture','provider')),
  voice_model text NOT NULL,
  wonder_model text NOT NULL,
  raw_transcript text CHECK (length(raw_transcript) BETWEEN 1 AND 500),
  transcript text CHECK (length(transcript) BETWEEN 1 AND 500),
  provider_session_id text,
  provider_duration_ms integer CHECK (provider_duration_ms >= 0),
  audio_cost_nano_usd bigint CHECK (audio_cost_nano_usd >= 0),
  reviewed_at timestamptz,
  proposal_id uuid REFERENCES owner_changes(id),
  proposal_output jsonb,
  before jsonb NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  approved_at timestamptz,
  approved_version integer,
  CHECK (expires_at > created_at),
  CHECK ((phase = 'applied') = (approved_at IS NOT NULL AND approved_version IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX owner_voice_edits_owner_rule ON owner_voice_edits(merchant_id, rule_id, created_at);
--> statement-breakpoint
ALTER TABLE owner_changes ALTER COLUMN wamid DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE owner_changes ADD COLUMN voice_edit_id uuid REFERENCES owner_voice_edits(id), ADD COLUMN transcript_revision integer;
--> statement-breakpoint
ALTER TABLE owner_changes ADD CONSTRAINT owner_changes_source CHECK (
  (wamid IS NOT NULL AND voice_edit_id IS NULL AND transcript_revision IS NULL)
  OR (wamid IS NULL AND voice_edit_id IS NOT NULL AND transcript_revision IS NOT NULL AND transcript_revision > 0)
), ADD CONSTRAINT owner_changes_voice_revision_once UNIQUE(voice_edit_id, transcript_revision);
--> statement-breakpoint
-- Identity and the audio receipt cannot be moved to another owner/offer after upload.
CREATE FUNCTION guard_owner_voice_edit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r rules%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO r FROM rules WHERE id = NEW.rule_id;
    IF r.id IS NULL OR r.merchant_id <> NEW.merchant_id OR r.terms_version <> NEW.terms_version
      OR NEW.before IS DISTINCT FROM jsonb_build_object('discountBps',r.discount_bps,'capacityCovers',r.capacity_covers,'minPoolCovers',r.min_pool_covers,'perAgentCapCovers',r.per_agent_cap_covers) THEN
      RAISE EXCEPTION 'voice edit owner or version mismatch' USING ERRCODE='check_violation', CONSTRAINT='owner_voice_identity';
    END IF;
  ELSE
    IF (NEW.id,NEW.merchant_id,NEW.rule_id,NEW.terms_version,NEW.audio_sha256,NEW.audio_duration_ms,NEW.sample_rate,NEW.source,NEW.voice_model,NEW.wonder_model,NEW.before,NEW.created_at,NEW.expires_at)
        IS DISTINCT FROM (OLD.id,OLD.merchant_id,OLD.rule_id,OLD.terms_version,OLD.audio_sha256,OLD.audio_duration_ms,OLD.sample_rate,OLD.source,OLD.voice_model,OLD.wonder_model,OLD.before,OLD.created_at,OLD.expires_at)
        OR (OLD.raw_transcript IS NOT NULL AND (NEW.raw_transcript,NEW.provider_session_id,NEW.provider_duration_ms,NEW.audio_cost_nano_usd) IS DISTINCT FROM (OLD.raw_transcript,OLD.provider_session_id,OLD.provider_duration_ms,OLD.audio_cost_nano_usd)) THEN
      RAISE EXCEPTION 'voice edit provenance is immutable' USING ERRCODE='check_violation', CONSTRAINT='owner_voice_identity';
    END IF;
    IF OLD.phase IN ('applied','cancelled','superseded') THEN
      RAISE EXCEPTION 'voice edit is already resolved' USING ERRCODE='check_violation', CONSTRAINT='owner_voice_resolved';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER owner_voice_edit_guard BEFORE INSERT OR UPDATE ON owner_voice_edits FOR EACH ROW EXECUTE FUNCTION guard_owner_voice_edit();
--> statement-breakpoint
CREATE FUNCTION guard_voice_owner_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v owner_voice_edits%ROWTYPE;
BEGIN
  IF NEW.voice_edit_id IS NOT NULL THEN
    SELECT * INTO v FROM owner_voice_edits WHERE id = NEW.voice_edit_id FOR UPDATE;
    IF v.id IS NULL OR v.phase <> 'proposing' OR v.merchant_id <> NEW.merchant_id OR v.rule_id <> NEW.rule_id OR v.terms_version <> NEW.terms_version OR v.revision <> NEW.transcript_revision OR v.transcript IS DISTINCT FROM NEW.message_text OR v.wonder_model <> NEW.model OR v.expires_at IS DISTINCT FROM NEW.expires_at THEN
      RAISE EXCEPTION 'proposal does not match reviewed voice edit' USING ERRCODE='check_violation', CONSTRAINT='owner_voice_proposal_binding';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER voice_owner_change_binding BEFORE INSERT ON owner_changes FOR EACH ROW EXECUTE FUNCTION guard_voice_owner_change();
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON owner_voice_edits TO backfill_app;
--> statement-breakpoint
CREATE TRIGGER owner_voice_no_delete BEFORE DELETE ON owner_voice_edits FOR EACH ROW EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
CREATE TRIGGER owner_voice_no_truncate BEFORE TRUNCATE ON owner_voice_edits FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
ALTER TABLE owner_voice_edits ENABLE ALWAYS TRIGGER owner_voice_edit_guard;
--> statement-breakpoint
ALTER TABLE owner_voice_edits ENABLE ALWAYS TRIGGER owner_voice_no_delete;
--> statement-breakpoint
ALTER TABLE owner_voice_edits ENABLE ALWAYS TRIGGER owner_voice_no_truncate;
--> statement-breakpoint
ALTER TABLE owner_changes ENABLE ALWAYS TRIGGER voice_owner_change_binding;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION apply_owner_change(p_merchant_id uuid, p_change_id uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  o owner_changes%ROWTYPE;
  r rules%ROWTYPE;
  version integer;
  v owner_voice_edits%ROWTYPE;
BEGIN
  SELECT * INTO o FROM owner_changes WHERE id = p_change_id;
  IF o.voice_edit_id IS NOT NULL THEN
    SELECT * INTO v FROM owner_voice_edits WHERE id = o.voice_edit_id FOR UPDATE;
    IF v.phase = 'applied' AND v.proposal_id = o.id AND v.merchant_id = p_merchant_id THEN
      RETURN v.approved_version;
    END IF;
    IF v.id IS NULL OR v.merchant_id IS DISTINCT FROM p_merchant_id OR v.rule_id IS DISTINCT FROM o.rule_id OR v.terms_version IS DISTINCT FROM o.terms_version
      OR v.phase <> 'proposed' OR v.revision IS DISTINCT FROM o.transcript_revision OR v.proposal_id IS DISTINCT FROM o.id OR v.transcript IS DISTINCT FROM o.message_text THEN
      RAISE EXCEPTION 'voice review has changed or was cancelled' USING ERRCODE='check_violation', CONSTRAINT='apply_owner_change_voice';
    END IF;
  END IF;
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
  IF r.terms_version <> o.terms_version OR (o.voice_edit_id IS NOT NULL AND v.before IS DISTINCT FROM jsonb_build_object('discountBps',r.discount_bps,'capacityCovers',r.capacity_covers,'minPoolCovers',r.min_pool_covers,'perAgentCapCovers',r.per_agent_cap_covers)) THEN
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
  IF o.voice_edit_id IS NOT NULL THEN
    UPDATE owner_voice_edits SET phase='applied', approved_at=now(), approved_version=version WHERE id=o.voice_edit_id;
  END IF;
  RETURN version;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION apply_owner_change(uuid, uuid) FROM PUBLIC;
