# S4a Gateway migration, 2026-11-03

Authorized work is local installation removal, hosted Glimmer integration,
documentation and independent offline verification. No new inference is authorized.
Genuine hosted S4a proof and full S4 acceptance remain incomplete. S4b genuine
proof and its consumed five-call allowance remain unchanged.

## Removal and provenance

[Removal receipt](removal-receipt.json) records 16,795,203,551 regular-file bytes
removed across 46 files from exactly `archive/proof-s4-models/`. The pinned weight
SHA-256 matched, and every extracted runtime file/link matched its archive member.
No unexpected material or matching model process existed. No process was stopped
or model restarted. Only this task-owned installation was removed. Byte totals
count regular-file content, not physical filesystem blocks or symlink sizes.
[Inventory](removal-inventory-before.json), [process check](model-processes-before.txt),
[preserved help](retired-runtime-help.txt).

The two historical local launchers now refuse before imports, configuration,
startup or dispatch. The consumed live preload also refuses. The unused local
UI helper was removed; the GGUF census refuses to overwrite historical results.
[Historical source snapshots and original hashes](historical-source/manifest.json)
preserve the exact original scripts and adapter/service source as text. Historical
model-load receipts still describe two guarded stops before readiness and zero
local parser requests. Neither a kernel crash nor universal hardware failure is claimed.

## Current contract and decisions

`/buyer` sends its request/reference clock to hosted `meta/muse-glimmer-30b`
through installed `ai` 7.0.162. The public endpoint recheck lists `togetherai`;
the parser pins that provider with `only`. This is Gateway access, not a direct
Together AI account or a self-hosted deployment. Spark Open remains its separate
buyer-decision role and its adapter is unchanged.

The parser requests exactly seven JSON fields, then strictly validates actual
final text and stop status. Initial limits are low reasoning, 512 output tokens,
45 seconds, temperature 1 and zero SDK retries. The official
[Meta hosting guidance](https://dev.meta.ai/docs/muse-glimmer/deploy) and
[model card](https://huggingface.co/meta-models/Muse-Glimmer-30B) recommend sampling
rather than the retired adapter's greedy temperature 0. Meta's published defaults
also include top_p 0.95/top_k 64. These two options are not listed in the checked
Gateway endpoint's supported parameters, so this adapter does not assert or send
them. Effective hosted sampling still needs genuine validation.

Unknown fields remain null; the buyer can clarify, correct, review or discard.
Parsing/review never approves a commitment. Edits invalidate prior decisions and
exact approvals. Existing ownership, expiry, durable duplicate reservations,
MCP, pricing/capacity checks, settlement, four independent parties and Kopi remain.
Hosted disclosure replaces local/on-device claims. No merchant floor, voice or
private rationale enters the buyer prompt; hidden reasoning is never retained.

Receipts retain requested model, Gateway route, supplied upstream and token usage.
Unknown invoiced cost stays null, including rejected final output. A rejected
parser receipt now belongs to `parseReceipt`, not `decisionReceipt`. The installed
SDK synthesizes `response.modelId` from the requested model when the wire does not
supply identity; Glimmer leaves `servedModel` null rather than treating that as
verified served weights. Genuine Glimmer upstream identity remains unproven until a call.

A new disabled `BACKFILL_S4_HOSTED_GLIMMER_APPROVED` switch prevents an old local
approval or Spark Open switch from authorizing hosted parsing. No live runner is
prepared here. Funding/access must be resolved before preparing a separately
scoped exact run and its durable dispatch guard.

Fixtures identify their role and remain `source: fixture`. Replay stays
`recorded_replay`; a real model name cannot promote fixture provenance. The five
existing genuine S4b recordings replay successfully with network forbidden, while
missing Glimmer fields remain null. [Fresh read-only replay audit](s4b-replay-audit.json).

## Funding and access

[Read-only eligibility receipt](eligibility.json),
[actual public provider-row HTML](glimmer-provider-row.html),
[endpoint metadata](glimmer-endpoints.json).

The checked provider row's accessible label is **Free AI Gateway Credit: No**.
Vercel's [pricing documentation](https://vercel.com/docs/ai-gateway/pricing) says
free monthly credits cover only an eligible subset. The user's approximately
US$5 is free monthly allowance, not purchased credit or a freshly checked balance.
Public Glimmer rates are US$0.35/M input and US$1.50/M output. Catalog access,
prices and the generic free-credit banner do not establish funded model access.

No inference request, account/billing change, credit purchase, installation,
downloaded runtime/model, production access/write, commit, merge, push, deployment
or S5 work occurred in this migration. Genuine hosted S4a proof remains blocked by
free-credit eligibility/access and separately scoped run authority. Do not use a
chargeable smoke request to discover eligibility. S3, S4b and both local-start
allowances remain consumed. Historical November 5 recordings retain their original
inputs and dates; expiry must be checked before any future approved run.

## Verification

Baseline: 543 tests in 56 files, typecheck and lint passed with explicit loopback
configuration and real credentials removed from the environment. New parser,
authority and receipt tests have retained red/green logs.

Fresh final checks on the revised tree:

- **546 tests in 57 files passed**, including real services, MCP and disposable
  PostgreSQL. [Full suite](full-tests.txt), [service journeys](service-journeys.json).
- [Typecheck](typecheck.txt), [lint](lint.txt) and Git whitespace checks passed.
  An initial typecheck found the new launcher test omitted required `NODE_ENV`;
  it was corrected before final checks. No product behavior changed for that fix.
- [Three offline dispatch/retirement guard tests](guard-tests.txt) passed.
  Parser/receipt regression [red](parser-red.txt) and [green](parser-green.txt),
  hosted-authority [red](authority-red.txt) and [green](authority-green.txt),
  preload-retirement [red](preload-retirement-red.txt). Synthetic SDK transports
  exercise request serialization and validation; they are not hosted evidence.
- [Original production build](browser/attempts/2026-11-03T13-36-04-546Z/production-build.txt)
  and [fixture production build](browser/attempts/2026-11-03T13-36-04-546Z/fixture-production-build.txt)
  passed in an allowlisted copy without env files, Git or archive, using dummy
  configuration and installed dependencies only.
- **All 22 combined S1/S2/S3/S4/Kopi Chromium checks passed** with zero retries.
  [Browser log](browser/attempts/2026-11-03T13-36-04-546Z/browser-test.txt),
  [isolation](browser/browser-isolation.json), [exact source manifest](browser/source-manifest.json).
  Four independent buyer UI journeys ran twice from fresh state. Eight covers
  remained pending until simulated settlement; the three-party case filled zero.
  Correction, ambiguity, missing/exact approval, interrupted submission, stale
  responses, cross-party access and expiry guards passed.

Only model dependency factories were replaced in the fixture build. UI, HTTP,
services, MCP and PostgreSQL ran unchanged. Original product build was checked
separately. Fixture outputs and scripted synthetic actions do not prove real
people, actual model decisions, merchant demand, payments or attendance.

Actual 1280/375 captures, all six visually inspected, with PNG width and no
horizontal overflow asserted:
[unapproved desktop](browser/buyer-unapproved-1280.png),
[unapproved mobile](browser/buyer-unapproved-375.png),
[pending desktop](browser/buyer-pending-1280.png),
[pending mobile](browser/buyer-pending-375.png),
[clarification desktop](browser/buyer-clarification-1280.png),
[clarification mobile](browser/buyer-clarification-375.png).
Kopi and its dismissible speech bubble remain; the bubble overlays some text in
these captures. No new layout or controls were introduced beyond hosted copy.

[Cleanup](browser/browser-cleanup.json) confirms the owned server stopped, zero
owned databases/roles remained and the copied source/build directory was removed.
[Preservation audit](preservation-after.json) checked all 513 inherited evidence
files. 512 match byte for byte; the evidence index has only a superseding status
prepend and its entire original body still hashes identically. Genuine S4b/CPU
records and every consumed marker are unchanged. [Source preservation](source-preservation.json)
checks all 101 prior product files: 97 unchanged and exactly four intentional
buyer-module/UI changes. HEAD/main/origin/main stay at `b1df9ad`; nothing is staged.
[Independent review](independent-review.json) reported no actionable findings.

## Exact verification commands

```sh
npm run typecheck
npm run lint
env -u DATABASE_URL -u META_API_KEY -u AI_GATEWAY_API_KEY \
  TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres \
  S4_EVIDENCE_DIR=docs/plans/backfill-proof/evidence/s4-buyer-models/gateway-migration-2026-11-03-01 npm test
node --test scripts/verification/proof-s4-live-guard.test.mjs scripts/verification/proof-s4-live-preload.test.mjs
env -u DATABASE_URL -u META_API_KEY -u AI_GATEWAY_API_KEY \
  TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres \
  S4_OUTPUT_DIR=docs/plans/backfill-proof/evidence/s4-buyer-models/gateway-migration-2026-11-03-01/browser \
  node --import tsx scripts/verification/proof-s4-browser.ts
env -u DATABASE_URL -u META_API_KEY -u AI_GATEWAY_API_KEY \
  S4_REPLAY_OUTPUT=docs/plans/backfill-proof/evidence/s4-buyer-models/gateway-migration-2026-11-03-01/s4b-replay-audit.json \
  node --import tsx scripts/verification/proof-s4-replay-audit.ts
git diff --check
```

These record the commands actually run. Future verification must choose a fresh
S4-owned output directory. Do not overwrite these receipts or genuine evidence.
The replay audit exclusively creates its output and refuses an existing result.
