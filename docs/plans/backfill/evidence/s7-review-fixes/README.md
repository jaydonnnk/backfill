# S7 review-fix evidence

Scope: the user approved F1-F6 on 2026-11-01. F7, the unfinished saved rationale, remains unchanged. These fixes are local to backfill/slice-7-review-fixes; no merge, push or redeploy is authorized.

## Verification

The full working tree passed 386 tests in 38 files, typecheck, lint and git diff --check. Focused tests demonstrated failures on AssertionError before fixes, including both retirement/submission orderings and recorder failures escaping both model adapters. New test callbacks use fake HTTP or disposable local PostgreSQL. No test needs a real model call.

mutations.json contains 75 isolated faults: the 15 original S7 guards plus 60 new or extended guards for F1-F6. The original healthy-read heartbeat mutation is scoped more narrowly because F5 adds a separate outage heartbeat branch, with its own proof. The combined full-suite proof passed: all 75 killed on AssertionError, all 75 restored byte-identical, all 75 restored reruns green, and zero file errors. results.json records every outcome.

The run uses two independent git archive copies with node_modules copied by cp -cR. Modified and untracked source files were copied into each archive before testing. Neither archive contains .env.local. Each mutation runs the full unit/integration suite, restores its file bytes, and reruns the suite. No mutation is applied to the real checkout.

To reproduce after committing, extract git archive of the fix commit into a scratch directory, copy node_modules with cp -cR, then run the existing runner:

    env -u DATABASE_URL TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres node docs/plans/backfill/evidence/s1-review/mutate.mjs <scratch-directory> docs/plans/backfill/evidence/s7-review-fixes/mutations.json <results.json>

Never copy .env.local into the archive. The real CLI regression test uses an empty temporary working directory and only PATH, NODE_ENV and TSX_TSCONFIG_PATH, including under mutation.

## Implementation decisions

F1 is fail-closed. The actual paid-record CLI refuses before loading configuration, creating rules, opening MCP or making model requests. The repository exposes no provider-enforced allowance or certified per-request billing bound. Token/byte guesses cannot honestly guarantee the requested US$5 hard cap. Replay remains available. A future paid recording needs a verified enforced allowance and fresh named authorization; an environment boolean is not proof.

F2 uses an exclusive append-and-fsync partial journal. Requests have invocation IDs carried across concurrent awaits, so retry output and costs remain attributable. Completed buyer decisions are saved before submission and Wonder's proposal before plan storage. Fatal provider recorder failures escape both S7 adapters. The worker pool stops queued work and drains already-started work before propagating failure. Completed JSON also uses exclusive creation. Partial journals are evidence, not automatically replayable completed runs. Returned usage is not invoice reconciliation, and a reported zero is not proof of no charge.

F3 leaves the original recording byte-identical. Its raw SHA256 is ede0975b19f7e4943aadcd6ffcda43e7e89c191472702b7f9c02fdc18655150c. Only that verified V1 semantic recording may use the attached historical source context. V2 carries structured public source terms and canonical buyer requests. Replay validates identity, intent and economics before setup. Shifted day/time is allowed for rehearsal and disclosed. The page distinguishes simulated buyers, unknown provenance and a recorded Wonder replay.

F4 settles already-due pools before retiring their floor, refuses pending occurrences while holding the old rule locks, and locks a submission's rule before reading availability. This uses the existing SECURITY DEFINER function and requires no migration or runtime grant. Same-rule submissions serialize; throughput was not measured. Concurrent scene creation without pending buyers remains outside this fix's proof.

F5 sends stale/recovered stream events. A successful snapshot marks Live; merely opening the socket does not. A local browser using the real components, a saved public snapshot and an injected read outage showed Stale after 108 failed reads, then Live after recovery without a data change. Simulated/replay labels remained visible. This was a local fixture, not a new hosted scene. A read that never resolves has no new timeout.

F6 directly exercises the real Spark adapter at a fake-fetch boundary and tests the fractional positive-lead refusal. All four formerly surviving faults have independent mutation specs.

## Production isolation incident and correction

An initial CLI regression test incorrectly ran from the real checkout. It loaded .env.local programmatically, inserted empty Neon rule d57a7e1d-0ce3-4bad-b4dd-30f5f36d8543 and raised the prior replay rule b80547e2-08d8-44f6-94f5-ffa395be9546 floor from 500 to 680 before failing against the loopback MCP URL. It made no model request. This was an unauthorized database change, disclosed immediately after discovery.

The user explicitly answered "Restore those two changes". One guarded transaction checked and locked the exact expected rows, verified the new rule had no commitments, deleted it without CASCADE, and restored the old floor only at the expected version/value. Any foreign-key reference or changed expected field would have rolled back both corrections.

Read-only counts before correction: rules 6, commitments 25, clearings 3, fills 14, plans 2, llm_calls 4. After: rules 5, commitments 25, clearings 3, fills 14, plans 2, llm_calls 4. The old floor is 500; the new rule is absent. Both temporary source scripts were deleted. The corrected CLI test cannot reach production configuration from its empty working directory.
