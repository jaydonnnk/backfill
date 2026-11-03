# Revised S1 implementation decisions

2026-11-03. User authorized local implementation and verification of revised
proof-build S1 only. Baseline `a8c224fa9a9249bb8f850237d1011267c62af7dd`, clean
`main`; 469 tests, typecheck and lint passed. No publication authority transfers.

- Reuse onboarding, authenticated MCP, deadline clearing, savings ledger and
  Wonder application. Add missing journey proof; change domain policy only if
  a demonstrated defect requires it. Preserve Kopi and historical recordings.
- Frozen menu fixture: kaya toast S$4.50 plus kopi S$2.30, one cover S$6.80.
  Initial offer: 20% off, S$5.44 per cover, minimum 8, capacity 8, per-agent
  cap 2, private floor S$5.03. Four distinct parties of two succeed; three
  distinct parties of two fail. Buyer maximum is S$5.44 per cover.
- Frozen service clock: Tuesday 2026-11-03, 09:00 before a noon deadline,
  visit window 14:00-17:00 Singapore time. Settle at 12:00:01. Browser proof
  uses a near-future deadline on its actual run date, recording those values.
- Wonder fixture: discount 15%, capacity 10, minimum 8, cap 2. Store via
  replanSoldOut; assert terms v1 remain unchanged, then separately approve
  with applyPlan or the authenticated owner form and verify terms v2.
- Fixtures substitute only menu extraction, buyer choice/approval and Wonder
  proposal. Approvals are scripted, not real customers or fresh model output.
  Preserve 100% buyer savings, zero agent/network share. Checkout is simulated;
  no payment, attendance or recovered revenue is established.
- Repeat complete service proof twice, each in a fresh migrated disposable
  local database and restricted runtime role. Browser proof uses an isolated
  source snapshot without any real .env file, dummy model configuration and
  its own disposable database/server. No S95 fixed paths or old recording.
- Persist only non-credential evidence. No API requests, secrets, real
  .env.local access, production data, commit, merge, push, deploy or S2 work.

Verification progress and exact commands/results are recorded in README.md
and generated receipts after execution. The initial sandbox test attempt was
blocked by local PostgreSQL/IPC permissions; the permitted rerun passed.
