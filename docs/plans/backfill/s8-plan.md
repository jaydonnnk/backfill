# S8 ledger and checkout plan

Status: design prepared, split policy pending. No S8 product code or production write has occurred.

## Authority and scope

The approved [build plan](build-plan.md#s8---ledger-and-checkout-nov-1) names savings splits, merchant totals, ACP-shaped checkout without real money, and one reconciled ledger entry per filled commitment. The user named S8 and production writes on 2026-11-01 after authorizing S7 integration. S7 is published on main at `7cdbb56d5cd2b3ad0bcfa3fbf6cefe200f25661c`. S8 branch: `backfill/slice-8-ledger-checkout`.

Production writes remain scoped to this slice. Preserve the original Muse commitment, Demo Kopitiam, Singapore Test Restaurant, existing agents, frozen recording, screenshots and migrations 0000 through 0012. No model calls or real payments. Migration 0013 is available. This does not authorize S8 main integration or a Render redeploy.

## Required policy decision

The existing plan does not specify percentages. Proposed policy: 100% of savings to the buyer, 0% agent, 0% network. It preserves the prices existing buyers accepted. Nonzero agent or network shares require a decision about who pays them and validation against accepted maximum prices. Do not silently reinterpret a clearing price as net merchant revenue. The user's answer remains pending.

## Current ownership

`getCommitmentStatus` and `settleDue` reach the private `ensureClearing` transaction in `src/lib/commitments/service.ts`. It locks the rule through `lock_rule_for_clearing`, writes the immutable clearing and its fills, then returns them. Each fill carries its own price, including a negotiated price. The ledger already has uniqueness by commitment, four arithmetic checks and ENABLE ALWAYS append-only triggers. Runtime has no ledger grants.

Neither clearings nor fills stores the historical list price. Rules hold current terms. Equal terms versions prove the public price has not changed, but do not prove historical merchant ownership because merchant_id is outside the version trigger.

## Design

Use one TypeScript ledger constructor in `src/domain/ledger/calculate.ts` and extend the existing clearing transaction. The constructor consumes commitment, merchant and rule IDs, filled covers, locked list price and the fill's own price. It returns the existing LedgerEntry schema. The split policy will be fixed by the user's answer, without a new configuration framework.

Insert ledger rows after fills inside the same transaction. Keep uniqueness and append-only protections. Migration 0013 will add source binding and a deferred completeness check so a new fill cannot commit without its matching ledger row. Invalid ledger writes must roll back the clearing and fills. Existing S2 and S4 fixtures must satisfy the stronger invariant without weakening their original assertions.

Use the commitment ID as the checkout session ID. A small append-only receipt table records one simulated completion per filled commitment. Bearer authentication supplies agent identity. Input cannot supply merchant, price, shares or agent identity. Look up ownership before returning any session or performing settlement. Missing and foreign IDs receive the same result. Checkout reads stored ledger economics and completion is idempotent.

Minimal routes under `src/app/api/checkout_sessions`: POST create, GET by ID and POST by ID/complete. Responses use SGD integer cents and explicit simulated/no-money labels. Pending, cancelled and unfilled commitments cannot complete. Completion rejects payment credentials. This is an ACP-shaped local simulation subset, not protocol conformance or ChatGPT commerce integration. Reference: https://www.agenticcommerce.dev/docs/reference/checkout and https://www.agenticcommerce.dev/docs/concepts/lifecycle, checked 2026-11-01.

Merchant totals require merchant authorization. Reconciliation must identify missing, duplicate, orphaned or mismatched entries and verify charged amount plus savings equals list value, and shares sum to savings. Totals derive from persisted entries, not mutable current rules.

## Historical backfill

Prepare a separate bounded reconciliation transaction after a read-only inventory. Prove each historical fill's original list price and merchant using unchanged versioned public terms plus the frozen recording/source context and recorded rule IDs. If any identity or price is ambiguous, stop that backfill. Do not re-clear occurrences, rewrite immutable history or guess current prices. The original protected records remain outside writes. No historical insert has been executed.

## Implementation sequence

1. Resolve the split, then write literal domain tests for its exact cents and merchant totals. Observe an assertion failure before implementing the constructor.
2. Add transaction, negotiated-price, rollback, concurrency, source-binding and privilege tests. Implement migration 0013 and extend the existing clearing writer. Preserve 0000 through 0012 byte-identical.
3. Add authenticated create/read/complete checkout tests, including foreign IDs, revoked tokens, malformed input, no floor/capacity disclosure and simultaneous completion retries. Implement the receipt service and thin routes.
4. Verify reconciliation against literal fixtures and existing recorded Demo Cafe fills. Run a real local HTTP smoke against a disposable database using the runtime role.
5. For every new guard, run an isolated AssertionError mutation, verify byte-identical restoration and a green restored rerun. Never mutate the real checkout.
6. Run the full suite, typecheck, lint and diffcheck; get an independent whole-branch review. Only then perform scoped, authorized production migration/backfill with read-only before/after verification. Record remaining deployment and publication gates honestly.

All tests use `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres`. CLI tests use an empty temporary working directory and minimal environment. Never read .env.local, package-lock.json or migration snapshots, or print secrets. Check the branch before every edit.

## Design comparison

Two independent sketches compared TypeScript-owned writes with database-owned insertion on fill. Both identified the missing historical list-price source. The independent judge scored both equally overall and preferred the TypeScript writer for its fit with domain ownership. Use that as the base, retaining database completeness/source guards and narrow privileges. An extra clearing snapshot column is unnecessary for new entries when the existing locked transaction copies economics directly into immutable ledger rows. Historical backfill still needs separate source proof.

## Verification focus

- An insertion failure must leave no new clearing, fill, ledger row or receipt.
- A negotiated fill must never inherit the headline clearing price.
- Concurrent retries must produce one entry and one receipt.
- Later rule changes must not change stored totals or checkout prices.
- Foreign or revoked agents must not learn another buyer's state or trigger settlement.
- Historical version equality alone must not be treated as proof of merchant identity.
