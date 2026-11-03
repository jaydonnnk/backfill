# Revised S3 owner voice

Current result, 2026-11-03: **local implementation and genuine integration
verified** for the prepared synthetic speech and scripted owner actions.
[Approved four-call run and actual evidence](live-authorized-2026-11-03-01/README.md).
All four requests returned HTTP 200. The clear proposal applied only after
separate approval; the ambiguous case clarified and changed nothing. The
allowance is consumed. No further inference, production action or publication
is authorized.

## Historical offline checkpoint

The following evidence records the earlier fixture-only verification. Its
blocked/no-inference statements predate the genuine run above. The original
offline result is preserved byte-for-byte in [offline-result.json](offline-result.json).
The current result is [final-result.json](final-result.json).

Local implementation and verification only, 2026-11-03. Base
`96a3cb76ba757fc252e398757ce55ceebb895a66`, branch
`backfill/proof-s3-owner-voice`. [Decisions](decisions.md) preceded code.
This is revised proof-build S3, not the historical S1-S10 sequence.

**Local implementation verified; genuine integration verification blocked.**
No paid inference was authorized or executed. S3 is not fully accepted.

## What changed

Each existing offer in the authenticated merchant workspace has a small voice
panel. It accepts a byte-validated WAV, presents a transcript for correction,
requires a saved transcript review, then requests Wonder's exact four-field
before/after proposal. Only a separate "Approve this exact change" action
can apply its stored proposal ID. Text review and transcribed yes/okay never
dispatch confirmation. Initial publication remains the existing menu flow.

The supported WAV scope is mono signed 16-bit PCM, 16/24 kHz, at most
60 seconds and 3 MiB. Authentication, format, bytes, size, duration, owner and
selected rule/version are validated before an ASR request. There is no
application converter or new dependency. Original audio is dropped after the
request; its hash and PCM duration remain in the owner's private edit record.

Web edits have separate storage and identity. `owner_changes` distinguishes a
WhatsApp inbound ID from a web voice edit/review revision. No phone or message
ID is invented. The service reuses `OwnerChange`, `judgeOwnerChange`, settlement
and the authoritative SQL `apply_owner_change` protections. Migration
`0015_proof_s3_owner_voice` was applied only to disposable local databases.
It must not be applied to production without separate authorization.

Every upload/proposal is reserved before network work, and failed/interrupted
reservations count toward per-owner limits of 30 uploads and 30 proposals per
rolling day. Each edit allows 10 transcript reviews and expires after 15 minutes.
Same-file retry in the mounted panel retains the same rule/version/hash-bound
request ID. Explicit discard permits a fresh upload. Cancellation, correction
and replacement cannot resurrect an in-flight result. Approval matches the
exact owner, rule, version, full before-values, transcript revision and proposal.

Window/private-floor requests, including mixed requests, explain the manual
menu-review/replacement route and apply nothing. Ambiguity asks for corrected
explicit values. Output is schema-validated, bounded and rendered as text.
No reasoning trace is requested or displayed. Actual model interpretation and
transcription quality remain unverified.

## Provenance and assurance

- Audio: browser proof uploads generated one-second silence, SHA-256
  `643f8a8dc8bd9c19225afffad2becfec5426180b3749cb208abdf1a6c8354efc`.
  It is a format/transport fixture, not speech. Its attached authored transcript
  cannot prove ASR. Separately prepared [speech inputs](inputs/audio-provenance.json)
  contain actual locally synthesized words, but have not been sent to a model.
- Transcript: `source: fixture`, Voice model label, provider-session fixture ID,
  raw text, reviewed text/revision and review time are stored privately. The
  original transcript/provenance cannot be rewritten after it is recorded.
- Wonder: an immutable `owner_changes` record identifies the edit/revision,
  selected rule/version, authored message, model label and bounded proposal.
  Browser fixtures are `fixture:s3-wonder`; none are attributed to real Wonder.
- Approval: the authenticated server action records its exact proposal outcome,
  approval timestamp and resulting terms version atomically with application.
  All owner clicks in these tests are scripted. They prove the control path,
  not real-person merchant consent, identity assurance or genuine model use.

Voice accounting uses PCM/provider duration, not token fields. Missing actual
audio cost stays null. Wonder retains the existing token accounting path.
Provider adapters perform one attempt, reject redirects, and time out after
30 seconds. The isolated browser substitutes only the Voice/Wonder dependency
factory, leaving actions, services, authentication and database writes real.
Fixtures are not a product-mode fallback.

## Verification

Fresh baseline passed typecheck, lint and 496 tests in 49 files. The final full
suite passed **522 tests in 52 files**, including the unchanged S1/S2 tests.
[Full test log](full-tests.txt), [typecheck](typecheck.txt), [lint](lint.txt),
[focused backend regressions](backend-regressions.txt),
[ASR contract tests](voice-provider-green.txt).

[Service receipts](service-receipt.json) record before/after values and unchanged
failure states. Tests exercise cross-owner access at every boundary; no approval
before a separate action; exact revision/ID matching; yes/okay; corrected and
replaced instructions; mixed unsupported requests; ambiguity; bad audio; failed,
invalid and below-floor output; expiry; supersession; pending commitments;
in-flight cancellation/correction; request collisions; caps; and concurrent
duplicate application. Public buyer payloads exclude private records and floors.

Real defects were demonstrated red before fixes:

- [Capacity-only stale proposal](service-capacity-red.txt). Existing
  `termsVersion` does not advance for capacity alone. S3 now also compares the
  complete saved before-values under the rule lock.
- [Invalid PostgreSQL text](nul-output-red.txt). NUL/unpaired-surrogate model
  text is refused before storage, leaving a bounded failure rather than a
  stuck proposal. Oversized int4 values are refused at the same boundary.
- [Multipart JSON part](voice-multipart-red.txt). The ASR settings part now
  explicitly carries `application/json`.
- [Lost upload response](attempts/2026-11-03T05-42-49-350Z/browser-test.txt).
  The real transaction completed, its response was deliberately dropped, and
  retry created two rows before the fix. The fixed UI reuses its reservation.

The [first full-suite failure](full-tests-initial-failure.txt) was the inherited
prompt wording assertion. The existing data-boundary wording was preserved;
the subsequent full suite passed. Missing/nonlocal test URLs deliberately fail
before database access or env loading: [missing](missing-url-rejected.txt),
[nonlocal](nonlocal-url-rejected.txt).

Chromium final-run evidence and source/cleanup receipts are recorded by
`scripts/verification/proof-s3-browser.ts`. It builds original production code
with dummy model configuration, then a separate production fixture variant.
The copy allowlist excludes archive, env files, Git, build output and unrelated
material. It owns its dynamic port, server, database and runtime login.
All S1/S2 browser outputs go under this S3 directory. Historical S1/S2 evidence
is preserved. Redundant captures live only in the ignored local archive;
earlier attempt logs/receipts remain explicit failures or stale-source runs.

Final attempt `2026-11-03T05-48-26-214Z` passed **all 17 Chromium checks**,
including two fresh owner/offer states, transcript correction, cancellation,
wrong owner/session, mixed unsupported edits, public HTML/snapshot/SSE privacy,
and a completed-upload/lost-response retry that now retains exactly one edit.
[Original production build](production-build.txt),
[fixture production build](fixture-production-build.txt),
[Chromium log](browser-test.txt), [isolation](browser-isolation.json),
[source hashes](source-manifest.json), [cleanup](browser-cleanup.json),
[six PNG dimensions and local cleanup audit](final-audit.json).

The main browser case keeps 20%/8/8/2 unchanged until approval, then stores
25%/10/6/3 at v2. The corrected case stores 15% instead, after a new reviewed
revision/proposal. [Fresh run 1](browser-owner-run-1.json),
[fresh run 2](browser-owner-run-2.json),
[correction](browser-transcript-correction.json),
[failure states](browser-failures.json), [privacy](browser-privacy.json),
[lost-response retry](browser-upload-response-retry.json).

Actual final captures: [proposal desktop](owner-unapproved-1280.png),
[proposal mobile](owner-unapproved-375.png),
[approved desktop](owner-applied-1280.png), [approved mobile](owner-applied-375.png),
[corrected desktop](owner-corrected-1280.png),
[corrected mobile](owner-corrected-375.png). Desktop/mobile proposal and mobile
applied views were visually inspected. Kopi remains intact.

The first attempt failed on a browser label selector despite a saved transcript;
the selector was corrected. The second passed its 16 checks but was rejected
because backend source changed during the run. The third intentionally ran only
the new lost-response test and failed before its fix. Their logs remain under
`attempts/`; none is represented as the final passing run. Stale duplicate
receipts and redundant screenshots were moved to the ignored archive.

[Inherited preservation](inherited-preservation.json) verifies all 238 S2
published hashes against base HEAD and unchanged S1/S2 evidence. The older S1
manifest's status-file exception already exists in published HEAD; it predates
S2 publication and this task. Six current inherited source paths differ only
for the authorized S3 implementation/status changes. [SHA256SUMS](SHA256SUMS)
binds this final source/evidence set. Independent review found a retry-identity
defect; its fix passed scoped re-review and the real browser regression.

## Reproduce

Requires the already installed Node 24 dependencies/Chromium and PostgreSQL
18.6 at `127.0.0.1:5432`. No key, env-file read or dependency install is needed.

```sh
npm run typecheck
npm run lint
env -u DATABASE_URL -u META_API_KEY -u AI_GATEWAY_API_KEY \
  TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres \
  S1_EVIDENCE_DIR=docs/plans/backfill-proof/evidence/s3-owner-voice \
  S2_EVIDENCE_DIR=docs/plans/backfill-proof/evidence/s3-owner-voice \
  S3_EVIDENCE_DIR=docs/plans/backfill-proof/evidence/s3-owner-voice npm test
env -u DATABASE_URL -u META_API_KEY -u AI_GATEWAY_API_KEY \
  TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres \
  node --import tsx scripts/verification/proof-s3-browser.ts
git diff --check
```

## Genuine-evidence blocker and stop

No real Voice/Wonder call, account-access check, transcription, model-quality
measurement or invoice reconciliation was performed. Official contracts are
documented, not empirically verified. The [bounded run proposal](voice-contract.md)
pins two speech inputs, two ASR calls and two Wonder calls, no retries, and a
conservative published-rate ceiling of US$8.44. It awaits separate approval.

No commit, merge, push, deployment, production access/write or later slice ran.
S1/S2 pooling and approval behavior remains intact. Checkout is simulated;
payments, attendance and recovered revenue are unproven. Merchant validation
and video belong to the user. All eight Meta roles remain required overall.
