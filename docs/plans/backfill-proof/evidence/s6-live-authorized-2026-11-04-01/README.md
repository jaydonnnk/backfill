# S6 completed locally, 2026-11-04

The user approved the preceding proposal for one run with at most sixteen
requests and a US$21.05 ceiling. The approved manifest and frozen cases stayed
unchanged. The run completed once with **15 genuine Muse Spark 1.3 requests**,
15 valid HTTP-200 proposals, zero retries and zero provider/parser failures.
All responses identify `muse-spark-1.3`. Two cases needed no model call.

[HTML results](report.html), [aggregates](summary.json), [reconciliation](audit.json),
[cleanup](cleanup.json), [closed allowance](run-closure.json),
[approval](../s6-live-preparation-2026-11-04/inference-approval.json),
[approved contract](../s6-live-preparation-2026-11-04/contract.json).
The original contract's `approved: false` records preparation. The later explicit
approval and the authorized run marker supersede that historical status.

## Result and limits

Across the twelve synthetic worlds, Spark confirmed **6 focal seats in 3 cases**.
The fixed maximum-concession policy confirmed **12 focal seats in 6 cases**.
Whole-pool outcomes, including background parties, were 32 seats under Spark and
48 under the fixed policy. Focal hypothetical accepted totals were SGD32.44 and
SGD64.08 respectively. Whole-pool totals were SGD173.88 and SGD259.92. These are
simulated ledger amounts, not payments or revenue.

Spark obtained slightly higher prices in two shared successful cases: SGD5.38
versus SGD5.20 in s6-03, and SGD5.40 versus SGD5.35 in s6-12. Those gains did not
offset the fewer agreements. The existing prompt asks the merchant to concede
slowly; the baseline takes the maximum allowed concession. Buyer bid ladders,
permitted actions, public inputs and service guards were identical. No tuning,
case changes or repeat run followed the results.

This bounded comparison does **not demonstrate AI superiority** on focal seat
confirmations or total accepted amounts. It is not a general model ranking or
proof that all AI pricing is ineffective. Genuine model responses were combined
with scripted parties/approvals and actual restricted-role local services. Demand,
real customers, consent, attendance, payments and recovered revenue remain unproven.

The same stored commitments cleared alone fill 0 seats under Spark prices and
2 under fixed-policy prices. These alone outcomes are clearing-engine
counterfactuals. They are not measured individual customer behavior.

## Usage and safeguards

Reported usage was 4,095 input tokens and 7,538 output tokens. The exact estimated
inference cost is **US$0.03690665**, using the approved Standard rates and reported
cache usage, if any. This is a rate-based estimate. Invoice cost is unknown.
Sources are in the [prepared scope](../s6-live-preparation-2026-11-04/README.md).
Guarded attempts took 3.031 to 9.493 seconds, including recording overhead.
HTTP receipts separately retain request round trips. No small-sample p95 is used.

Every accepted price, stored fill, seat count and hypothetical amount reconciled.
No unsafe proposal reached a confirmed booking. All fifteen Spark proposals passed
the shared price guards. The baseline preserved two guard rejections and the
stale-approval/deadline refusal cases. Spark never reached an agreed quote in the
stale-approval/deadline cases; those refusals are proven by the baseline service
runs and existing integration tests, not by a new live Spark refusal.

The entire allowance is closed after 15/16 requests. The unused slot is not
available for retries, tuning or another run. Historical S3/S4/S5/S9 allowances
remain closed. No production access, migration, publication or deployment occurred.

## Verification

- The approved source/case hashes matched before every dispatch, at completion
  and in the separate offline audit. The source file set stayed unchanged.
- `node scripts/verification/proof-s6-audit.mjs --check` independently reproduced
  case aggregates, request/input/body hashes, raw response usage, rate-based costs,
  booking safety, focal/background separation and ledger totals. It sends no HTTP
  and loads no credential. `audit.json` hashes the primary evidence files.
- Both disposable databases and the restricted role were removed. Cleanup recorded
  zero residual resources and zero failures.
- The HTML report passed 1280px/375px checks: twelve case rows, correct headline,
  no document overflow, page errors or external requests. Screenshots were inspected.
- Fresh lint passed after adding the offline audit command. Preparation's
  599 tests/70 files, typecheck and ten call guards remain valid for the unchanged
  pinned runtime. No new product build or full product browser journey is claimed.
- The bounded S6 architecture check found no product runtime, schema or dependency
  additions. The audit CLI is referenced here. Historical receipts and pre-live
  documents are retained; no deletion or cleanup of unrelated work was performed.

S6's local engineering/evaluation acceptance is complete. The result is negative
for the tested AI advantage. S7/S8, production changes, commit/push and new
inference are outside this completed run.
