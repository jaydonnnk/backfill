# S5 accepted asset and publication boundary

This checkpoint contains only S5. Its owner-photo workflow, official SAM decoder,
deterministic composition, exact approvals, local migration 0017 and offline/live
proof receipts are included. Later S6 implementation and evidence are excluded.

Read s5-handoff-2026-11-03.md for original scope, s5-local-design.md for chronology,
s5-manual-inputs.md for supplied rights/approvals, and these evidence records:

- evidence/s5-final-approval-2026-11-04-01/README.md.
- evidence/s5-composition-2026-11-04-01/README.md.
- evidence/s5-live-authorized-2026-11-04-01/README.md.
- evidence/s5-codec-2026-11-04/README.md.
- evidence/s5-publication-2026-11-04/README.md.

## Accepted exact artifact

Asset d6289c3d-fcbe-4227-b32c-98ad499d8171 was approved for local use against
original synthetic rule f314412a-bc0e-4385-89b1-26b524feda45, terms version 1.
The PNG SHA-256 is de412d6a7b30c60e8ee92da9bd15c9a4eb61856d286f2ff7c3a8b13af7905a9a.
The user separately approved corrected cutout SHA-256
46072bf9f46456db8f9032cf582cc7a1d16e26df3a90fe8cd5c218db4ff1c7c8.
All 403,621 selected source pixels were verified unchanged. A repeated final
approval returned already_approved. Approval does not transfer to other terms.

The raw SAM mask missed the rice interior. Keep that raw result and its receipts;
do not claim perfect segmentation. The explicit local correction restores the
bowl interior from the source image only. Saved outputs are replayed for local
composition, with no new inference or fabricated model reasoning.

## Private inputs and proof

Original photo: archive/proof-s5-inputs/owner-meal-2026-11-04.png.
Raw media: archive/proof-s5-live-authorized-2026-11-04-01/.
Corrected cutout: archive/proof-s5-review-2026-11-04-01/.
Final image/state: archive/proof-s5-final-approval-2026-11-04-01/.
These ignored files are not shipped in Git. Fresh clones can run fixture proofs
but cannot independently repeat the private-photo proof without those inputs.
Five frozen source snapshots use .ts.txt suffixes; filename-map.json preserves
the mapping and their bytes match the pre-dispatch source hashes.

## Boundaries

Both the one SAM and one Image allowances are consumed/closed. Never rerun
proof-s5-live.ts --run, retry/poll/fallback, delete markers, or reuse that authority.
Normal creativeDeps remains disabled. Do not load real env files in tests.

The user authorized this S5 commit/push with [skip render]. No public image posting,
production access/write/migration, deployment or new model call is authorized.
Migrations 0015/0016/0017 have disposable local proof only. Later slices must use
their own separate scope and approval; this S5 checkpoint does not publish them.
