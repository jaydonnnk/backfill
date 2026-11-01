-- S8 only adds guards and grants. Historical fills are reconciled separately from proved sources.
-- Source economics must agree with the immutable fill and the rule locked by the clearing writer.
-- An old clearing with changed public terms cannot be reconstructed from current terms.
CREATE FUNCTION s8_ledger_source() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM 1
  FROM public.clearing_fills f
  JOIN public.commitments c ON c.id = f.commitment_id
  JOIN public.clearings k ON k.rule_id = f.rule_id AND k.visit_date = f.visit_date
  JOIN public.rules r ON r.id = f.rule_id
  WHERE f.commitment_id = NEW.commitment_id
    AND NEW.rule_id = f.rule_id AND NEW.merchant_id = r.merchant_id
    AND NEW.covers = f.covers AND NEW.price_per_cover_cents = f.price_per_cover_cents
    AND NEW.list_price_cents = r.list_price_cents
    AND r.terms_version = k.terms_version AND c.terms_version = k.terms_version
    AND c.rule_id = f.rule_id AND (c.visit_at AT TIME ZONE 'Asia/Singapore')::date = f.visit_date
    AND k.unlocked AND c.cancelled_at IS NULL AND f.covers <= c.covers
    AND f.price_per_cover_cents <= c.max_price_per_cover_cents
    AND f.price_per_cover_cents = COALESCE(c.negotiated_price_cents, k.price_per_cover_cents)
  FOR UPDATE OF r;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ledger does not match a verified fill' USING ERRCODE = 'check_violation', CONSTRAINT = 'ledger_source_match';
  END IF;
  IF NEW.agent_share_cents <> 0 OR NEW.network_share_cents <> 0 THEN
    RAISE EXCEPTION 'S8 commitments have no agent or network fees' USING ERRCODE = 'check_violation', CONSTRAINT = 'ledger_s8_no_fees';
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE TRIGGER zz_s8_ledger_source AFTER INSERT ON ledger FOR EACH ROW EXECUTE FUNCTION s8_ledger_source();
--> statement-breakpoint
ALTER TABLE ledger ENABLE ALWAYS TRIGGER zz_s8_ledger_source;
--> statement-breakpoint

-- Deferred so the existing writer can insert fills then ledger in its one transaction.
CREATE FUNCTION s8_fill_has_ledger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ledger WHERE commitment_id = NEW.commitment_id) THEN
    RAISE EXCEPTION 'a filled commitment needs its ledger entry' USING ERRCODE = 'check_violation', CONSTRAINT = 'fill_ledger_required';
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER s8_fill_has_ledger AFTER INSERT ON clearing_fills DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION s8_fill_has_ledger();
--> statement-breakpoint
ALTER TABLE clearing_fills ENABLE ALWAYS TRIGGER s8_fill_has_ledger;
--> statement-breakpoint

CREATE TABLE checkout_receipts (
  commitment_id uuid PRIMARY KEY,
  completed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT checkout_receipts_ledger_fk FOREIGN KEY (commitment_id) REFERENCES ledger(commitment_id)
);
--> statement-breakpoint
CREATE TRIGGER checkout_receipts_append_only BEFORE UPDATE OR DELETE ON checkout_receipts FOR EACH ROW EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
CREATE TRIGGER checkout_receipts_no_truncate BEFORE TRUNCATE ON checkout_receipts FOR EACH STATEMENT EXECUTE FUNCTION refuse_change();
--> statement-breakpoint
ALTER TABLE checkout_receipts ENABLE ALWAYS TRIGGER checkout_receipts_append_only;
--> statement-breakpoint
ALTER TABLE checkout_receipts ENABLE ALWAYS TRIGGER checkout_receipts_no_truncate;
--> statement-breakpoint
REVOKE ALL ON FUNCTION s8_ledger_source(), s8_fill_has_ledger() FROM PUBLIC;
--> statement-breakpoint
GRANT SELECT, INSERT ON ledger, checkout_receipts TO backfill_app;
