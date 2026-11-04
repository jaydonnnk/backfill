# S5 bounded genuine media run, 2026-11-04

The user authorized the pinned SAM parser installation and model calls. This run
made exactly one `sam-3.1` still-image request and one `muse-image-1.0` background
request. Both returned HTTP 200 and valid media. Both dispatch slots are consumed
and closed. No retries, polling, fallback, public posting or production changes.
Actual invoiced cost is unknown. The verified API list-price ceiling was US$0.0125.

## What was observed

- The original owner photo is unchanged, 960 x 1280, with its SHA-256 pinned in
  [the exact run recipe](approved-run.json). Three stable box-prompt IDs requested
  cutlets, rice bowl and covered soup bowl in one image request.
- The official installed parser decoded all three actual one-bit mask outputs.
  Actual owner-bound services ran with the real photo and genuine segmentation
  against a disposable restricted-role database. This direct runner did not
  exercise cookie authentication; that has separate browser proof.
- [Raw pixel proof](pixel-proof.json) verifies the first cutout's 278,806 selected
  source pixels. [Service receipt](service-receipt.json) retains `cutout_review`
  and null approvals. [Cleanup](cleanup.json) confirms owned DB/role removal.
- Visual review found a semantic miss: SAM selected the rice-bowl rim but omitted
  its rice contents. The original mask/cutout and raw response remain unchanged.
  Structural validity and pixel preservation do not establish complete isolation.
- [Local correction](local-mask-correction.json) restores the bowl interior from
  the original photo using a tested deterministic flood fill. It adds 124,815
  source pixels. All 403,621 pixels in the corrected candidate match the original.
  It is a locally corrected SAM-derived cutout, not unmodified SAM output.
- Muse Image returned a valid 1600 x 1600 decorative background. Its fixed prompt
  received no photo, food, offer terms, private floor or owner voice. It is saved
  separately and has not been composed or approved.

## Private artifacts

The original photo, exact photo-bearing request, provider raw responses, raw
cutout and background remain in ignored local storage. They were not copied into
public/ or committed. User permission covers local review, not public posting.

- Original photo: `archive/proof-s5-inputs/owner-meal-2026-11-04.png`.
- Raw outputs and raw cutout: `archive/proof-s5-live-authorized-2026-11-04-01/`.
- [Pinned dispatch-source archive receipt](approved-source-archive.json). All nine
  source bytes match the hashes frozen before dispatch; the one later modified
  parser source was reconstructed and verified against its original hash.
- Corrected candidate and side-by-side HTML review:
  `archive/proof-s5-review-2026-11-04-01/review.html`.
- Corrected cutout:
  `archive/proof-s5-review-2026-11-04-01/cutout.png`.
- Checkerboard preview:
  `archive/proof-s5-review-2026-11-04-01/cutout-review.png`.
- Background:
  `archive/proof-s5-live-authorized-2026-11-04-01/background.png`.

The checkerboard is only a transparency review background, not the promotional
composition. Original hidden RGB under transparent pixels is retained in the
raw cutout, so inspect the alpha-aware checkerboard preview for what is selected.

## Remaining human review

The corrected cutout needs the owner's explicit approval before composition.
Then compose the saved real cutout and saved genuine background with the exact
synthetic public terms for separate final approval. No further inference is
needed for those steps. Any new model request needs renewed authorization.
No cutout approval, final asset approval, composition, posting or S6 occurred.

[Decoder/offline checks](../s5-codec-2026-11-04/README.md),
[manual inputs](../../s5-manual-inputs.md),
[continuation](../../s5-continuation-2026-11-04.md).
