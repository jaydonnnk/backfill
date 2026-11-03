-- S4 local-only migration. Persistent rollout requires separate approval.
CREATE TABLE buyer_sessions (
  id uuid PRIMARY KEY,
  party_id text NOT NULL REFERENCES agents(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  record jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX buyer_sessions_party_created ON buyer_sessions(party_id, created_at);
--> statement-breakpoint
REVOKE ALL ON buyer_sessions FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON buyer_sessions TO backfill_app;
