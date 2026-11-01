# Kopi site review, 2026-11-01

User approved the HTML design and requested site-wide implementation before Slice 9. Implementation was reviewed locally on `codex/kopi-site-design`; the user subsequently accepted the design and authorized its main push. Current publication status is recorded in `../../00-status.md`.

Review: http://127.0.0.1:3190/ (isolated production build). Open index.html for the screenshot gallery. All numbers in screenshots come from a disposable local synthetic fixture; no real bookings or model runs.

## Verification

- 425 tests in 42 files passed with the explicit disposable local TEST_DATABASE_URL and two workers.
- Typecheck, lint and diff whitespace checks passed.
- Next production build passed using `--webpack` in `/tmp/backfill-kopi-preview`. Default Turbopack cannot resolve the external node_modules symlink used by this secret-free copy; no production configuration was altered to bypass this.
- 14 route/viewport checks: public landing, demo, evals, diagnostics and signed-out merchant, plus authenticated merchant and menu review, each at 375 and 1280 pixels. No horizontal page overflow.
- Visual inspection covered landing, demo, merchant and form layouts. Screenshot gallery includes all checked screens.
- Existing dark-mode colours and reduced-motion CSS are preserved. This browser interface did not expose preference emulation, so dark/reduced-motion runtime screenshots are not claimed.
- Independent review found a temporary form message clearing its underlying page message. Owner-keyed messages fix this; a failing-then-passing regression covers restoration, and the reviewer found no issue in the narrow re-review.
- A local invalid floor submission was refused with guidance; the next submission used the reset valid default terms and published a synthetic offer. This was confined to the disposable verification database. A fresh fixture replaced it for user review; no production record changed.

## Local preview

The copy excludes real environment files and uses dummy credentials pointing at https://model.invalid. `seed-preview.ts` creates disposable synthetic data through real migrations/clearing, a pre-existing Wonder plan to avoid auto-replan, and an unpublished menu draft. It saves a local-only merchant credential at `/tmp/backfill-kopi-merchant.json` with restrictive permissions. Never commit that file.

Start from the secret-free copy with `npm run start -- --hostname 127.0.0.1 --port 3190`. The viewer can follow the merchant navigation once the local fixture has been signed in. Do not use Ask Muse Spark or Read menu during visual review; the dummy provider cannot generate results.

Final browser interactions also verified local replay through completion and return to live, Alone/Pooled comparison, all 11 mobile buyer popovers within viewport, and persisted dismissal across navigation. `browser-results.json` records the viewport checks. Captured browser console error list was empty. `local-counts.json` confirms the fresh review fixture has zero model calls, one draft and no published drafts.
