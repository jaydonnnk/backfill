CREATE FUNCTION register_merchant(p_name text, p_token_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  merchant_id uuid;
  checked_at timestamptz;
BEGIN
  IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 120
     OR p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid merchant registration'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'merchant_registration_input';
  END IF;
  -- Serialize website signups before counting, including across app instances.
  PERFORM pg_advisory_xact_lock(4152001);
  checked_at := clock_timestamp();
  IF (SELECT count(*) FROM public.merchants WHERE created_at >= checked_at - interval '1 hour') >= 30 THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.merchants(name, link_token_sha256, created_at)
    VALUES (btrim(p_name), p_token_hash, checked_at) RETURNING id INTO merchant_id;
  RETURN merchant_id;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION register_merchant(text, text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION register_merchant(text, text) TO backfill_app;
