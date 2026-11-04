# S5 manual inputs

Local implementation can start with fixtures. These user-only values become
necessary before a genuine asset can be accepted. Technical setup, mask decoding,
hashes and price extraction are the agent's work.

## 1. Supply one real dish photo

Attach the original image in the S5 chat, or save it under ignored
`/Users/jayd0/Desktop/meta-hack/archive/proof-s5-inputs/` and provide its full path.
Do not put the original directly in `public/` or commit it. The agent can create
the ignored folder when needed. Prefer a clear, full-resolution photo with the
intended dish visible. This is a source photo, not an AI-generated substitute.

## 2. State the rights and intended use

Confirm that you took the photo or have the photographer's permission, and that
local processing/composition is permitted. Separately say whether sending it to
the named hosted segmentation provider is permitted. Name the dish to isolate if
there are multiple objects. Permission statements are user-supplied, not independent
verification of rights or merchant endorsement.

## 3. Identify the offer

Provide an existing local draft/offer link or ID if you want a specific one.
Otherwise say "synthetic local offer" and the agent will use clearly labeled test
terms. Do not send a merchant credential, bearer URL or private floor in chat.
The agent should read already available local public terms instead of asking you
to retype price, dates and conditions. If unavailable, it will show the exact
proposed public text for your review rather than inventing terms.

## 4. Give optional visual preferences

A style preference such as "warm cafe tabletop, room for text" is enough. You can
leave this blank. A decorative background does not authorize changing food pixels,
prices, logos or claims. No extra poster variants are required.

## Copy and fill

```text
Photo attachment or absolute local path:
Dish/object to isolate:
Rights basis: I took this photo / photographer gave permission
Local processing and composition permitted: yes / no
Upload to the named hosted segmentation provider permitted: yes / no
Offer: existing local draft/offer ID or link / synthetic local offer
Optional background preference:
Real public posting approval: none; local review only
```

## 5. Approve model calls only after a concrete run is prepared

Photo rights, code implementation and inference approval are separate. The agent
first provides the named provider/models, exact inputs, maximum calls, request/
output limits, retry policy and maximum spend. You can then approve or decline
that exact run. Earlier S3/S4 approvals are consumed. Never paste API keys or card
information into chat; any genuinely missing credential belongs in ignored local
configuration after the agent explains which variable the integration requires.

## 6. Review the actual composed asset

After generation, inspect the source/cutout/background and exact offer text.
Approve that specific asset/version or reject it. Your photo submission is not
asset approval, and asset approval is not permission to post publicly. A change
to offer terms requires a new review. Genuine merchant validation and video remain
separate work; synthetic values must not be presented as real customer evidence.

## User-supplied values, 2026-11-04

- Photo: received 2026-11-04 and copied byte-for-byte to ignored
  `archive/proof-s5-inputs/owner-meal-2026-11-04.png`. PNG, 960 x 1280,
  1,840,310 bytes, opaque. Actual S5 photo validation passed. Hash and inspection
  receipt are in the same ignored folder. No upload or inference occurred.
- Dish/object supplied verbatim: "gyukatsu pork tenderloin, rice, miso soup".
  Treat the cutlets, rice bowl and covered soup bowl as the intended meal set.
  Meat type and soup contents are user labels, not visually verified facts.
  Some rice-bowl and plate/food edges meet the photo boundary. Do not invent
  missing pixels or uncover soup with generation.
  Current single-object SAM adapter must not silently discard other components;
  multiple-object selection/union requires explicit validation before a live run.
- Rights basis: user states "I took it". This is not independent verification.
- Local processing/composition: yes.
- Hosted segmentation upload: yes, subject to the named provider and separate
  inference approval. The user subsequently authorized installation and calls;
  the bounded run made exactly one SAM request and one Muse Image background
  request, both HTTP 200. That two-call allowance is now closed. No retry,
  further inference, asset approval or public posting is authorized.
- Offer: synthetic local offer, visibly labeled; no merchant-demand claim.
- Background preference: blank; use the fixed decorative background prompt.
- Public posting: none; local review only.

## Actual cutout awaiting review

Genuine raw SAM masks selected cutlets, rice-bowl rim and covered soup bowl.
The rice contents were missing from the raw mask. The original SAM output and
cutout remain untouched. A deterministic local bowl-interior correction restored
124,815 pixels from the original photo, without generating or resizing food.
The corrected cutout preserves all 403,621 selected original pixels.

Review `archive/proof-s5-review-2026-11-04-01/review.html` and
`archive/proof-s5-review-2026-11-04-01/cutout-review.png`.
Genuine background: `archive/proof-s5-live-authorized-2026-11-04-01/background.png`.
Cutout approval is still missing. No composition or final approval was created.

## User approval and actual composition

The user replied "Sure" to the corrected-cutout approval question. This approval
is bound in evidence/s5-composition-2026-11-04-01/cutout-approval.json. The exact
cutout SHA-256 is 46072bf9f46456db8f9032cf582cc7a1d16e26df3a90fe8cd5c218db4ff1c7c8.

The composition now exists at
`archive/proof-s5-composition-2026-11-04-01/offer-preview.png`, SHA-256
`de412d6a7b30c60e8ee92da9bd15c9a4eb61856d286f2ff7c3a8b13af7905a9a`.
All 403,621 selected source pixels were verified unchanged. No new calls occurred.
Final asset approval remains missing. Public posting remains unapproved.
Earlier receipts with null approvals describe their original, preserved state.

## Final asset approved for local use

The user replied "Approved. Then move on to the next step(let me know )" to the
exact final preview. Final approval was applied through decideCreative to asset
SHA-256 de412d6a7b30c60e8ee92da9bd15c9a4eb61856d286f2ff7c3a8b13af7905a9a,
original rule f314412a-bc0e-4385-89b1-26b524feda45, version 1. The repeated exact
decision returned already_approved. See evidence/s5-final-approval-2026-11-04-01/.
Public posting remains unapproved. Both paid model allowances remain closed.
