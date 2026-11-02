# S9.5 local verification, 2026-11-02

Local implementation is ready for visual review. Full S9.5, which absorbs S10, remains incomplete until the gated hosted/live/recording/submission exits are resolved.

## Final verification

- Typecheck and lint passed.
- 318 unit tests in 35 files and 182 integration tests in 15 files passed. Integration used only the explicit disposable local PostgreSQL server.
- Isolated production build passed with `next build --webpack`. The preview symlinks node_modules; webpack avoids the external-symlink issue in Turbopack. The changed production sources in the built preview match the checkout byte-for-byte.
- 18 Playwright tests passed in the final run against the production preview. Coverage includes 375/1280 light/dark routes, authenticated merchant and draft layouts, no horizontal overflow/console errors, query hiding, preferences, normal/reduced motion, pointer/keyboard drag, scroll/resize placement and consecutive animation restart. Lifecycle tests check cancellation on pool/null/stale/malformed/navigation/clearing/plan application/minimum loss.
- The merchant browser test uses offline menu-extraction fixtures. Actual form review/publication, two commitments through the same app's HTTP MCP endpoint, real-time deadline clearing and ledger reconciliation pass. Four covers save S$6.00; agent/network shares are zero. Invalid-photo and invalid-floor submissions are refused. A refused draft remains at the read-menu step. No vision provider was called by this test.
- Five full recorded-decision rehearsals passed through the local HTTP MCP server with actual clocks. Each fills 16 covers, saves buyers S$21.76, stores the recorded Wonder plan and reconciles the ledger. `rehearsals.json` and five screenshots record the runs. These are local runs, not hosted or fresh-model runs.
- 54 targeted mutations were killed: 27 event/queue, 10 placement, 9 merchant and 8 browser lifecycle mutations. Source files were restored byte-identically and tests rerun successfully. Mutation report source hashes match the final checkout. UI mutations used separate isolated production builds; the checkout was not mutated by that script.
- Independent reviewer found stale queued cues, repeated-animation restart, missing-proposal wording, refused-draft step selection and E2E target/clock issues. Those were fixed with regressions. Final static re-review found no further concrete code blockers. It did not independently rerun all tests.
- Final direct read of the disposable database showed zero llm_calls. Protected recordings, old migrations and S9 result files have no diff. No paid call, production write, merge, push, deployment or Render change occurred.

## Review links and reproduction

Current app: http://127.0.0.1:3196/demo from `/tmp/backfill-s95-review`. Old 3195 preview served the five rehearsals and is not the final review build. [HTML screenshot gallery](index.html). Screenshots contain disposable synthetic data, including authenticated merchant screens. The local empty call log cannot verify the production S9 manifest, so local /evals correctly hides measured results.

The review server starts with an empty inherited environment plus PATH/HOME. Its .env.local contains only the disposable database connection, dummy provider configuration at https://model.invalid and generated local credentials. The repository .env.local was never read or copied. Generated credentials exist only in local preview .env.local files, not artifacts.

Commands from the repository:

```sh
npm run typecheck
npm run lint
npm run test:unit
env -u DATABASE_URL TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres npm run test:integration
S95_REVIEW=1 npm run test:e2e
python3 scripts/verification/kopi-mutations.py
python3 scripts/verification/kopi-mutations.py --position
python3 scripts/verification/kopi-mutations.py --merchant
python3 scripts/verification/kopi-ui-mutations.py
```

The fixture and full-rehearsal scripts are under scripts/verification. `seed-s95.ts` creates a disposable database and writes generated credentials only to the preview .env.local. The older Kopi evidence seed writes a credential JSON and must not be reused under this session's stricter rule. `rehearse-s95.ts` rotates only the disposable fixture's agent tokens in memory, then runs five recorded replays.

## Limits and decisions

A conservative 15-second browser observation window avoids catch-up celebrations. It is not proof of a fresh model run. Pending minimum attainment only nods and says clearing is pending. Stored outcomes are labelled. The queue holds three events including the active event, each displayed for 1.8 seconds. Context changes discard incompatible queued text.

The companion avoids interactive-element rectangles and hides temporarily if no candidate fits. It can still overlap ordinary text. Reduced motion keeps static cues/props. User visual acceptance remains open. Receipt-stamp and richer idle behavior from the broader proposal are not implemented; the local build implements the five requested core poses and adds a plan prop.

[unknown] Exhaustive mutation coverage of every defensive DOM/null-reference branch has not been established. The 54 documented mutations prove the listed functional checks, not every line. No universal visual/accessibility claim is made from the sampled viewports.

## Remaining gates

- User visual acceptance and explicit publication authorization.
- Hosted mutating E2E requires named production-write authority. It has not run.
- A fresh live run requires named capped spending authorization and an enforced allowance. Paid S7 recording is still disabled in code pending that allowance.
- The user records or approves the video, uploads it and submits the form. Drafts are in ../../video-storyboard.md and ../../submission-draft.md.
- The plan's ET deadline converts to November 5 10:00 SGT, with a 07:00 SGT internal target. The live submission form's current deadline is independently unverified.
