# Revised S2 decision and approval trail

Local offline demonstrator, 2026-11-03. Base HEAD
`a8c224fa9a9249bb8f850237d1011267c62af7dd`, branch
`backfill/proof-s1-journey`. This records the local proof before publication.
The user subsequently accepted S2 and authorized commit/push to main on
2026-11-03. [Decisions](decisions.md) preceded code.
Historical S1-S10 are a different build sequence.

## What changed

The existing Kopi `/demo` now has an expandable trail per party. It shows the
public synthetic request, actual authored bounded covers/reason output or an
unavailable state, proposal terms, approval status, submitted commitment ID,
immutable accepted terms, and stored pending/filled/not-filled result.
Proposal-only records have no commitment and reserve no seats. Every record
names its run, party, rule, version and occurrence; commitment IDs join the
same stored transaction. Disconnected/malformed evidence cannot supply an
approval or output for another party. Unknown historical records stay unknown.

An append-only `demo_trails` table holds opt-in public fixture evidence. The
web runtime can read it but cannot insert, update, delete or truncate it.
The local operator fixture writer is in `tests/support/proof-s2.ts`. There is
no new customer consent endpoint. Expanding the UI inspects existing evidence;
it does not grant approval or submit a booking.

A database trigger captures accepted price at insertion, under the rule lock.
It overrides caller-supplied values and refuses later changes. It uses the
same merchant-favouring cent rounding as the booking engine. Existing rows
are not backfilled from current prices. Their accepted price stays unavailable.
This adds evidence, not a new clearing or pricing policy.

## Approval assurance

Only `scripted_local_demo` is supported as an affirmative source in this slice.
It establishes that the local script explicitly authorized the exact run,
party, rule, version, visit date, covers, per-cover price and total recorded
in the fixture. Proposal/approval timestamps must precede submission. The
bounded output must select those covers. Final terms come from the actual
commitment, never the proposal. Every approval mismatch loses the scripted
matching label. Missing evidence receives no approval label.

The fixture writer stores this attestation after it receives the commitment ID.
Its proposed/approved times are script-supplied values: frozen service time or
a browser-test timestamp captured before submission. They are not separately
authenticated consent events or independent proof of timing. The assurance is
limited to the script declaring authorization for those exact terms. Negative
evidence fixtures deliberately omit or mismatch that declaration; stored fills
are never treated as proof of consent.

This is **not real-person consent**, identity verification, OAuth assurance,
fresh Muse approval or production consent enforcement. MCP's existing
instruction to seek agreement is not an approval record. Existing MCP clients
without these fixture records show unavailable evidence; S2 does not claim
that their commitments were human-approved.

## Verified result

496 unit/integration tests in 49 files passed. Typecheck, lint, production
webpack build and all 11 Chromium checks passed. The same final product code
passed three fresh browser runs. Logs and receipts retain the stated capture
limitation for the first two passes; the top-level final run has corrected captures and in-test PNG-width
assertions. All 12 final image widths match their filenames. No horizontal
overflow was found at 375 or 1280. No uncaught page errors occurred. One
expected PostgreSQL permission error appears in the final server log during
the deliberate interruption. The two earlier incomplete attempts remain errors.

The success pool contains four commitments of two, with 8 filled covers and
S$10.88 simulated savings after settlement. The insufficient pool contains
three commitments of two, with zero filled covers and zero savings. All
commitments were pending before the deadline, including the eight-cover pool.
The additional proposal-only fixture adds no commitment or confirmed covers.

Actual captures: [success desktop](demo-4-settled-1280.png),
[success mobile](demo-4-settled-375.png),
[insufficient desktop](demo-3-settled-1280.png),
[insufficient mobile](demo-3-settled-375.png),
[success pending](demo-4-pending-375.png),
[insufficient pending](demo-3-pending-375.png),
[database interruption](demo-feed-interrupted.png),
[offline](demo-feed-disconnected.png),
[recovered](demo-feed-recovered.png),
[malformed feed](demo-malformed-feed.png).
[PNG audit](screenshot-audit.json) records actual image widths.

[Build source proof](build-source-proof.json) checks 137 runtime/build inputs
against all three final isolated source snapshots. The latest browser test copy
also matches the frozen workspace test. [Cleanup](cleanup.json) confirms
PostgreSQL 18.6 and no remaining proof databases/roles; the launcher awaited
owned server exit. Temporary source snapshots remain for inspection.
[Inherited preservation](inherited-preservation.json) verifies the inherited
S1 sources/evidence. Only the authorized status update changes its starting
bytes. [SHA256SUMS](SHA256SUMS) binds final source and retained evidence.

## Verification and provenance

- [Full suite](full-tests.txt), [typecheck](typecheck.txt), [lint](lint.txt).
- Complete inherited S1 service workflow twice from fresh disposable databases:
  [repetition 1](service-run-1.json), [repetition 2](service-run-2.json).
  Four commitments of two fill 8 covers; three commitments of two fill 0.
  Both stay pending before deadline; retries/read repetitions add no duplicates.
- [S2 stored-record proof](service-trail.json) retains separate run/party/rule
  identities, exact proposed and committed terms, approval classifications,
  pending and settled snapshots, plus unchanged v1 final terms after the
  owner's v2 price change. Unit tests cover every matching field, missing
  approval, instruction-only data, late approval and missing output. Another
  real-database test submits v2 at S$5.78 with old v1/S$5.44 approval and rejects
  that approval label. A disconnected party record remains unavailable.
- Public snapshot filters all merchant plan rationale, including deliberate
  private-floor canaries. HTML and actual SSE payloads are checked too.
  Fixtures are labeled fixtures; a model name alone gives no model-provenance
  claim. A Wonder replay does not establish buyer-decision provenance.
- [Production webpack build](production-build.txt),
  [Chromium journeys](browser-test.txt), [browser receipt](browser-receipt.json),
  [owned server log](browser-server.txt), [launcher](browser-launcher.txt).
  S1 merchant review/publication, authenticated MCP, settlement, reconciliation
  and separate owner approval are rerun alongside actual `/demo` S2 inspection
  and the existing nine Kopi lifecycle checks. S1 captures/receipt are in
  [s1-combined-browser](s1-combined-browser/browser-receipt.json).
- Feed proof removes the runtime's SELECT permission on the trail table,
  observes stale last-saved results, restores permission and observes recovery.
  Chromium offline/online checks preserve the saved view and reconnect without
  a fresh celebration. A supplemental malformed SSE feed cannot replace the
  server-rendered stored view. Invalid/inconsistent snapshots are rejected.
- [Missing URL refusal](missing-url-rejected.txt) and
  [nonlocal URL refusal](nonlocal-url-rejected.txt) are intentional negative
  runs. The shared database helper now rejects missing/nonlocal configuration
  before any env-file fallback. No real env file was accessed.

Initial regressions were demonstrated before fixes:
[public rationale leak and malformed-feed live label](regressions-red.txt),
[inconsistent fills](feed-inconsistent-red.txt), and
[malformed-feed close losing stale state](feed-error-after-malformed-red.txt).
[Attempt 01](attempt-01/browser-test.txt) retained the offline-detection failure.
[Attempt 02](attempt-02/browser-test.txt) proved offline/recovery but retained
the malformed-close failure. These are incomplete attempts, not passing proof.
Final receipts are the top-level files. Earlier passing browser logs/receipts
remain in final-run-1 and final-run-2. Their six-cover settled captures named
375 were actually taken at 1280. Run 2 had already loaded the old capture test
before the edit. Those captures are not mobile proof. Redundant screenshots
from these runs and the two incomplete attempts were moved to the ignored
local archive `archive/proof-s2-redundant-captures-2026-11-03/` before publication.
The archive retains their hashes and the original pre-publication manifest.
All final captures, original S1 evidence, failure logs and structured receipts
remain in Git. The corrected final capture
explicitly sets the viewport before each screenshot. Early full-suite failures were stale
assertions for removed public rationale and inferred buyer provenance; those
assertions now require filtering and uncertainty. No failing check is counted
as a pass.

## Reproduce

Use existing Node 24 dependencies, Chromium and PostgreSQL 18.6 at
127.0.0.1:5432. No API key, install, provider call or real env file is needed.

```sh
npm run typecheck
npm run lint
env -u DATABASE_URL -u META_API_KEY -u AI_GATEWAY_API_KEY \
  TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres \
  S1_EVIDENCE_DIR=docs/plans/backfill-proof/evidence/s2-decision-trail \
  S2_EVIDENCE_DIR=docs/plans/backfill-proof/evidence/s2-decision-trail npm test
env -u DATABASE_URL -u META_API_KEY -u AI_GATEWAY_API_KEY \
  TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres \
  node --import tsx scripts/verification/proof-s2-browser.ts
git diff --check
```

The S2 launcher reuses the S1 isolation pattern and unchanged S1 browser test.
It excludes `.env*`, uses dummy `model.invalid` configuration, builds with
webpack in an isolated source snapshot and starts an owned dynamic-port server.
It uses a disposable migrated database and a unique `backfill_app` login.
The retained `proof_s1_browser` database-name prefix allows the unchanged S1
browser guard to run. Server/database/role cleanup runs in `finally`.
The browser uses its actual clock and refuses the last hour of the Singapore
day. Frozen service clocks and database wall-clock audit timestamps are distinct.

## Limits and stop

All requests, bounded buyer outputs, menu/Wonder proposals and approvals are
authored synthetic fixtures or scripted actions. No original historical
`scene.json` decisions were attributed to the new four-party pool. No fresh
Spark/Wonder inference, real customers, payments, attendance, merchant validation
or recovered revenue is established. Checkout is simulated. There are four
commitments totaling eight covers in the success case, not eight bookings.
Insufficient demand is deliberate correct policy behavior, not market evidence.

The isolated server and databases are disposable, so these records do not seed
or change any existing developer/production database. New migrations were
verified only in disposable local databases. Deploying/migrating a persistent
environment remains outside this authorization. Merchant validation and video
belong to the user. All eight Meta tools/models remain required by the overall
plan; their remaining integrations are not completed here. No S3, model/media,
evaluation, submission, manual deployment or persistent database migration is
authorized by the subsequent Git publication approval.
