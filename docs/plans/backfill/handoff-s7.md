# Session Transfer (S7, 2026-11-01)

## Completed
- S7 code on `backfill/slice-7-demo`: scene domain, `sim/buyers` (intents, Spark buyer, `sim:mint`, `demo:scene` record/replay), `/demo` with SSE at `/api/demo/stream`.
- 334 tests pass; typecheck, lint and `git diff --check` clean; 15 of 15 mutations killed (`evidence/s7-demo`); CI green on every pushed tip of the branch (runs 41180996552, 41212757917, 41218125966, 41218360594).
- Live record run on Render, 2026-11-01 13:58 Singapore, billed US$0.087824: window 14:07-15:07, 20 of 20 buyers replied with no error, 11 committed 30 covers, 9 declined with named reasons, 0 of 11 unlock alone, pooled 30 covers of 8, 16 filled, sold out, Wonder planned `ok`. Recording committed at `sim/buyers/recordings/scene.json`.
- Replay exit on Render, `npm run demo:scene -- https://backfill-9d0x.onrender.com replay`: same 11 commitments and 30 covers, 16 filled, sold out, plan stored as `replay:muse-wonder-1.0`, no model call.
- `/demo` screenshots at 375 px and 1280 px after the replay (`evidence/s7-demo/demo-375.png`, `demo-1280.png`): solo 0 of 11, pooled sold out, Wonder's plan, the real Muse card, no floor text, no horizontal scroll.
- Read-only Neon before and after: exactly one new rule, commitments, clearing and plan per run; older scene rules retired by floor = list price; Demo Kopitiam and Singapore Test Restaurant untouched.
- Total S7 live spend US$0.181706 of the US$5 cap (night run US$0.087038, probe US$0.006844, record US$0.087824); the replay made no billed call.

## Decisions
- One new Demo Cafe rule per run, older ones retired by floor = list price: a rule cannot be reset for a second same-day run (clearing and Wonder plan are unique per rule and date).
- The scene shows Wonder's plan but does not apply it: the merchant applies, as in S6; also keeps solo vs pooled computable against unchanged terms.
- Re-plan and rule setup run from the local command with the owner `DATABASE_URL`, not inside Render; buyer MCP and clearing run on Render.
- Buyer prompt adds a scene-written line saying what one cover is, since an Offer has no menu.
- The user wrote "Screw the timing i just want to finish this slice"; after the timing blocker was reported they chose "Afternoon run, you start it" and "1 probe call (~US$0.005)". The run went at 13:58 on 2026-11-01, not 15:00, which still gave an afternoon window.
- Taken by Claude: record lead 10 minutes and replay lead 5 (`sim/buyers/run.ts:64`), so a slow or retrying model round cannot push a submit past `commitBy` and lose covers. No test binds the leads.

## Traps
- A scene run cannot start after about 22:55 Singapore: `sceneWindow` (`src/domain/demo/scene.ts:25`) refuses a 60-minute window that would cross midnight. A night run also cannot sell out, because `replanSoldOut` plans only `soldOut` occurrences (`src/lib/onboarding/service.ts:188`), so it cannot meet build-plan's exit.
- Render's free tier sleeps: the first `/demo` curl before the run took 45.1 s, the second 0.45 s. Warm it before the first MCP call.
- One buyer decision uses about 1500 output tokens. At the old 1024 limit that truncates into an empty reply, three retries, then `LlmError`, recorded as `no_reply`; that is what happened to 7 buyers at 22:36 on 2026-10-31. 2048 leaves about 35% of margin; a cap above the model's maximum would be a non-retryable 4xx, so prove any new value with one probe call first.
- Wonder's rationale is capped at 400 characters by the schema and the model stops mid-word at the cap; the demo card shows it as recorded.
- The replay's rule window is minutes after the recording's, because it is anchored to replay time; the recorded reasons quote the record window and `/demo` does not show reasons.
- The sim's model calls never reach `llm_calls`; the cost evidence is the recording's `costNanoUsd` and the command's printout.
- 2026-11-01 was a Sunday, so intents 8 and 11 declined honestly; that is the model reading the intent, not a fault.
- `wonder_plans.model` for a replay is `replay:<model>` on purpose.
- Neon's migrations table is `public.__drizzle_migrations`, not `drizzle.`.
- Render does not auto-deploy; the user redeploys. `b6e49e0` and the lead change touch only `sim/` and `tests/`, so the run needed no redeploy.

## Working Agreements
- Status: what the 00-status record says; the user answers every authorization by multi-select.
- Never present a replay, a simulated buyer or a synthetic merchant as a real user. The `muse-user` commitment `34e1cb93-a6cc-41f8-8869-4e458b6f90c8` is the only real one and is shown read-only in its own pool.

## Files Changed
- New in S7: `src/domain/demo/scene.ts`, `src/lib/demo/{snapshot,sse}.ts`, `src/app/demo/{page,live-board}.tsx`, `src/app/api/demo/stream/route.ts`, `sim/buyers/{intents,buyer,scene,run,mint}.ts`, `tests/{unit,integration}/s7-demo.test.ts`, `docs/plans/backfill/evidence/s7-demo/*` (mutations and live captures), `docs/plans/backfill/handoff-s7.md`, `sim/buyers/recordings/scene.json`.
- `src/lib/commitments/service.ts:43` - `toCommitment` exported.
- `sim/buyers/run.ts:64` - record lead 10 minutes, replay lead 5.
- `package.json` - scripts `sim:mint`, `demo:scene`.

## Open Work
- The S7 review: the prompt below sets it up.
- S7 is on `main` and `origin/main` at `328569b`, verified from Git on 2026-11-01 before the docs-only review fix.
- Then the choice: continue to S8 (ledger and checkout), or re-steer.

## Prompt for New Chat

Backfill is in /Users/jayd0/Desktop/meta-hack. Slice S7 is finished on `backfill/slice-7-demo`: the live record run, the replay exit on Render, the screenshots, the Neon reads and the records are all done and committed.
Read docs/plans/backfill/handoff-s7.md, the S7 section at the end of docs/plans/backfill/00-status.md, and build-plan.md "### S7" and "### S8" before doing anything.
`main` and `origin/main` already contain the S7 tip `328569b`, verified from Git on 2026-11-01. Ask by name before any further fast-forward or push of `main`, and before any Neon or Render write.
Rules that still hold: no em dash, no co-author trailer or agent attribution, never read or print `.env.local`, `git branch --show-current` before every edit, and never present a replay or a simulated buyer as a real user.
Wait for instructions.

---

## Prompt for Handoff Review

Review slice S7 of Backfill in /Users/jayd0/Desktop/meta-hack, branch `backfill/slice-7-demo` from `0e7e091` to the S7 tip, against build-plan.md "### S7".
Claims: 334 tests pass; 15 of 15 mutations in docs/plans/backfill/evidence/s7-demo killed on AssertionError; /demo never shows the hidden floor; replay makes no model call; the scene ran end to end through MCP on Render; the committed recording came from a live afternoon run and its billed cost matches the command's printout; the two screenshots show the sold-out scene, Wonder's plan and the real Muse card at 375 px and 1280 px.
Assume the work is flawed. Re-run the suite with TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres, read every changed file, and check whether each test could fail against broken code, mirrors the implementation, or misses edge cases (SSE on disconnect, retire-by-floor side effects on pending older occurrences, capacity shown on a public page, record mode swallowing errors, same-day rule churn in list_offers, a submit landing after commitBy under the new 10-minute lead, a buyer whose reply is truncated at 2048 tokens, a replay whose recorded decisions were made against a different window).
Do not pass tests for the sake of passing; flag any claim not backed by evidence. Do not touch Neon, Meta or Render.
Report PASS, ISSUES FOUND or FAIL with file:line evidence per finding.
Deliver your verdict and wait for instructions.
