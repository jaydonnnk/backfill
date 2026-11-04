# S6 local pricing baseline and failure proof

The user approved the exact S5 asset and asked to move to the next step. This
S6 continuation is local/offline only. No new inference, installation, production,
public posting, commit, push, deployment or S7/S8 work was performed.

## Current evidence

[Open the standalone HTML report](run-03/report.html).
[Case-level aggregates](run-03/summary.json).
[Final implementation hashes](run-03/source-manifest.json).
[Owned-resource cleanup](run-03/cleanup.json).
[Desktop/mobile report checks](run-03/report-browser.json).

Exactly twelve fresh synthetic cases and literal expected baseline outcomes were
[frozen](case-freeze.json) before any new AI results. The case file hash is
5b148931137ad9b5072e05adf24fb564117763c70855a34ec80a79701b4c4e7c.
No older model recording has been admitted to these new pricing cases. S4 buyer
recommendations are a different role and are not merchant-price measurements.

The fixed pricing policy concedes the maximum allowed step, bounded by the current
bid. It receives the same public ProposalInput the merchant model receives. Neither
policy sees the private floor. Actual negotiate, signed-counter commitment and
settlement services ran through a restricted local runtime role. Exact party
approvals are scripted test fixtures, not real customer consent. Quote acceptance,
stored commitments and confirmed fills remain separate.

Across the twelve synthetic worlds, pooled DB settlement filled 48 covers. The
same stored commitments cleared alone fill 2 covers, an explicit domain-engine
counterfactual. This is not an estimate of merchant demand. The pricing-policy
focal party confirmed 12 covers in 6/12 cases. Background parties are excluded from
that focal metric. Pool ledger totals reconcile to SGD 259.92 accepted amounts and
SGD 66.48 hypothetical savings; no money, attendance or revenue is established.
The focal-party accepted total is separately SGD 64.08.

All twelve case records reproduce the aggregates. The two rejected proposals,
no-agreement case, insufficient demand, exhausted capacity, late submission, stale
approval and per-agent cap refusal remain in the data. Every actual stored fill is
checked against current terms, capacity, accepted price, max price and hidden floor.
AI measured cases remain 0/12. AI price/cost/provider-latency/winner fields are null.
Local callback timings are not provider timings. No p95 or AI-superiority claim.

## Verification

- 580 tests in 64 files passed, including the reused actual-service failure/race,
  timeout, malformed-output, stale-approval and duplicate checks.
- Typecheck and lint passed; lint has zero warnings after removing an unused import.
- Ten offline consumed-call/transport guard tests passed. No historical live runner
  or consumed S5 runner was invoked.
- The final HTML was checked at 1280px and 375px: twelve rows, honest 0/12 AI label,
  no document overflow, no page errors, external network blocked.
- Product/browser inputs remain unchanged from the accepted S5 browser proof. No
  new product Next build or full journey browser run is claimed for these scripts.
- Review found the stale-term event initially preceded approval. A regression
  observed current version 2 at the supposed version-1 approval and failed. The
  corrected run records approval while version 1 is current, then terms change,
  then stale submission refusal. The original freeze was not altered.
- Review also requested implementation hashes; the accepted run pins the runner,
  policy, owning services/domain modules, schema, package lock and local migrations.

Superseded runs are retained in the ignored archive with a retention receipt.
The first run's aggregate counts agree, but it is not accepted as stale-approval
sequencing proof. Final run-03 is the acceptance source.

## What remains

The actual AI pricing comparison is unmeasured. It needs a separately authorized
bounded Muse Spark 1.3 run after exact transport, adaptive-round input validation,
durable dispatch slots, retry policy, output limits and a verified spend ceiling
are prepared. The frozen buyer ladders allow at most 16 proposal requests across
all twelve cases, with three rounds per case and no automatic retry. This is not
an approval-ready run and no new pricing allowance is implied. Costs stay unknown
until verified, rather than being invented from local replay timings/token counts.

Stop at S6. [Current continuation](../../s6-handoff-2026-11-04.md).
