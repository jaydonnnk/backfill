-- Local-only S5. Production migration requires separate authorization.
CREATE TABLE creative_assets (
  id uuid PRIMARY KEY,
  merchant_id uuid NOT NULL REFERENCES merchants(id),
  rule_id uuid NOT NULL REFERENCES rules(id),
  terms_version integer NOT NULL CHECK (terms_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  record jsonb NOT NULL CHECK (octet_length(record::text) <= 40000000)
);
--> statement-breakpoint
CREATE INDEX creative_assets_owner_rule ON creative_assets(merchant_id, rule_id, created_at);
--> statement-breakpoint
REVOKE ALL ON creative_assets FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON creative_assets TO backfill_app;
--> statement-breakpoint
-- Match S3's immutable provenance/identity and resolved-decision protection.
CREATE FUNCTION guard_creative_asset() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE k text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'creative records are retained' USING ERRCODE='check_violation', CONSTRAINT='creative_resolved';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.record->>'phase' IS DISTINCT FROM 'source'
       OR NEW.record->'approval' IS DISTINCT FROM 'null'::jsonb
       OR NEW.record->'cutoutApproval' IS DISTINCT FROM 'null'::jsonb
       OR NEW.record->'composed' IS DISTINCT FROM 'null'::jsonb THEN
      RAISE EXCEPTION 'creative upload must start without approval' USING ERRCODE='check_violation', CONSTRAINT='creative_initial';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.merchant_id, NEW.rule_id, NEW.terms_version, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.merchant_id, OLD.rule_id, OLD.terms_version, OLD.created_at)
     OR (NEW.record - ARRAY['phase','mask','cutout','background','composed','cutoutApproval','approval','reason','segmentReservedAt','backgroundReservedAt'])
        IS DISTINCT FROM (OLD.record - ARRAY['phase','mask','cutout','background','composed','cutoutApproval','approval','reason','segmentReservedAt','backgroundReservedAt']) THEN
    RAISE EXCEPTION 'creative identity and provenance are immutable' USING ERRCODE='check_violation', CONSTRAINT='creative_identity';
  END IF;
  IF OLD.record->>'phase' IN ('approved','rejected','failed') AND NEW.record IS DISTINCT FROM OLD.record THEN
    RAISE EXCEPTION 'creative decision is resolved' USING ERRCODE='check_violation', CONSTRAINT='creative_resolved';
  END IF;
  FOREACH k IN ARRAY ARRAY['mask','cutout','background','composed','cutoutApproval','approval','segmentReservedAt','backgroundReservedAt'] LOOP
    IF OLD.record->k IS NOT NULL AND OLD.record->k <> 'null'::jsonb AND NEW.record->k IS DISTINCT FROM OLD.record->k THEN
      RAISE EXCEPTION 'creative media and reservations are immutable' USING ERRCODE='check_violation', CONSTRAINT='creative_artifact';
    END IF;
  END LOOP;
  IF NEW.record->>'phase' = 'approved' AND (
     OLD.record->>'phase' <> 'review' OR NEW.record->'approval'->>'sha256' IS NULL
     OR NEW.record->'approval'->>'sha256' IS DISTINCT FROM NEW.record->'composed'->>'sha256') THEN
    RAISE EXCEPTION 'creative approval must bind reviewed bytes' USING ERRCODE='check_violation', CONSTRAINT='creative_approval';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER creative_asset_guard BEFORE INSERT OR UPDATE OR DELETE ON creative_assets
FOR EACH ROW EXECUTE FUNCTION guard_creative_asset();
