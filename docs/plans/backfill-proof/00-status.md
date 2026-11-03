# Status: Backfill proof build

- Gate 1 — Product: in progress
- Gate 2 — Architecture: pending
- Gate 3 — Program design: pending
- Gate 4 — Slice plan: pending

## Authorized scope

The user approved making agent decisions visible, proving a complete journey,
and comparing AI with a deterministic alternative. The submission story must
be the final build slice, after verification. Video production is outside this
build and belongs to the user. Market research is complete for planning;
it does not establish merchant demand or constitute merchant validation.

## Current baseline

2026-11-02: main at 9b6819c. Another agent intentionally removed the
OpenRouter-served evaluation and its published results. Preserve that change.
The new evaluation proposal uses the existing Meta integration, not restoration
of the removed OpenRouter/DeepSeek pipeline. Architecture remains unapproved.
Existing untracked .DS_Store, design/ and metahackathon.rtfd/ are unrelated.

## Slices

- [x] S0 — availability and focused baseline audit, 2026-11-03; completed with
  explicit model-runtime blockers. See [evidence](evidence/s0-preflight-2026-11-03.md).
- [ ] S1–S8 — unstarted. The revised proposal gives work-package order; final
  architecture and program design remain pending. Submission documentation is last.

## Working boundaries

- Current deliverables are planning documents and standalone HTML mockups only.
- Do not claim mockup values, hypothetical outcomes or offline fixtures are measurements.
- Fresh paid calls require a concrete budget and run scope; previous consumed
  evaluation allowances are not reusable. No paid calls or hosted writes here.
- Publication, deployment and real payments are not part of this planning step.
- Preserve the existing Kopi visual language; this is not a site redesign.
- User paused for the other agent and explicitly resumed after it finished.

## Next step

Review 01-product.md, the revised build proposal and the HTML mockups. Gate 1
remains unapproved. Do not start implementation before the user's green light.
Architecture and program-design decisions remain pending; this proposal does
not approve them. Do not reopen the older completed gates.

## Planning revision, 2026-11-03

The user requested a stronger build plan aimed at a 70+ final submission and
will supply merchant evidence and video independently. They explicitly
reaffirmed all eight Meta tools/models. See
[revised build proposal](build-proposal-2026-11-03.md) and
[workflow mockup](mockups/workflow.html).

The proposal allocates 23 productive hours plus 2 contingency after access and
technical feasibility are established; unknown prerequisite work is additional.
It does not promise 70 or all-eight live
evidence under the current no-paid-inference boundary. No implementation,
model call, production write, deployment or publication is authorized here.

## Slice 0 authorization and result, 2026-11-03

The user explicitly authorized Slice 0 only: "start with slice 0 first" and
report required `.env.local` settings. This supersedes the planning-only boundary
for the audit, not for subsequent product code or inference.

Authenticated read-only Meta catalog: HTTP 200, all five required hosted models
listed. Existing app env schema valid. Local PostgreSQL 18.6 ready; 41 focused
unit tests, 26 integration tests and typecheck passed. Existing recording schema
and source hash verified. No fresh inference, paid calls, production writes,
installs, weight downloads, publication or deployment. `.env.local` unchanged.

Missing: Baseten credential/access and installed local Glimmer runtime/weights.
Media generation/transcription/segmentation contracts are documented but not
empirically verified. S0 audit is complete; all-eight runtime readiness is not.

## Vercel Spark Open access probe, 2026-11-03

The user added `AI_GATEWAY_API_KEY` and explicitly requested a request to check
whether it works and activates free credits. This authorized one bounded smoke
request only, superseding the earlier no-inference boundary for that request.

One raw HTTP request to `meta/muse-spark-open` through Vercel AI Gateway, maximum
512 output tokens, reasoning effort low, no tools and no client retries, returned
HTTP 403 `customer_verification_required`. The error states that a valid credit
card must be on file to unlock free credits. No model output or usage was
returned. Credit activation and successful inference are not verified.

The key value was not printed or stored in the receipt. `.env.local` and product
code were not changed. No card, credit purchase, top-up, deployment or production
database operation was performed. Do not repeat inference automatically.

Receipt: [single-request evidence](evidence/s0-vercel-spark-open-smoke-2026-11-03.json).

The user explicitly requested "Try again". A second separately authorized
single request returned the same HTTP 403 `customer_verification_required`.
No model output or usage was returned; free-credit activation remains unverified.
There was no automatic retry, product change or billing-setting change.
Receipt: [attempt 02](evidence/s0-vercel-spark-open-smoke-2026-11-03-attempt-02.json).

Following the user's screenshot showing a card and US$5 credit, an authenticated
read-only `GET /v1/credits` returned HTTP 200, balance `5`, total used `0`.
There is exactly one `AI_GATEWAY_API_KEY` definition in `.env.local`. The key
can see credit; missing balance is not the blocker. The inference card-verification
gate remains unexplained. No additional inference was attempted. Do not infer
a confirmed team mismatch or advise buying credits from this evidence.
Receipt: [credit read](evidence/s0-vercel-credit-read-2026-11-03.json).

## AI SDK diagnostic setup verified, 2026-11-03

The user explicitly authorized installing `ai`, creating `index.ts`, and running
a holiday-generation example. Existing npm was used; `ai` is pinned to 7.0.162.
The runtime loads the existing key via Node's `--env-file`; no key value was
inspected, printed, logged or committed for this diagnostic. `.env.local` remains
ignored and unchanged. The example is standalone; Backfill's provider is unchanged.

Two bounded SDK generation attempts with provider-default reasoning timed out
at 30 and 45 seconds. A read-only SDK model lookup returned HTTP 200 and listed
Spark Open. The same traced SDK example with explicit `reasoning: "low"` then
returned HTTP 200 and nonempty text from `meta/muse-spark-open`: a two-sentence
holiday named Lumenfall. Reported usage: 157 input tokens, 329 output tokens,
including 260 reasoning tokens, 486 total. Every run used `maxRetries: 0` and
a 512-output-token bound. The successful source retains the 45-second timeout.

Run the example explicitly with `npm run gateway:example`; it makes inference
requests and is not part of the ordinary application or test startup.

The successful configuration is verified. A single changed-setting trial does
not prove reasoning was the sole cause of the timeouts, or establish why the
earlier card-verification gate occurred. Do not present the SDK as a billing-gate
bypass. No extra generation was made solely to compare protocols again.

Read-only SDK credits after the runs: balance US$4.993661, total used US$0.006339.
This is account-wide tracked usage, not the cost of the final successful call.
No card settings, credit purchases, top-ups, deployments or production data changed.

Evidence:
- [Initial SDK timeout](evidence/s0-vercel-ai-sdk-2026-11-03.txt)
- [Traced SDK timeout](evidence/s0-vercel-ai-sdk-trace-2026-11-03.txt)
- [Successful low-reasoning generation](evidence/s0-vercel-ai-sdk-low-2026-11-03.txt)
- [SDK credit balance](evidence/s0-vercel-ai-sdk-credits-2026-11-03.json)

Fresh typecheck, targeted ESLint on `index.ts`, and diff whitespace checks passed.
The complete application suite was not rerun for this standalone diagnostic.
Spark Open buyer integration, partner bonus verification and S1 remain unstarted.

## Readiness and sequence after Vercel verification, 2026-11-03

Slice 0 is complete as the availability/baseline audit plus the separately
authorized SDK access diagnostic. Slice 1 can proceed without a new API key,
Glimmer installation or another access probe; its initial journey uses explicit
offline fixtures and the existing local database. No new inference is required
to start that slice. S1 has not been started or authorized by this status query.

The revised proposal now makes S4a local Glimmer and S4b Vercel-backed Spark Open
buyer integration. The installed AI SDK and working key replace the proposed
direct Baseten credential requirement. All eight roles remain in scope. Core
journey, voice, creative assets and verification keep their existing order.

Remaining prerequisites belong to their owning slices: Glimmer runtime/weights
and memory-fit proof in S4a; real audio/media calls in S3/S5; structured buyer
decisions, usage recording and replay in S4b. A text smoke test does not complete
those integrations. Partner verification for the open-weight bonus remains open.

## Main checkpoint publication authorized, 2026-11-03

The user explicitly authorized: "U can commit and push the working tree to main
first, then the nexr agent can start from head. Once u do that, u can continue
wtiting the prompt". This supersedes the publication restriction for this
checkpoint only, including the normal push-triggered CI/hosting behavior.

Pre-publication baseline: local and remote main at `9b6819c`. The checkpoint
includes existing disclosure/label/query corrections, project HTML mockups,
proof-build plans/evidence, the participant-guide reference capture, and the
verified standalone AI SDK example. `.DS_Store` is now ignored. `.env.local`
remains ignored and was neither printed nor staged. A candidate-file credential
scan reported no findings. No original OpenRouter evaluation was restored.

Fresh checks: 469 unit/integration tests in 45 files passed with explicit local
`TEST_DATABASE_URL`; typecheck, lint and diff whitespace checks passed. A separate
snapshot without `.env.local` passed the production webpack build with dummy
configuration. No inference, hosted database write or manual hosting action was
needed for publication checks. No fresh browser/E2E result is claimed here.

This checkpoint does not implement revised S1 or authorize S2. The requested
handoff will authorize a receiving agent to execute revised S1 only when the
user sends that prompt. Existing historical S1–S10 records are a different
sequence and must not be interpreted as completion of the new proof-build S1.
