# S5 local design and execution record

Authority: s5-handoff-2026-11-03.md and the user's 2026-11-04 request authorize
local implementation and offline proof only. No inference, installation, model or
package download, production, publication, commit, push, deployment or S6.
Baseline: main at 298d9e7, with only the handoff/manual-input files untracked.

## Decisions before implementation

- Reuse authenticated merchant workspace, rule/version, public termsSummary,
  photo validation and Kopi. Add one optional review workflow per offer.
- Store private source and derived PNGs in one bounded creative-asset record in
  disposable PostgreSQL, migration 0017 local only. No public asset endpoint.
- Source upload, segmentation, cutout approval, composition and exact final
  approval are separate actions. Approval records bind asset hash and offer
  version. Rejection is terminal. Stale terms block all subsequent actions and
  asset delivery; historical metadata remains inspectable by the owner.
- Only source RGB pixels enter the cutout. Binary masks replace alpha. Place the
  cutout at 1:1 scale on a canvas with a separate deterministic text band. Do not
  resize, regenerate or paint over food. Existing installed sharp handles image
  decoding/PNG encoding. No dependency installation.
- Muse Image receives only a fixed decorative-background prompt, never the
  photo, offer, private floor, voice, merchant rationale or arbitrary owner text.
- Model calls reserve a durable phase before the boundary and never retry. The
  production dependencies remain disabled pending a separately approved run.
- Official SAM payloads use base85 arithmetic coding, not raw bits or PNGs.
  @meta-sam/parser is not installed. Its installation/download is not authorized.
  Implement wire/transport checks and a decoder boundary; offline fixtures
  supply independently authored binary masks. Do not claim genuine SAM decoding
  or substitute a guessed arithmetic codec. This missing capability blocks the
  genuine pipeline, not local composition/review work.

## Work sequence

1. Tests for strict raster validation, exact pixel cutouts, deterministic public
   text composition and bounded media transports. Observe missing-feature failure.
2. Local schema/service for ownership, durable reservations, approval, duplicate,
   stale, failure and privacy behavior. Test through restricted runtime role.
3. Authenticated UI/actions/private media route and model-boundary-only fixtures.
4. Typecheck, lint, full local tests, offline guards, real/fixture builds and
   combined S1/S2/S3/S4/S5 desktop/mobile browser proof under a fresh S5 root.
5. Review, compact manifest/cleanup receipt and continuation blockers. Preserve
   all earlier evidence and consumed-call markers.

## Progress

- Design recorded before product edits. Photo and target object are pending.

- Core implementation initially passed 15 new tests and all 565 repository tests.
- Fresh review found wide-glyph clipping and missing database immutability guards.
  Both regression tests failed before their fixes and passed afterwards. Pango
  now wraps actual rendered glyphs; the database rejects identity/provenance,
  previously stored artifact and resolved approval changes.
- Original browser snapshot passed its combined checks. It predates the review
  fixes; a fresh full run is required for final acceptance of the corrected bytes.
- Ruling: installed sharp is reused from Next's existing dependency tree. No
  dependency or lockfile changes, downloads or installations were performed.
  A future removal of Next's sharp dependency would require explicitly retaining it.
- Ruling: the SAM codec remains a declared missing capability. Fixture decoding
  proves geometric placement and binary masks only; it does not prove arithmetic
  payload decoding. Read-only official contracts and list prices are documented
  in s5-media-contract.md. No real call is enabled or represented as approved.
- An additional offline regression showed plain-background composition was
  unnecessarily gated on model availability. It failed before the fix and passes
  now, with zero model-boundary calls. Only segmentation or a requested generated
  background requires media access.
- One full-suite invocation failed four evidence writes because its new S1/S2/S4
  directories were not precreated. No assertion was weakened; a fresh directory
  tree and full rerun passed 567 tests. This was command setup, not a product fix.
- A final browser snapshot started before the last plain-composition fix. Its
  root-source stability guard must refuse final-byte acceptance after that edit.
  Its captures/results are superseded; retain the failure receipt and archive
  repeated material. Run a new source-stable snapshot for final proof.

- Final corrected source passed 568 tests in 60 files, eight offline guards,
  typecheck, lint, both production builds and all 24 combined browser checks.
  Final source hashes stayed stable; the owned server/database/role/snapshot were
  removed. Desktop/mobile captures and actual fixture PNGs were visually reviewed.
  Prior evidence and consumed markers remain unchanged. No further product work
  independent of the photo, decoder resource authorization or live-call approval
  remains. Full S5 model acceptance is explicitly incomplete.
- Post-slice scope review found all new product modules referenced by the owner
  workflow, services or tests; no orphan product modules or temporary dependencies
  were added. Repeated S5 evidence was archived, not mixed into prior proof.

## User-authorized decoder and bounded calls, 2026-11-04

The user explicitly authorized the installation and model calls after supplying
one rights-cleared meal photograph. This supersedes the earlier installation/
inference prohibition only for the named parser and this one bounded media run.
Production, commit/push/deploy, posting, final asset approval and S6 remain outside
scope. Record the actual outputs before asking for cutout or final-asset review.

- Installed only @meta-sam/parser@0.1.0 with lifecycle scripts disabled; verified
  pinned integrity and that all prior package versions/lock entries stayed fixed.
- Replaced the handwritten single-object decoder with the official codec. Public
  conformance vectors independently cover arithmetic one-bit and lossless raster
  expectations. Explicit box prompts select cutlets, rice and covered soup bowl
  in one still-image request; exact stable IDs must all be present before union.
- Pre-dispatch review found decoder allocation limits had to run before calling
  the official parser. A new regression failed first; structural preflight now
  limits dimensions, counts and decoded work before any parser allocation.
- Direct service execution is described as owner-bound. Authentication remains
  covered by the existing real-browser proofs; a minted owner ID is not itself
  proof that this runner exercised authentication.
- Fixed live scope is one SAM request plus one optional Image background, no
  retries, polling, redirects or fallback. Published API list ceiling US$0.0125;
  invoiced costs stay unknown. New durable per-model markers reserve before each
  POST. Photo/raw outputs stay in ignored private storage. Final composition is
  held until the user reviews the actual cutout; call approval never supplies it.

- The authorized fixed run made exactly one SAM and one Image POST. Both returned
  HTTP 200 and valid decoded media. Markers and raw outputs are retained; no retry,
  polling, fallback, production change or publication occurred. Owned runtime DB
  and role were dropped. Both allowances are now closed. Actual invoice is unknown.
- Visual inspection caught a semantic miss after structural/pixel success: SAM
  selected the rice-bowl rim while omitting the rice interior. This limitation is
  retained in the raw result and original cutout; it is not relabeled as success.
- A tested deterministic bowl-interior fill, explicitly limited to component 1,
  closes the source-clipped left rim between actual edge intersections and fills
  enclosed pixels. It restores original source pixels only, with no inference or
  generated food. The raw and locally corrected cutouts remain independently
  inspectable. The corrected candidate is awaiting the user's cutout approval.
- All 403,621 selected pixels in the corrected cutout exactly match the source.
  Of those, 124,815 were restored by local postprocessing. This is a corrected
  SAM-derived candidate, not a claim that raw SAM correctly isolated the whole meal.

- Final continuation verification passed 576 tests/62 files, 10 offline guard
  checks, typecheck/lint, both updated production builds and all 24 combined
  desktop/mobile browser checks. Final source hashes stayed stable and owned
  verification resources were removed. Raw/live results and consumed markers
  remain immutable. Only the owner's exact cutout approval blocks composition.

## Cutout approval and local composition

- The user's "Sure" approved the exact corrected cutout for composition with the
  saved background. That approval is recorded against its hash and original
  synthetic offer/version. It does not approve the final asset or public posting.
- The new offline runner restores the same synthetic owner/rule/version, creates
  a fresh creative asset, replays saved outputs, applies approveCutout and uses
  composeCreative. It verifies exact public text, background/cutout hashes and
  all 403,621 selected source pixels in the actual composed PNG. HTTP is disabled.
- Actual composition remains in phase review with null final approval. Private
  full state is saved for a later exact-asset decision; the owned DB/role are gone.
- Five immutable source snapshots from the paid-run archive were renamed .ts.txt
  because the root TypeScript glob included evidence .ts files. All bytes and
  frozen hashes remain unchanged; filename-map.json records the paths. No product
  source or earlier evidence/consumed-call receipt was changed.

## Final acceptance and move to S6

The user approved the exact final local asset and instructed moving to the next
step. Its PNG reproduced byte-for-byte before decideCreative saved approval;
repeating the decision was idempotent. New DB/role were removed, old receipts and
consumed markers preserved, and no inference or public posting occurred. S5 is
accepted locally with the raw SAM rice miss and deterministic correction retained.
Independent local S6 work is now authorized; new inference, publication, production,
commit/push/deploy and S7/S8 remain outside scope.
