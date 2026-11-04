# S5 owner-approved cutout composition

The user replied "Sure" to approving the exact corrected cutout for composition
with the saved generated background. [Approval](cutout-approval.json) binds the
cutout SHA-256, source, background, original synthetic rule/version and exact text.
This authorizes the cutout step only. Final asset approval is still absent.

The actual owner-bound services replayed the saved corrected mask and genuine
background in a disposable restricted-role loopback database. The original
merchant/rule IDs, version 1 and exact synthetic public terms were restored.
A fresh asset ID preserves the immutable original raw SAM record.

[Composition receipt](composition-receipt.json) verifies all 403,621 selected
source pixels in the actual final PNG at native resolution. The composition
is explicitly labeled replay, synthetic local review and generated background.
No provider client or env loader is used. HTTP is disabled in this runner, and
all original paid-call markers/receipts were verified unchanged before and after.

- Preview: `archive/proof-s5-composition-2026-11-04-01/offer-preview.png`.
- Standalone review: `archive/proof-s5-composition-2026-11-04-01/review.html`.
- Private state for continuing the exact asset:
  `archive/proof-s5-composition-2026-11-04-01/private-state.json`.
- Asset SHA-256:
  `de412d6a7b30c60e8ee92da9bd15c9a4eb61856d286f2ff7c3a8b13af7905a9a`.
- [Cleanup](cleanup.json): owned database and role removed; no production changes.
- [Source stability](source-stability.json): product bytes and verification inputs
  still match the prior 24-check browser proof. This is not a new browser run.

The composition runner has independent literal text, image/hash and source-pixel
assertions. Fresh typecheck, lint and focused S5 tests are recorded in checks.json.
The image and full media/state remain ignored/private. Nothing was posted,
committed, pushed or deployed. No new inference occurred. Both earlier model
allowances remain consumed/closed. No S6 work occurred.
