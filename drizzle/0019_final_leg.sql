-- Who may deal with whom. Existing merchants stay listed; new website signups wait for review.
ALTER TABLE merchants ADD COLUMN visibility text NOT NULL DEFAULT 'listed' CONSTRAINT merchants_visibility_known CHECK (visibility IN ('listed', 'pending', 'sandbox'));
--> statement-breakpoint
ALTER TABLE agents ADD COLUMN scope text NOT NULL DEFAULT 'standard' CONSTRAINT agents_scope_known CHECK (scope IN ('standard', 'sandbox'));
--> statement-breakpoint
CREATE TABLE rate_limits (
  bucket text NOT NULL,
  key text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL,
  PRIMARY KEY (bucket, key, window_start)
);
--> statement-breakpoint
CREATE FUNCTION take_rate_limit(p_bucket text, p_key text, p_limit integer, p_window_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  started timestamptz := to_timestamp(floor(extract(epoch FROM clock_timestamp()) / p_window_seconds) * p_window_seconds);
  taken integer;
BEGIN
  DELETE FROM rate_limits WHERE window_start < clock_timestamp() - interval '2 days';
  INSERT INTO rate_limits AS r (bucket, key, window_start, count)
    VALUES (p_bucket, p_key, started, 1)
    ON CONFLICT (bucket, key, window_start) DO UPDATE SET count = r.count + 1 WHERE r.count < p_limit
    RETURNING count INTO taken;
  RETURN taken IS NOT NULL AND taken <= p_limit;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION take_rate_limit(text, text, integer, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION take_rate_limit(text, text, integer, integer) TO backfill_app;
--> statement-breakpoint
CREATE FUNCTION mint_sandbox_agent(p_id text, p_token_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_id !~ '^sandbox-[0-9a-f-]{36}$' OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid sandbox agent' USING ERRCODE = 'check_violation', CONSTRAINT = 'sandbox_agent_input';
  END IF;
  INSERT INTO public.agents(id, label, token_sha256, scope) VALUES (p_id, 'Website sandbox', p_token_hash, 'sandbox');
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION mint_sandbox_agent(text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mint_sandbox_agent(text, text) TO backfill_app;
--> statement-breakpoint
-- Website signups wait for review, and a name cannot carry line breaks or other control characters.
CREATE OR REPLACE FUNCTION register_merchant(p_name text, p_token_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  merchant_id uuid;
  checked_at timestamptz;
BEGIN
  IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 120 OR p_name ~ '[[:cntrl:]  ]'
     OR p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid merchant registration'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'merchant_registration_input';
  END IF;
  -- Serialize website signups before counting, including across app instances.
  PERFORM pg_advisory_xact_lock(4152001);
  checked_at := clock_timestamp();
  IF (SELECT count(*) FROM public.merchants WHERE created_at >= checked_at - interval '1 hour') >= 100 THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.merchants(name, link_token_sha256, created_at, visibility)
    VALUES (btrim(p_name), p_token_hash, checked_at, 'pending') RETURNING id INTO merchant_id;
  RETURN merchant_id;
END
$$;
--> statement-breakpoint
-- A standard agent deals only with listed merchants, and a sandbox agent only with sandbox ones.
-- Only new commitments are checked, so history stays as it was.
CREATE FUNCTION commitments_scope_check() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  agent_scope text;
  merchant_visibility text;
BEGIN
  SELECT scope INTO agent_scope FROM agents WHERE id = NEW.agent_id;
  SELECT m.visibility INTO merchant_visibility FROM rules r JOIN merchants m ON m.id = r.merchant_id WHERE r.id = NEW.rule_id;
  IF NOT ((agent_scope = 'standard' AND merchant_visibility = 'listed') OR (agent_scope = 'sandbox' AND merchant_visibility = 'sandbox')) THEN
    RAISE EXCEPTION 'agent scope does not reach this merchant' USING ERRCODE = 'check_violation', CONSTRAINT = 'commitments_scope';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER commitments_scope BEFORE INSERT ON commitments FOR EACH ROW EXECUTE FUNCTION commitments_scope_check();
--> statement-breakpoint
ALTER TABLE commitments ENABLE ALWAYS TRIGGER commitments_scope;
