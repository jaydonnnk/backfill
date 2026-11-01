# S8 verification evidence

S8 is local on `backfill/slice-8-ledger-checkout`, based on published S7 `7cdbb56`. The user approved implementation and scoped production writes, with 100% buyer savings and zero agent/network fees. S8 main integration and Render deployment remain pending. No production migration or backfill has been performed.

## Local behavior

The current full suite has 417 tests in 41 files. Typecheck, lint and diffcheck pass. The production build succeeded in a git archive without local configuration. Application source has not changed since the successful real HTTP smoke; later changes strengthen tests and evidence.

`http-smoke.mjs` runs a production Next server against a disposable local PostgreSQL as a login member of `backfill_app`. Its results are in `http-smoke.json`: unauthorized 401, create 201, complete/retrieve 200, unsupported method 405, accepted total 1876 cents, buyer savings 624 cents, zero other shares, exactly one ledger and receipt, and zero model attempts. Repeated completion returns the same receipt. The merchant's server-rendered HTML includes its ledger totals. Browser interaction and hosted behavior were not verified.

The smoke command ran from an empty temporary working directory with a minimal environment and explicit `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres`. Its child server received only disposable runtime configuration and an unreachable model endpoint. A second empty-cwd invocation without the test URL refused before database creation. No local secret configuration was read.

## Mutation proof

`mutations.json` defines 88 isolated faults. The existing runner at `../s1-review/mutate.mjs` applies each to a git archive, runs the full suite, restores every changed file byte-identical, and reruns the full suite. A valid result requires an AssertionError kill, no file errors, a byte-identical restore and a green restored run.

`results.json` accepts all 88 faults: 88 AssertionError kills, 88 byte-identical restores, 88 green restored full-suite runs and zero file errors. Every accepted fault includes an AssertionError in an S8 test. Every full-suite baseline is 417 tests.

The initial 83-trial diagnostic is retained in `results-initial.json`; it is not acceptance evidence. Five receipt checks failed as generic promise errors and five restored runs hit local PostgreSQL connection exhaustion. The complete 88-trial run was repeated with `VITEST_MAX_WORKERS=2`, preserving concurrency inside each commitment/receipt test. All restored runs then passed, but five receipt checks still used generic matcher type errors. Explicit boolean assertions corrected their failure class. Six receipt faults were independently rerun against that final harness, each with an AssertionError kill and a green restored full suite.

`results-bounded-run.json` retains the complete resource-limited run. `results-receipt-confirmation.json` records the six stricter confirmations. The accepted file replaces those six entries with their final confirmations. Application bytes are identical across both proof stages; the only later harness change is the receipt assertion style. `source-manifest.json` records both harness commits. The earlier unsuccessful trials remain disclosed rather than counted as valid proof.

Reproduce in a secret-free archive with the existing installed dependencies copied into it:

    env -i PATH="$PATH" HOME="$archive" NODE_ENV=test VITEST_MAX_WORKERS=2 TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres node docs/plans/backfill/evidence/s1-review/mutate.mjs "$archive" docs/plans/backfill/evidence/s8-ledger/mutations.json /tmp/s8-results.json

Never copy local configuration into the archive. The tests' real CLI children use their own empty temporary cwd and minimal environment. Migration snapshots and package-lock.json are not inspected.

`source-manifest.json` pins the application, test and migration inputs and the unchanged frozen recording. Migrations 0000 through 0012 and both S7 screenshots remain unchanged.

## Review

`review.md` records the independent source review and its single P2 finding. The completed-checkout deadline regression reproduced on AssertionError, then passed after ownership and immutable receipt reads were moved ahead of mutable status reads. The reviewer did not claim a second review of that fix or a hosted acceptance.

## Production preflight and limits

`production-preflight.json` is a repeatable-read, read-only Neon inventory obtained through the existing CLI sign-in, with no connection string or credentials emitted. It found 13 migrations, 3 merchants, 5 rules, 25 commitments, 3 clearings, 14 fills, zero ledger entries, 2 plans and 4 existing model-call rows. Protected merchant, rule, commitment and agent fingerprints are recorded for comparison before and after an eventual rollout.

`historical-sources.json` prepares only the two documented S7 Demo Cafe occurrences. It binds the recorded rule IDs and ownership, hash-verified recording economics and committed buyer identities to the read-only inventory. Current rule/clearing versions match. There is no database audit of historical merchant reassignment; any drift from these pins requires refusing the backfill.

Expected after the unapplied backfill: 14 entries, 32 covers, 21760 cents list value, 17408 cents accepted total, 4352 cents buyer savings, and zero agent/network shares. These are computed expectations, not existing ledger balances. The original Muse pool and other merchants are excluded.

Migration 0013's completeness trigger requires the S8 writer. Applying it while the old Render writer is active would reject new clearings. Coordinate main publication, migration and deployment before exercising production clearing. The bounded backfill must run under its source checks and verify the protected fingerprints and counts afterward. A normal authenticated merchant browser can trigger pre-existing Wonder auto-replanning; no live merchant browser check is authorized here.
