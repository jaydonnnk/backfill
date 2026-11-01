# S8 local implementation and rollout handoff

## Current state

Repository: `/Users/jayd0/Desktop/meta-hack`. Branch: `backfill/slice-8-ledger-checkout`, based on published S7 `7cdbb56d5cd2b3ad0bcfa3fbf6cefe200f25661c`. Source and final test harness are at `2dda7bc`; subsequent commits contain evidence and records. Read Git for the final branch tip. `main` and `origin/main` remain at S7. S8 has not been pushed, deployed or applied to Neon.

The user authorized S7 merge/push, S8 and scoped production writes. Their split decision: "100% buyer, 0% agent, 0% network. Keep the split as explicit ledger fields (buyer/agent/network) so a fee policy can be added later for new commitments only. Do not apply fees to existing commitments." S8 main integration and Render rollout still need the named authorization required by the earlier handoff. Production-write authorization itself is already given. No model call, real payment, S9 or protected-record change is authorized.

## Implemented and verified locally

- Pure `src/domain/ledger/calculate.ts` constructs the explicit zero-fee split and merchant totals. The existing clearing transaction inserts each ledger entry at its fill's own price, including negotiated prices.
- Migration `0013_s8_ledger_checkout.sql` validates fill identity/economics, refuses fees, requires a ledger row at fill commit, adds append-only simulated receipts and grants only SELECT/INSERT to the runtime role. The migration journal is appended. Migrations 0000 through 0012 and all snapshots remain untouched.
- Authenticated ACP-shaped simulation subset: create, retrieve and complete under `/api/checkout_sessions`. It uses the commitment ID, refuses payment credentials, hides foreign IDs and private terms, and returns the same receipt on retries. No payment or ACP conformance claim.
- Merchant-authenticated dashboard totals and read-only reconciliation report missing, mismatched and orphan history. The bounded `backfillLedger` accepts explicit evidence pins, refuses drift/conflicts and rolls back the entire batch on failure. It never automatically repairs history from current prices.
- 417 tests in 41 files, typecheck, lint, diffcheck and a secret-free production build pass. Real local HTTP with the runtime role verified 401/201/200/405, one ledger entry, one receipt, accepted total 1876 cents, buyer savings 624 cents and zero model attempts. Merchant server HTML was checked; browser interaction was not.
- All 88 fault specifications have independent AssertionError kills, byte-identical restores, green restored full-suite runs and zero file errors. The initial unsuccessful proof run and final receipt assertion refinements are retained transparently in `evidence/s8-ledger/`.
- Independent source review found one P2: a changed deadline could hide a completed receipt. The regression failed, then passed after ownership and persisted ledger/receipt reads moved ahead of mutable status reads. No other actionable review finding was reported. The reviewer did not re-review the later fix or verify production.

## Production inventory and prepared scope

Read-only Neon inventory used the existing CLI sign-in without opening .env.local. The CLI handled its credentials internally; no connection URI or credential was emitted. Project `curly-scene-39671304`, branch `br-noisy-dawn-b4eegvd6` named `production`, database `neondb`. Capture any connection URI inside a process and never emit it.

Inventory: 13 migrations, 3 merchants, 5 rules, 25 commitments, 3 clearings, 14 fills, zero ledger entries, 2 plans and 4 existing model-call rows. Evidence includes protected fingerprints. No production write occurred.

`evidence/s8-ledger/historical-sources.json` prepares only rules `b99be92a-53a6-499a-9b44-c838c2789cc4` and `b80547e2-08d8-44f6-94f5-ffa395be9546`, merchant `6cfe7cc5-f2e7-4ea5-9f7e-55728daee462`, Backfill Demo Cafe. Each has 7 fills and 16 covers at 544 cents, list 680 cents, version 1, date 2026-11-01. Allowed agents are the 11 committed buyers from the hash-verified recording. The S7 status records source ownership; no historical database merchant-reassignment audit exists. Refuse any identity, version, price, fill-count or buyer drift.

Expected after the unapplied backfill: 14 entries, 32 covers, 21760 cents list value, 17408 cents accepted total and 4352 cents buyer savings, with other shares zero. These are computed expectations, not existing balances. Exclude the original Muse commitment, Demo Kopitiam, Singapore Test Restaurant and all existing agent changes.

## Remaining rollout

Obtain named S8 main merge/push and Render rollout authorization. Publish only the reviewed S8 branch and check CI on the published tip. Coordinate migration 0013 with deployment: its completeness trigger rejects old S7 writes that omit ledger entries. Do not apply it under an active old clearing writer and claim compatibility.

After the coordinated rollout, recheck the inventory/pins, apply the bounded backfill using `backfillLedger`, and compare counts, protected fingerprints and merchant reconciliation. Hosted checkout behavior remains unverified. A live merchant browser can mount the pre-existing Wonder auto-replan effect; keep the no-model-call boundary.

Paid S7 record mode remains deliberately disabled. Replay remains available. Frozen recording SHA256 `ede0975b19f7e4943aadcd6ffcda43e7e89c191472702b7f9c02fdc18655150c`, both screenshots and migrations 0000 through 0012 are unchanged.

Never read .env.local, package-lock.json or migration snapshots. Never print secrets. Check the branch before every edit. No em dash or commit attribution. All tests use `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres`. Real CLI tests run from an empty temporary cwd with a minimal environment. Mutation trials run in secret-free archives, with `VITEST_MAX_WORKERS=2` to avoid local connection exhaustion.

## Prompt for the next chat

Continue Backfill S8 in `/Users/jayd0/Desktop/meta-hack` on `backfill/slice-8-ledger-checkout`. Read this handoff, the S8 heading of `00-status.md` and the S8 build-plan section. The local implementation and proof are complete; main remains S7 at `7cdbb56`. The user approved S8 and scoped production writes with 100% buyer savings and zero fees for existing commitments. Named S8 main publication and Render rollout are still pending. Use the prepared evidence pins and coordinate migration 0013 with the S8 writer before production clearing. No model calls, real payments or S9 work. Preserve all protected/frozen evidence and the explicit test isolation rules above.
