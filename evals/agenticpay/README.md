# Backfill S9 evaluation

Offline implementation and one authorized live attempt are recorded. The general CLI remains synthetic-only; `live.ts` is bound to a consumed one-use run ID. No production merchant/rule/commitment/ledger writes are part of this pipeline.

## Protocol

This is a small Backfill adaptation inspired by [AgenticPay](https://github.com/SAIL-Research-Lab/AgenticPay), whose upstream framework evaluates buyer/seller negotiation. It does not reproduce the upstream task set or claim benchmark parity. We compare merchant models against a deterministic scripted buyer, not two model-driven agents.

`scenarios.ts` defines three isolated synthetic cafes, fixed seeds and buyer limits. Both models receive the same initial prompt and use identical scenario seeds. Provider seeds are not used: neither request includes a `seed` parameter. Later prompts reflect each model's own preceding counter. The existing `settleRound` enforces the private floor, concession bounds and three-round maximum. Floors never enter prompts. One cover per episode; savings are list price minus deal price. No clearing or real reservation is performed.

Six scheduled episodes, at most eighteen sequential HTTP attempts. One attempt per round, zero retries, temperature 0, 1024 output tokens, 60-second request timeout. A failed reply ends that episode. Scenario seeds identify the paired fixtures only; provider output is not deterministic. `require_parameters: true` remains symmetric without requesting unsupported provider seeds.

## Evidence and persistence

`runStoredEvaluation` wires the injected database and transport through the provider, runner and durable writer. This is tested with synthetic HTTP responses and was exercised once against OpenRouter in an isolated local evaluation database. `createRunFiles` exclusively reserves `<run-id>.journal.jsonl`, fsyncs started requests before HTTP, records stored row IDs and episode checkpoints, and writes a validated final `evals/results/<run-id>.json` without overwrite. Interruptions leave the journal; they do not create a verified final artifact. Do not resume an interrupted run or reuse its ID. Reconcile started requests without stored rows before any separately authorized retry.

Each attempt stores an `llm_calls` row with exact purpose `eval:<run-id>:<episode-id>:<round>`. Costs come from OpenRouter's reported `usage.cost`, converted to integer nano-USD. No price-table estimates. The existing non-null column stores 0 with `error=eval_cost_unknown` when charges are unknown; the evaluation exporter always maps that marker to null. This adapter must use isolated evaluation storage: generic existing system totals do not understand this marker. No schema migration or production provider changes are included.

The public loader recomputes all round outcomes and summaries, then verifies the entire run-scoped stored call set, including unsuccessful attempts. Extra/orphan rows, missing rows, duplicated IDs, changed charges, inconsistent proposals and synthetic run kinds are rejected. Only sanitized price proposals, call IDs and aggregate charges reach the page. No raw responses, rationales, secrets or production floors are exposed.

Deal rate denominator is all three scheduled episodes per model, including failed/missing episodes. Savings sum successful deals in SGD. Costs sum all stored calls in USD. Any unknown call cost makes that model's total and cost per deal unavailable. Zero deals also makes cost per deal unavailable. Partial/failed runs stay labelled; charts require a complete run and known costs. No overall winner is declared.

## Local use

- `npx tsx evals/agenticpay/cli.ts --synthetic` regenerates the explicitly synthetic rendering fixture. Its invented call IDs/costs are not stored model evidence.
- `npm run dev -- --webpack` serves `/evals` empty and `/evals?preview=synthetic` as a labelled development-only preview. Production ignores the preview query.
- After separate evaluation and publication approval, `evals/results/published.json` selects `{ "runId": "approved-run-id" }`. It is deliberately absent now. The named run JSON must match stored records accessible to the read-only verifier. Moving evaluation evidence to hosted storage requires separate authorization and verification.
- Tests require an explicit disposable local `TEST_DATABASE_URL`. Never load `.env.local` for verification.

## Paid activation still pending

Models are selected; separately approve six episodes / eighteen maximum calls / zero retries, and agree a total USD cap before activation. A dedicated provider-enforced allowance must be verified; a client-side cost counter cannot cap an in-flight charge. Add and test the activation/preflight for the agreed policy before any HTTP request. The current CLI cannot start a paid run.

The user selected `meta/muse-spark-1.3` versus `deepseek/deepseek-v4.1-flash-1017`, the requested pinned October 17, 2026 snapshot. `models.ts` records this exact ordered pair; measured result validation rejects substitutes and aliases, including `~deepseek/deepseek-flash-latest`. Synthetic fixtures remain explicitly labelled and may use fixture IDs.

Recheck these exact IDs and their required capabilities in the [OpenRouter catalog](https://openrouter.ai/api/v1/models) at activation. Availability of the newly selected DeepSeek snapshot has not yet been verified. If either ID is unavailable, stop rather than substitute. Model selection alone does not authorize spending.

API reference: https://openrouter.ai/docs/api_reference/overview. No paid compatibility test has run.

### Authorization update

On 2026-11-01 the user approved the selected exact models, six episodes, eighteen maximum calls, zero retries and a provider-enforced US$1 total cap with isolated evaluation storage. Scope remains unpublished and excludes production writes. Catalog preflight found both exact IDs and required request capabilities. The run has not started: no OpenRouter key is available in the process, so the enforced allowance could not be checked. Do not load `.env.local` or ask again for the already approved run; obtain a dedicated capped credential through an explicitly supplied local secret source, verify its allowance and finish the activation checks first.


### Authorized live outcome, 2026-11-02 Singapore time

After the user explicitly directed proceeding with the existing key despite its US$3 limit, activation retained that provider cap and used US$1 as an operational run target, not a hard provider-enforced US$1 guarantee. Checks run before every attempt stop at eighteen calls, unknown charges, US$0.95 recorded/account spend, low remaining credit or a changed/resetting key cap. The US$0.05 headroom is a stop margin, not a mathematical price bound.

Run `s9-20261101-authorized-01` consumed its one-use marker and completed six episodes with thirteen calls and zero retries. Exact models and provider-seed omission were preserved. All four failed replies had HTTP 200 but did not yield validated proposal JSON. Three Spark episodes failed; DeepSeek had one deal, one no-deal and one failed episode. Run status is `failed`, and no overall winner is claimed.

The stored call costs total US$0.02320331. The initial account usage read lagged; a later read reconciled exactly to the same total. Each charge, including failed replies, is stored in the isolated database and the result JSON. Failed replies used 1024–1065 reported output tokens with a requested max_tokens of 1024. Token-budget exhaustion is a hypothesis, not a confirmed diagnosis: this adapter did not retain finish reasons or malformed response payloads. Do not change or retry the frozen run to fill that evidence gap.

Local result review: http://127.0.0.1:3194/evals. Only its secret-free preview copy contains the local selection manifest; the repository has no published manifest. Local database connection location: `/tmp/backfill-s9-evaluation-url`, never commit its contents. Evidence and source hashes: `docs/plans/backfill/evidence/s9-activation/`. No production records, push or deployment were involved. Further paid diagnostics or retries need a new bounded authorization; the original run is consumed.

### Diagnosis and run 02, 2026-11-02

Cause of run 01's failed replies: the reasoning budget was exhausted, a harness configuration issue, not a model capability failure.
OpenRouter counts reasoning tokens against the same `max_tokens` budget as visible output, and a reply cut off by that limit ends with `finish_reason: "length"` and empty content.
The catalog lists Spark 1.3 reasoning as mandatory with default effort `medium`, and DeepSeek V4.1 Flash with default effort `high`.
Run 01 sent no reasoning effort, while production `sparkMerchant` sends `low`.

The user authorized up to US$10 for Muse and US$1 for DeepSeek for this diagnosis.
Probe `s9-20261102-diagnostic-01` (`probe.ts`) replayed the four failed prompts unchanged, then with `reasoning: { effort: "low" }`, keeping raw replies in `docs/plans/backfill/evidence/s9-diagnosis/`.
Unchanged: two of three Spark replays stopped with `finish_reason: "length"`, `native_finish_reason: "max_output_tokens"`, 1022 reasoning tokens and no content; the third and the DeepSeek replay completed, so default-effort failure is intermittent.
With effort `low`: all four completed with valid proposals, using 281 to 423 reasoning tokens.
Probe cost US$0.01886569 by reported per-call charges.

The adapter now records each attempt's generation ID, finish reason, completion and reasoning tokens, content length and failure class as a `diagnostic` journal event.
Error codes are now specific: `eval_response_truncated`, `_empty`, `_invalid_json`, `_schema`, `_http`, `_body`.
Validation is unchanged.
Runs record `config.reasoningEffort`; its absence means provider default, as in run 01.

Run `s9-20261102-authorized-02` sent effort `low` to both models, otherwise using the run 01 protocol: 18 calls, zero failures, status `complete`.
Both models produced identical outcomes: one deal (flexible, S$2.20 savings), one floor refusal and no-deal (tight-floor), one no-deal (low-budget).
Spark cost US$0.02138305 and DeepSeek US$0.00186283, about 11.5 times less.
Peak reasoning use was 647 of 1024 tokens (Spark, round 3).
Three scenarios cannot separate the models on outcome; the measured difference is cost only.
Database `backfill_s9_authorized_20261102_02`; connection location `/tmp/backfill-s9-evaluation-02-url`, never commit its contents.
The immediate account usage read lagged again (US$0.00748562 delta); stored per-call charges are the cost record.

### Run 02 imported to Neon, 2026-11-02

The user authorized copying run 02's calls to Neon ("Copy calls to Neon") so the hosted `/evals` can verify it.
`import-neon.ts` copied the 18 `llm_calls` rows in one transaction and checked the full run against Neon before commit.
Neon already held IDs 1-5, so the rows received IDs 6-23 and `evals/results/s9-20261102-authorized-02.json` was re-keyed to them.
The original result with local IDs and the ID mapping are in `docs/plans/backfill/evidence/s9-neon-import/`; the journal keeps the local IDs.
The isolated evaluation database no longer matches the published file; Neon is now the published record.
`/system` totals count all Neon `llm_calls`, so they now include these 18 calls (US$0.02324588).
No other Neon table was written.
