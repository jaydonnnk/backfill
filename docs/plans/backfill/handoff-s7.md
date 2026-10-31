# Session Transfer (S7, 2026-10-31)

## Completed
- S7 code on `backfill/slice-7-demo` (tip `0b092c1`, pushed): scene domain, `sim/buyers` (intents, Spark buyer, `sim:mint`, `demo:scene` record/replay), `/demo` with SSE at `/api/demo/stream`.
- 334 tests pass; typecheck, lint, `git diff --check` clean; 15 of 15 mutations killed (evidence/s7-demo); CI run 41180996552 green on `4e69dc1`.
- `main` = origin/main = `4e69dc1`; the user redeployed Render; `/demo` answers 200.
- Neon: 20 agents `sim-buyer-01..20` minted, tokens in `.env.local` as `SIM_BUYER_TOKEN_NN`.
- First live record run on Render at 22:36 SGT, billed US$0.087038: night window, 12 declined, 1 committed, 7 `no_reply`, pool locked. Recording not committed (kept at the session scratchpad only).
- After that: the recording keeps each buyer's failure (`error`), output limit raised to 2048 (`f`-commit before `0b092c1`); not yet proven against Meta.
- 00-status.md has "### S7 buyer sim and live demo screen, 2026-10-31 (in progress)".

## Decisions
- One new Demo Cafe rule per run, older ones retired by floor = list price: a rule cannot be reset for a second same-day run (clearing and Wonder plan are unique per rule and date).
- The scene shows Wonder's plan but does not apply it: the merchant applies, as in S6; also keeps solo vs pooled computable against unchanged terms.
- Re-plan and rule setup run from the local command with the owner `DATABASE_URL`, not inside Render; buyer MCP and clearing run on Render.
- Buyer prompt adds a scene-written line saying what one cover is, since an Offer has no menu.

## Traps
- Recording at night: buyers see the real window and correctly decline. A useful recording needs a Singapore afternoon run (window must read as afternoon). Tempting to fake the time shown to the model; that would be dishonest.
- `wonder_plans.model` for a replay is `replay:<model>` on purpose.
- Neon migrations table is `public.__drizzle_migrations`, not `drizzle.`.
- Plan values containing "500" (scene floor) break `floorHidden` checks in tests.
- Render does not auto-deploy; the user redeploys.

## Working Agreements
- Status: what the 00-status record says; the user answers every authorization by multi-select.

## Files Changed
- New: `src/domain/demo/scene.ts`, `src/lib/demo/{snapshot,sse}.ts`, `src/app/demo/{page,live-board}.tsx`, `src/app/api/demo/stream/route.ts`, `sim/buyers/{intents,buyer,scene,run,mint}.ts`, `tests/{unit,integration}/s7-demo.test.ts`, `docs/plans/backfill/evidence/s7-demo/*`.
- `src/lib/commitments/service.ts:43` - `toCommitment` exported.
- `package.json` - scripts `sim:mint`, `demo:scene`.

## Open Work
- Cause of the 7 `no_reply` calls: unknown until a record run with the error field.
- Afternoon record run (authorized, US$5 cap, about US$4.91 left): not done; blocks the replay exit.
- Replay exit on Render (authorized): blocked on that recording.
- Final S7 status section, build-plan tick, CI on final tip, fast-forward of main for the later commits (needs a fresh yes): not done.
- Then the question "Continue to slice S8, or re-steer?".

---

## Prompt for New Chat
Backfill is in /Users/jayd0/Desktop/meta-hack; slice S7 is in progress on `backfill/slice-7-demo` at `0b092c1`, and docs/plans/backfill/handoff-s7.md plus the S7 section at the end of docs/plans/backfill/00-status.md describe its state.
The code, tests, mutation evidence and CI are done; main is at `4e69dc1` and deployed on Render.
The one live record run happened at night, so buyers declined and 7 calls failed for an unknown reason; the failure reason is now recorded and the output limit raised.
A record run in a Singapore afternoon and the replay exit on Render are still open; the user authorized record (US$5 cap total) and replay, but a new fast-forward of main needs a new yes.
The rules in the first S7 prompt still hold: no em dash, no co-author trailer, never read .env.local, ask before Neon reads or writes beyond those authorized, run git branch --show-current before every edit.
Wait for instructions before taking any action.

---

## Prompt for Handoff Review
Review slice S7 of Backfill in /Users/jayd0/Desktop/meta-hack, branch `backfill/slice-7-demo` from `0e7e091` to `0b092c1`, against build-plan.md "### S7".
Claims: 334 tests pass; 15 of 15 mutations in docs/plans/backfill/evidence/s7-demo killed on AssertionError; /demo never shows the hidden floor; replay makes no model call; the scene runs end to end through MCP.
Assume the work is flawed. Re-run the suite with TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres, read every changed file, and check whether each test could fail against broken code, mirrors the implementation, or misses edge cases (SSE on disconnect, retire-by-floor side effects on pending older occurrences, capacity shown on a public page, record mode swallowing errors, same-day rule churn in list_offers).
Do not pass tests for the sake of passing; flag any claim not backed by evidence. Do not touch Neon, Meta or Render.
Report PASS, ISSUES FOUND or FAIL with file:line evidence per finding.
Deliver your verdict and wait for instructions.
