# S8.5 local UI evidence

Open [the HTML gallery](index.html) to compare the landing and demo at 375px and 1280px in light and dark themes. All screenshots use a disposable synthetic local fixture, including the Muse card. They do not establish a new real-user commitment or a live model run.

## Verification

- Baseline: 417 tests passed. Final: 418 tests in 41 files passed using `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres npm test -- --maxWorkers=2`.
- The public-ledger assertion first failed because the summary did not exist, then passed after implementation. The fixture also settles a different merchant's private pool and proves its 624-cent savings stay outside the public demo totals.
- Typecheck, ESLint, `git diff --check` and a production build passed. The build ran in `/tmp/backfill-s85-preview` with no real environment files or credentials. Application source bytes were compared with the working branch.
- [Browser results](browser-results.json): five routes at both widths and themes; no page overflow, browser exceptions or non-GET requests. Merchant checks cover the signed-out entry page, not authenticated onboarding.
- Browser interactions: alone/pooled, every buyer detail, replay completion, return to live and reduced-motion immediate replay. The desktop result must fit within the 720px recording viewport.
- [Local counts](local-counts.json): zero model calls. The preview fixture contains 12 commitments, six filled entries and no real payment.
- One independent reviewer found edge popovers overflowing at 375px. The browser reproduction failed at left -2.91px and right 377.89px. Inward anchoring passed the same assertions for all tokens in both viewports and themes. No ledger privacy/reconciliation defect was reported.

## Rerun

`seed-preview.ts` creates a fresh disposable local database using the project's real migrations and clearing path, synthetic agents, and a stored synthetic Wonder plan. It writes the local database URL to `/tmp/backfill-s85-local-url`; it never reads production configuration. Run it with the explicit local `TEST_DATABASE_URL` and the project's `tsx` executable.

Start a secret-free production copy with that DATABASE_URL, dummy Meta settings pointing at `https://model.invalid`, and port 3185. Then run `browser-check.mjs` with `PLAYWRIGHT_MODULE` pointing to the installed Playwright module and `CHROME_BIN` pointing to Chrome. The runner refuses a non-local PREVIEW_URL and writes the screenshots and JSON beside itself.

The current preview is at `http://localhost:3185/demo`. Its temporary build and database are retained for review. A previous preview database was dropped after replacing it. No production database, deployment, paid call, frozen recording or historical evidence was changed.

## Published application

S8.5 and the README/pitch edits are on main at `b20bd16`. [CI 41315773866](https://github.com/jaydonnnk/backfill/actions/runs/41315773866) passed. Render deployment `dep-dbjklmlg1s2s7382gasg` was confirmed Live at that source. Hosted public pages, feed, comparison and local replay passed; full rollout details are in the latest S8.5 section of [00-status.md](../../00-status.md). No new production data or model call was needed.
