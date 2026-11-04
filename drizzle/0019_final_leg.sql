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
