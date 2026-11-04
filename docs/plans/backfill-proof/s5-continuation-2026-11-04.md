# Historical S5 continuation, now accepted locally

The user subsequently approved the exact final asset. Its final approval and
idempotence receipt are in `evidence/s5-final-approval-2026-11-04-01/`. No further
S5 approval is missing. Current work has moved to independent local S6; use
`s6-handoff-2026-11-04.md`. Earlier instructions below describe the prior S5 state
and are preserved for provenance, not as the current approval state.

# Continue Backfill S5 after genuine media calls

Work in `/Users/jayd0/Desktop/meta-hack`. Read the original S5 handoff, the current
s5-manual-inputs.md, s5-local-design.md and these current evidence records:

- `evidence/s5-live-authorized-2026-11-04-01/README.md`.
- `evidence/s5-codec-2026-11-04/README.md`.
- `evidence/s5-local-2026-11-04/README.md` for earlier fixture proof only.

## Authorization and frozen state

The user authorized installation and model calls after supplying the meal photo.
Installed only @meta-sam/parser@0.1.0 with lifecycle scripts disabled. Exactly one
SAM image request and one Muse Image background request returned HTTP 200 and valid
media. BOTH ALLOWANCES ARE CONSUMED/CLOSED. Never run proof-s5-live.ts --run again,
retry those requests, delete markers, change the run recipe or create another run
under the old authorization. No buying credit, further inference, production,
commit/merge/push, deployment, posting or S6 is authorized.

Everything remains local/uncommitted on base 298d9e7. Migrations 0015/0016/0017 are
local only. Preserve all unrelated work, historical S1-S4 evidence, and all S5
outputs/markers. A later separately authorized push must still use [skip render]
while production rollout remains unapproved. No live credentials belong in chat.

## Actual image result and current approval

Photo: `archive/proof-s5-inputs/owner-meal-2026-11-04.png`, unchanged 960 x 1280.
The user called it "gyukatsu pork tenderloin, rice, miso soup"; meat and soup labels
are user-supplied. The soup is covered and some bowl/food edges are source-cropped.
Do not generate unseen food or change original food pixels.

The genuine SAM masks returned all three explicit IDs, but the rice component
contained only the bowl rim. Preserve that failure as evidence. A tested local
bowl-interior flood fill restored actual photo pixels; it is explicitly a local
correction, not a claim that raw SAM selected the rice correctly.

- Raw genuine outputs and raw mask/cutout:
  `archive/proof-s5-live-authorized-2026-11-04-01/`.
- Raw output/current marker hashes are in the corresponding evidence root.
- Corrected candidate `archive/proof-s5-review-2026-11-04-01/cutout.png`.
- Alpha-aware preview `archive/proof-s5-review-2026-11-04-01/cutout-review.png`.
- Side-by-side review `archive/proof-s5-review-2026-11-04-01/review.html`.
- Genuine background `archive/proof-s5-live-authorized-2026-11-04-01/background.png`.
- Correction receipt `archive/proof-s5-review-2026-11-04-01/derivation.json`.

The corrected cutout's 403,621 selected pixels exactly match the source; 124,815
were restored locally. The user's later "Sure" approved this exact corrected
cutout. Composition now exists; final asset approval and public posting remain
unapproved. Default creativeDeps remains disabled.
Actual invoice is unknown; the verified two-call API list-price ceiling was $0.0125.

## Current final preview and next action

- Exact preview: `archive/proof-s5-composition-2026-11-04-01/offer-preview.png`.
- Review HTML: `archive/proof-s5-composition-2026-11-04-01/review.html`.
- Asset SHA-256: de412d6a7b30c60e8ee92da9bd15c9a4eb61856d286f2ff7c3a8b13af7905a9a.
- State: phase review, cutout approved, final asset approval null.
- Receipt: `evidence/s5-composition-2026-11-04-01/composition-receipt.json`.
- Exact private state: `archive/proof-s5-composition-2026-11-04-01/private-state.json`.

If the user approves the final preview, bind that decision to the exact asset hash,
original rule f314412a-bc0e-4385-89b1-26b524feda45 and version 1. Reconstitute the
same replay state in a disposable local DB through ordinary services, preserving
its asset ID, source/cutout/background and exact text. Reapply the already recorded
cutout approval, compose deterministically, verify the final hash matches exactly,
then call decideCreative with that hash. Never bypass database guards to insert a
resolved record. A different hash or changed terms needs fresh review.

If the user rejects or asks for edits, preserve the decision and existing asset.
Do not infer approval, change original food pixels or invoke another model. A new
model request needs new authorization. Final asset approval still does not permit
public posting, commit/push/deploy, production changes or S6.

The composition runner uses no env loader or upstream client and disables HTTP.
Both actual paid-call allowances remain closed. Five frozen dispatch-source
snapshots now have .ts.txt suffixes to keep them out of the root TypeScript glob;
their bytes and hashes are unchanged, with an archive filename-map.json.

## Fresh checks

Final source passed 576 tests/62 files, typecheck/lint and 10 offline guards.
Both updated real/fixture production builds and all 24 combined desktop/mobile
browser checks passed, with stable final hashes and owned-resource cleanup. Earlier fixture proof passed 24 combined
checks. The local DB/role used by genuine calls were removed. All review HTML is
standalone .html, never a .tsx visualization. Do not call full S5 complete until
required human approvals and current acceptance checks actually exist.

Fresh composition evidence verifies all 403,621 selected pixels and the exact
synthetic public text, zero new model calls, null final approval, immutable prior
call receipts and owned-resource cleanup. Product and browser-verification input
hashes still match the previous accepted browser run; no new browser claim is made.
