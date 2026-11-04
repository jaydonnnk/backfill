# S6 historical live-run preparation

The later explicit approval and genuine run are complete. See
[final S6 results and acceptance](../s6-live-authorized-2026-11-04-01/README.md).
The original contract, rehearsal records and preparation narrative below are
retained as history. The allowance is now consumed/closed after fifteen requests.

The bounded Muse Spark pricing comparison is implemented and rehearsed. No genuine
S6 inference has run. The twelve cases remain frozen at
`5b148931137ad9b5072e05adf24fb564117763c70855a34ec80a79701b4c4e7c`.

[Run contract](contract.json), [source hashes](source-manifest.json),
[verification](checks.json), [scripted rehearsal](rehearsal-02/summary.json),
[resource cleanup](rehearsal-02/cleanup.json).

## Proposed approval

- One dated local run, at most 16 POSTs to
  `https://api.meta.ai/v1/chat/completions`, model `muse-spark-1.3` in Standard mode.
- Existing merchant prompt/schema, low reasoning, at most 1,024 completion tokens
  including reasoning. Public pricing inputs only. Private floor/capacity stay
  server-side. Three rounds per case at most. Immediate acceptance and over-cap
  rejection make no model request.
- Every adaptive round is checked against the frozen bid ladder and previous
  validated outcome. No retries, polling, fallback, tools, search or other models.
  Transport/parser failures consume their slots.
- 60-second request timeout, 960-second request-session deadline, 8 KiB request
  limit, 64 KiB response limit, redirects refused.
- Durable session and case/round markers precede dispatch. File and directory
  entries are synchronized. The canonical live directory cannot be rerun.
  Never delete markers to obtain another attempt.
- The original prepared-manifest hash is required throughout. Each dispatch and
  final verification recheck all pinned source and case hashes.
- Actual negotiate/submit/settle services run in separate disposable local
  databases under a restricted role. Exact approvals are scripted fixtures.
  Cleanup attempts every owned resource and records failures.
- No publication, production access, payment, migration, installation or S7/S8.

## Spending bound

Verified against current Meta documentation on 2026-11-04. These are vendor rates,
not an invoice. Spark Standard input is US$1.25 per million tokens and output is
US$4.25 per million. The context maximum is 1,048,576 tokens. The completion cap
includes visible and reasoning output. No cache discount is assumed.

Without a verified local tokenizer, the conservative bound charges the full
context maximum for every input, although the prompts are short:

`16 × ((1,048,576 × 1.25 + 1,024 × 4.25) / 1,000,000) = US$21.041152`

The proposed ceiling is **US$21.05 total**. This is a conservative upper bound under
documented rates, not an expected charge or a provider-side account limit. Each
dispatch reserves its full worst-case amount, including failures. If reported
usage exceeds the documented bounds, the runner stops before another call.
Execution on another Singapore date requires fresh pricing and dated approval.

Sources: [Meta pricing](https://dev.meta.ai/docs/pricing-rate-limits),
[context](https://dev.meta.ai/docs/models),
[completion cap/schema](https://dev.meta.ai/docs/api-reference/chat-completions/schemas),
[endpoint protocol](https://dev.meta.ai/docs/protocols/chat-completions).
Retrieved text is retained under ignored
`archive/proof-s6-preparation-2026-11-04/`.

## Verification and limitations

The rehearsal used the same executable runner and restricted-role resource setup,
with native HTTP disabled and no model credential read by the runner. All sixteen
responses were a scripted holding-price policy. **Every file in `rehearsal-02/`
is synthetic transport evidence**, including simulated usage, adapter cost
calculations and timing. None measures actual provider behavior. The summary
keeps provider cost/latency null and reports zero new inference calls.
The earlier rehearsal and original source manifest/contract are preserved with
[preparation history](preparation-history.json). The final revision distinguishes
reserved slots from transport dispatches if pre-dispatch persistence fails.

The baseline reproduced 48 pooled covers versus 2 alone and 12 focal covers.
The holding fixture produced 16 pooled covers and 2 focal covers. Its weaker result
checks the harness; it is not an AI result or a competing model. Case-level fills
and hypothetical cents reconcile through actual settlement services. Solo is a
clearing-engine counterfactual. No customers, demand, payments, attendance or
revenue are proven. Both databases and the role were removed.

599 tests in 70 files, typecheck/lint and ten existing offline call guards passed.
An independent read-only review found four important issues. Regression failures
reproduced manifest replacement, fabricated zero usage, directory-persistence
failure, migration-failure leakage, and cleanup stopping after a close error.
They passed after correction. Final rehearsal/checks followed those fixes.
No second independent review or new product/browser build is claimed.

For genuine calls, missing usage/cost stay null. Reported usage supports a
rate-based estimate only; invoice cost stays null. Keep invalid outputs, failures,
losses and ties. Guarded-attempt latency includes recording overhead; HTTP receipts
also preserve request round trips. Do not report small-sample p95, generic model
rankings, or unsupported AI superiority.

## Continuation

Status is **prepared, not approved**. A normal check reads no credential, opens no
database and sends no request:

```sh
node --import tsx scripts/verification/proof-s6-live.ts --check
```

Only after explicit approval of this scope and US$21.05 ceiling, use the approval
value in `contract.json`, provide the existing explicit loopback
`TEST_DATABASE_URL`, and run `--execute` once. Only then does the runner read
`META_API_KEY` from ignored `.env.local`, after reserving the session marker.
Canonical output `s6-live-authorized-2026-11-04-01/` beside this directory does not
exist yet. Old S3/S4/S5/S9 allowances remain closed.

Inspect all case outcomes, outputs, failures, usage, latency and cleanup after
execution. S6 stays incomplete until the genuine comparison is assessed. Stop
before S7/S8.
