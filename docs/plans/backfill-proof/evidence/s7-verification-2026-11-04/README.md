# S7 verification complete locally, 2026-11-04

All required local S7 checks pass. The [acceptance audit](audit.json) verifies the
receipts, exact source hashes, historical evidence and resource cleanup. This is
scripted local proof, not customer demand, consent, payment, attendance, revenue
or model superiority. S8 is unstarted; production migrations and deployment are
outside this publication.

## Results and scope

- Fresh [lint](publication-01/lint.txt), [typecheck](publication-01/typecheck.txt)
  and [607 tests across 72 files](publication-01/suite.txt) pass.
- [Twelve offline call/transport guards](publication-01/guards.txt) pass.
- The exact declared [npm run build](build-diagnosis-01/final-declared/copied-installed-dependencies.txt)
  passes with 115 unchanged source/assets/configuration files. No product file,
  schema, dependency version or pricing policy changed.
- Two independent full browser runs pass 24/24 each, with zero retries and fresh
  databases, roles, ports and source copies. [Pass 02](../s5-local-2026-11-04/s7-verification-2026-11-04-pass-02/)
  and [pass 03](../s5-local-2026-11-04/s7-verification-2026-11-04-pass-03/) retain
  complete test/service receipts, source manifests, build/test logs and cleanup.
  Their exact source/verification inputs still match the final working tree.
- S6 [audit](publication-01/s6-audit.txt), [24-outcome replay](publication-01/s6-replay.txt)
  and [S6b check](publication-01/s6b.txt) pass. All 594 historical evidence files
  have unchanged hashes. The negative AI result and no-winner outcome stand.

The [pre-execution matrix](acceptance-matrix.json) records the original plan.
[Acceptance results](acceptance-results.json) record completion. The browser runs
precede the build-runner correction; they were not repeated during publication
because their product and verification inputs are unchanged. Fresh non-browser
gates were run during publication. Main checkpoint is
`545fd0c23b2f0411d8f45b10dab54b88c3e0845f`, plus the published verification changes.

## Build failure and correction

The earlier default build failure was a verification-copy defect. Node's default
`fs.cp` resolved `.bin/next` to the original repository, mixing its renderer with
the snapshot's React. Preserving symlinks fixes the owning layer. The corrected
runner also checks the CLI target. [Diagnosis](build-diagnosis-01/README.md),
[primary earlier failures](retained-failure-logs.json) and
[chronological failures/fixes](failures-and-fixes.json) preserve the failed results.
KopiProvider, fonts and product configuration needed no workaround.

Both browser runs separately passed real-source Webpack and fixture-boundary
Webpack builds. The declared build is a separate, real-source Turbopack result.
The [font fixture](font-transport/provenance.json) supplies existing cached bytes
at the transport boundary; its paths are portable through `__dirname`.

## What the journeys prove

S1 publishes through owner UI and commits through authenticated MCP with real
wall-clock deadlines. Four two-cover parties settle eight covers and four ledger
entries, with SGD10.88 simulated savings. Three parties settle zero covers, with
no fills or ledger entries. Repeated calls preserve idempotency.

S4 is a separate offer. At 1280px and 375px, a snapshot-only model dependency
throws a segmentation failure. Owner UI shows the failure; four independently
reviewed and explicitly approved buyer commitments then complete through MCP on
that same unchanged offer. Settlement confirms eight covers. This settlement uses
an injected clock. S2/S3/S5 use separate offers for public trails, refusal,
corrections, ownership, private media and exact asset review. The evidence does
not imply one single all-feature journey.

Models, silence WAVs, menu inputs and geometric media are authored fixtures.
Normal actions/services, authentication, MCP, SQL guards and settlement execute
unchanged. Missing genuine-model evidence remains missing.

## Evidence retention and cleanup

The [retention inventory](retention.json) records 455 original evidence files.
340 redundant files, including 80 screenshots and generated server bundles, are
retained in a hash-verified local archive under ignored `archive/`. They are not
available in a fresh clone. Eight [reviewed screenshots](screenshot-review.json)
and both complete browser result sets remain directly inspectable. Twenty-four
individual HTTP receipts per run are consolidated into `http-receipts.json` with
their original paths and byte hashes. Original command history remains in
[commands.json](commands.json); paths omitted from Git resolve through the local
retention inventory. [Resource receipts](resource-receipts.json) preserve the
original owned-resource records.

No credentials or environment file were loaded. Commands used an allowlisted
environment, explicit loopback TEST_DATABASE_URL, dummy app credentials,
model.invalid, server transport blocking and browser request isolation. All owned
source copies, servers, databases and roles were removed; unrelated baseline
resources remain intact. No install, provider call, production access, production migration
or deployment occurred. Publication was explicitly authorized by the user after
the local diagnosis. The commit uses `[skip render]`.

## Reproduce locally

Use an allowlisted shell environment with PATH/HOME/TMPDIR,
NEXT_TELEMETRY_DISABLED=1 and
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres. Do not load .env.local
or run a bare build/start in the repository. Fresh gate commands and their exact
environment names are in `publication-01/*-command.json`.

Run `node_modules/.bin/tsx scripts/verification/proof-s7-build.ts` with a fresh
child directory under this evidence root. For browser verification, run
`node_modules/.bin/tsx scripts/verification/proof-s5-browser.ts` with S5_OUTPUT_DIR
set to a fresh child under `evidence/s5-local-2026-11-04/` and no S5_TEST_GREP.
The runner creates disposable local resources and uses the retained font fixture.
Run `node scripts/verification/proof-s7-audit.mjs` with the explicit test URL to
reconcile this saved acceptance package. It verifies omitted local files when the
archive is present and discloses archive absence on a fresh clone.
