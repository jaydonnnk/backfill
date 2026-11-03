# Revised S1 transaction journey

Local offline proof, 2026-11-03. Base revision
`a8c224fa9a9249bb8f850237d1011267c62af7dd`; local branch
`backfill/proof-s1-journey`. Changes are uncommitted. This is revised proof-build
S1, not the historical S1 tracer bullet. Implementation decisions were recorded
before coding in [decisions.md](decisions.md).

## Actual results

Both frozen scenarios completed twice, each repetition in a freshly migrated,
disposable local database. Both scenarios also passed through a production
server in Chromium, using real merchant publication and owner application forms.

- Success: four separately authenticated two-person parties. All remained
  pending before the deadline. Settlement stored one unlocked clearing,
  four fills totaling **8 covers**, and exactly four matching ledger entries.
  List value S$54.40; simulated accepted total S$43.52; buyer savings S$10.88.
  The savings split remains 100% buyer, zero agent/network share.
- Insufficient: three separately authenticated two-person parties. All remained
  pending before the deadline. Settlement stored one locked clearing,
  **0 filled covers**, no discounted booking/fill, no ledger entry and no
  sellout proposal. The merchant screen showed "Pool not reached".
- Repeating every submission's idempotency key returned the original commitment.
  Repeated settlement, dashboard and MCP status reads produced no extra
  commitments, clearings, fills or ledger entries. Ledger reconciliation had
  no missing, mismatched or orphaned entries.
- Every party had a separate agent ID and bearer credential. One party's attempt
  to read another's commitment returned `not_found`. Credentials stayed in
  memory; evidence records identities and commitment IDs, never tokens.
- The Wonder fixture stored a valid proposal while terms remained v1,
  discount 20%, capacity 8. A different merchant could not apply it. A distinct
  scripted owner approval applied v2, discount 15%, capacity 10. The browser
  used the existing "Apply plan" button. Reapplication stored no duplicate.
  Existing policy returns `stale` for another application after this discount
  change; capacity-only historical cases can return `already_applied`.
- Public MCP replies and the public ledger passed privacy assertions excluding
  floor fields, capacity fields, credentials and owner rationale. Wonder's
  input memory excluded the private floor. No public product code changed.

## Fixtures and real paths

[Frozen fixtures](../../../../../tests/support/proof-s1.ts): synthetic kaya toast
S$4.50 plus kopi S$2.30, list S$6.80, offer S$5.44, minimum/capacity 8,
per-agent cap 2, private fixture floor S$5.03. Scripted approvals authorize two
covers per party at a maximum S$5.44 each. The menu image bytes are a PNG
signature, not a genuine photographed menu or demonstrated vision extraction.

The service proof injects the existing clock dependency: Tuesday 2026-11-03,
09:00 Singapore time before noon; settlement at 12:00:01; visit 14:00-17:00.
Database-generated `createdAt`/`clearedAt` timestamps still use the actual wall
clock; they are not the injected business clock. The browser uses the app's real
wall clock and a near-future deadline; its exact date/window are in
[browser-receipt.json](browser-receipt.json).

Actual paths: `readMenu` with a deterministic extraction result, `getDraft`,
`publishDraft`/SQL `publish_offer`, independently authenticated streamable HTTP
MCP submissions, `settleDue` and status-triggered clearing, stored clearing/fills
and ledger, `replanSoldOut` with a deterministic Wonder result, then
`applyPlan`/SQL `apply_wonder_plan`. No alternate booking implementation exists.
The service MCP transport routes through the real HTTP handler in process;
Chromium proof uses the actual listening `/mcp` route.

## Reproduce

Prerequisites: existing npm dependencies and Chromium, Node 24, local PostgreSQL
at `127.0.0.1:5432`, permission to create/drop disposable databases and runtime
roles. No install, model key or real env file is needed.

```sh
npm run typecheck
npm run lint
env -u DATABASE_URL -u META_API_KEY -u AI_GATEWAY_API_KEY \
  TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres \
  S1_EVIDENCE_DIR=docs/plans/backfill-proof/evidence/s1-journey npm test
env -u DATABASE_URL -u META_API_KEY -u AI_GATEWAY_API_KEY \
  TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres \
  node --import tsx scripts/verification/proof-s1-browser.ts
git diff --check
```

The browser launcher copies source into a fresh temporary directory, excluding
all `.env*` files, Git and build output. It builds with webpack, dummy model
configuration pointing to `model.invalid`, and an explicit environment allowlist.
It selects a local port and starts its own production server. It does not use
the legacy S95 paths/ports/switches. Runtime connections use a unique login
that belongs only to `backfill_app`; admin access is limited to provisioning.
Disposable databases/roles and the owned server are removed in `finally`.
Temporary source/build snapshots contain no real env files and remain under
the operating system temporary directory for inspection.

The browser fixture requires same-day room for a one-hour window; it deliberately
refuses the last hour of the Singapore day. This is a proof-run limitation,
not an application policy change.

## Verification evidence

- Baseline: clean expected HEAD; typecheck, lint and 469 tests in 45 files passed.
  The initial sandbox attempt failed on local PostgreSQL/IPC permissions; the
  permitted rerun passed. No application failure was inferred from that denial.
- [Final full suite](full-tests.txt): **471 tests in 46 files passed**.
- [First complete service repetition](service-run-1.json) and
  [second repetition](service-run-2.json): actual stored rows, identities,
  scripted approvals, reconciliation and before/after rule states.
- [Production webpack build](production-build.txt),
  [Chromium result](browser-test.txt), [owned server log](browser-server.txt)
  and [browser state receipt](browser-receipt.json).
- [Typecheck](typecheck.txt) and [lint](lint.txt) passed. New source/config
  files also passed whitespace checks. Independent review found no remaining
  blocking issue after the local database guard correction.
- Actual captures: [success pending](browser-success-pending.png),
  [insufficient pending](browser-insufficient-pending.png),
  [unapproved desktop](browser-success-unapproved-1280.png),
  [unapproved mobile](browser-success-unapproved-375.png),
  [success after owner approval](browser-success-final.png),
  [insufficient final](browser-insufficient-final.png).
  The 375/1280 checks found no horizontal overflow. No browser errors were emitted.
- [Cleanup audit](cleanup.json): no S1 disposable databases or runtime roles
  remained. [SHA256SUMS](SHA256SUMS) binds the retained evidence and new source.
- [Missing test URL rejection](missing-test-url-rejected.txt) is an intentional
  negative run, exit 1. It fails before the shared database helper can load an
  env file. The final successful suite uses the explicit local URL.
- Independent code review found a missing local-only setup guard in the new
  integration proof. It was corrected before final verification. Initial new
  tooling type/import errors and an incorrect duplicate-application assertion
  were corrected. No production defect or domain-rule change was needed.

## Evidence limits and stop

Menu extraction, buyer choices/approvals and Wonder output are authored
synthetic fixtures. Browser owner actions are scripted too. They do not prove
fresh Spark/Wonder decisions, four real customers, real customer approval,
merchant validation, payments, attendance, recovered revenue or AI superiority.
All evidence here is local. Model-call tables remained empty in both proof
paths. Historical `scene.json` was not reused or changed. No real `.env.local`
was read, copied or edited. No Gateway example, record mode or provider inference
was run. No commit, merge, push, deployment, production access or later slice
was performed. S2 and all later model/media/evaluation work remain unstarted.
