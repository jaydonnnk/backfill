# Session Transfer (S7, 2026-11-01)

## Completed
- S7 code on `backfill/slice-7-demo`: scene domain, `sim/buyers` (intents, Spark buyer, `sim:mint`, `demo:scene` record/replay), `/demo` with SSE at `/api/demo/stream`.
- 334 tests pass (re-run twice on 2026-10-31/11-01, before and after the lead change); typecheck, lint and `git diff --check` clean; 15 of 15 mutations killed (`evidence/s7-demo`); CI run 41180996552 green on `4e69dc1` and main run 41212757917 green on `6701d9f`.
- `main` = origin/main = `backfill/slice-7-demo` = `6701d9f`; the user redeployed Render at `4e69dc1`; `/demo` answers 200.
- Neon: 20 agents `sim-buyer-01..20` minted, tokens in `.env.local` as `SIM_BUYER_TOKEN_NN`.
- First live record run on Render at 22:36 SGT on 2026-10-31, billed US$0.087038: window 22:40-23:40, 12 declined, 1 committed 3 covers, 7 `no_reply`, pool locked. That recording was not committed and is gone.
- Probe call at 00:00 SGT on 2026-11-01, one Muse Spark attempt, billed US$0.006844: HTTP 200, 1502 output tokens, 7.3 s, reply `{"covers":2,"reason":"Kopi kaya toast for two after 2pm matches..."}`. Key and spend headroom proven; US$4.906 of the US$5 cap left.
- Record lead raised 4 to 10 minutes and replay lead 2 to 5 (`sim/buyers/run.ts:64`), so a slow or retrying model round cannot push a submit past `commitBy`.
- Read-only Neon snapshot at 00:03 SGT on 2026-11-01 (script deleted; recreate it from the text in Open Work).

## Decisions
- One new Demo Cafe rule per run, older ones retired by floor = list price: a rule cannot be reset for a second same-day run (clearing and Wonder plan are unique per rule and date).
- The scene shows Wonder's plan but does not apply it: the merchant applies, as in S6; also keeps solo vs pooled computable against unchanged terms.
- Re-plan and rule setup run from the local command with the owner `DATABASE_URL`, not inside Render; buyer MCP and clearing run on Render.
- Buyer prompt adds a scene-written line saying what one cover is, since an Offer has no menu.
- 2026-11-01: the user wrote "Screw the timing i just want to finish this slice". After the timing blocker below was reported they chose "Afternoon run, you start it", and separately "1 probe call (~US$0.005)". So the record run is the user's to start; the target is 15:00 SGT on 2026-11-01, which makes the window about 15:11-16:11 so the "after 2pm", "after 3pm" and "before 5pm" intents all fit.

## Traps
- No scene run can start after about 22:55 SGT: `sceneWindow` (`src/domain/demo/scene.ts:25`) refuses when the 60-minute window would cross midnight, so `prepareScene` throws "too late in the Singapore day". Run directly: 22:56 record fits (1380/1440), 23:09 record and replay both return null.
- A night run cannot produce the sellout, so it cannot finish the slice: `replanSoldOut` plans only occurrences where `soldOut` (`src/lib/onboarding/service.ts:188`), which needs `filledCovers >= 16`. The only night data point is 1 buyer and 3 covers. Do not "fix" this by faking the clock shown to the model, and do not shrink the rule or rewrite the 20 intents without asking: build-plan.md:108 names those intents and line 110 requires the sellout.
- The sim's model calls never reach `llm_calls`; `run.ts` records them into an in-memory array. The 22:36 failures left no trace anywhere, which is why the cause had to be re-derived by measurement.
- One buyer decision used 1502 output tokens. Under the old 1024 limit that reply could not finish: empty content, `validate` calls it invalid, three attempts each with a longer prompt, then `LlmError`, which `sparkBuyer` records as `no_reply`. That is the mechanism behind the 7 failures (a hypothesis for those specific calls, since their error text was never kept). 2048 leaves only about 35% of margin. If tomorrow's recording shows truncation again, raise the cap, but a cap above the model's own maximum is a non-retryable HTTP 4xx, so prove any new value with one probe call first.
- Render's free tier sleeps: a `curl` of `/demo` at 00:12 SGT on 2026-11-01 returned 200 in 24.9 s, a cold start. Warm it with one or two curls before the run, or the first MCP calls stall on it.
- 2026-11-01 is a Sunday, so intent 8 ("weekday afternoon") and intent 11 ("Brunch ... 10am on Sunday only") should decline honestly against a 15:11-16:11 window. Those declines are not a bug.
- `wonder_plans.model` for a replay is `replay:<model>` on purpose.
- Neon's migrations table is `public.__drizzle_migrations`, not `drizzle.`.
- Plan values containing "500" (the scene floor) break `floorHidden` checks in tests.
- Render does not auto-deploy; the user redeploys. `b6e49e0` and tonight's lead change touch only `sim/` and `tests/`, so no redeploy is needed for the record or replay run, and Render on `4e69dc1` already serves the current `/demo`.

## Working Agreements
- Status: what the 00-status record says; the user answers every authorization by multi-select.
- Never present a replay, a simulated buyer or a synthetic merchant as a real user. The `muse-user` commitment `34e1cb93-a6cc-41f8-8869-4e458b6f90c8` is the only real one and is shown read-only in its own pool.

## Files Changed
- New in S7: `src/domain/demo/scene.ts`, `src/lib/demo/{snapshot,sse}.ts`, `src/app/demo/{page,live-board}.tsx`, `src/app/api/demo/stream/route.ts`, `sim/buyers/{intents,buyer,scene,run,mint}.ts`, `tests/{unit,integration}/s7-demo.test.ts`, `docs/plans/backfill/evidence/s7-demo/*`, `docs/plans/backfill/handoff-s7.md`.
- `src/lib/commitments/service.ts:43` - `toCommitment` exported.
- `sim/buyers/run.ts:64` - record lead 10 minutes, replay lead 5.
- `package.json` - scripts `sim:mint`, `demo:scene`.

## Open Work - the finish sequence for 2026-11-01

1. Warm Render and confirm the tip:
   `curl -s -o /dev/null -w '%{http_code}\n' https://backfill-9d0x.onrender.com/demo` (run twice; a cold start can take a minute), `git branch --show-current`, `git status --short`.
2. Read-only Neon before, with this throwaway `src/neon-read.ts` (delete it after; it never writes):

```ts
import postgres from "postgres";
import { loadLocalEnvFile, migrationEnv } from "@/env";
import { pgConnection } from "@/lib/db/client";

loadLocalEnvFile();
const connection = pgConnection(migrationEnv().DATABASE_URL);
const sql = postgres(connection.url, { ssl: connection.ssl, max: 1, prepare: false, connect_timeout: 15, onnotice: () => {} });

await sql.begin("read only", async (tx) => {
  const counts = await tx`select
    (select count(*) from public.__drizzle_migrations) as migrations,
    (select count(*) from merchants) as merchants,
    (select count(*) from rules) as rules,
    (select count(*) from commitments) as commitments,
    (select count(*) from clearings) as clearings,
    (select count(*) from clearing_fills) as fills,
    (select count(*) from wonder_plans) as plans,
    (select count(*) from plan_applications) as applications,
    (select count(*) from agents where id like 'sim-buyer-%') as sim_agents,
    (select count(*) from agents where id = 'muse-user') as muse_agent`;
  console.log("totals:", JSON.stringify(counts[0]));
  const rules = await tx`select r.id, m.name, r.weekday, r.start_minute, r.end_minute, r.commit_by_minute,
      r.list_price_cents, r.discount_bps, r.floor_price_cents, r.capacity_covers, r.min_pool_covers,
      r.per_agent_cap_covers, r.terms_version
    from rules r join merchants m on m.id = r.merchant_id order by m.name, r.id`;
  for (const r of rules) console.log("rule:", JSON.stringify(r));
  const commitments = await tx`select c.id, c.agent_id, c.rule_id, c.covers, c.visit_at, c.terms_version,
      (c.cancelled_at is not null) as cancelled, m.name
    from commitments c join rules r on r.id = c.rule_id join merchants m on m.id = r.merchant_id
    order by m.name, c.committed_at`;
  for (const c of commitments) console.log("commitment:", JSON.stringify(c));
  const clearings = await tx`select c.rule_id, c.visit_date, c.unlocked, count(f.commitment_id) as fills,
      coalesce(sum(f.covers), 0) as filled_covers
    from clearings c left join clearing_fills f on f.rule_id = c.rule_id and f.visit_date = c.visit_date
    group by c.rule_id, c.visit_date, c.unlocked order by c.rule_id`;
  for (const c of clearings) console.log("clearing:", JSON.stringify(c));
});

await sql.end({ timeout: 5 });
```

   Expected before the run: 13 migrations, 3 merchants, 3 rules, 3 commitments, 1 clearing (locked, 0 fills), 0 plans, 0 applications, 20 sim agents, 1 muse-user; Backfill Demo Cafe's Saturday 22:40-23:40 rule with floor 500 and sim-buyer-17's 3 covers.
3. Record run, started at about 15:00 SGT (about 11 minutes end to end):
   `npm run demo:scene -- https://backfill-9d0x.onrender.com record`
   Then read `sim/buyers/recordings/scene.json`: every buyer's `reply` and `error`, the billed total, and the printed solo/pooled/re-plan lines.
4. Stop and report, do not paper over it, if: billed cost is near the cap, any buyer shows an `error`, pooled covers are under 16, `soldOut` is false, or the re-plan is not `planned`. The sellout and Wonder's plan are the exit; a locked pool is not.
5. Replay exit, the one command build-plan.md:112 asks for (about 6 minutes):
   `npm run demo:scene -- https://backfill-9d0x.onrender.com replay`
6. `/demo` screenshots at 375 px and 1280 px on the Render URL, showing solo vs pooled, the sellout, Wonder's plan and the real Muse card; check there is no hidden floor and no horizontal scroll at 375 px.
7. Read-only Neon after, with the same script; the difference must be exactly one new rule, the old one's floor raised to 680, the new commitments, one new clearing and one new plan per run, and nothing touched on Demo Kopitiam or Singapore Test Restaurant.
8. Commit the recording, the finished S7 section and the build-plan tick.
9. `npm run typecheck`, `npm run lint`, the full suite with `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres`, `git diff --check`, push the branch, record the CI run ID.
10. Ask before any fast-forward or push of `main`. Then ask exactly: Continue to slice S8, or re-steer?

## Prompt for New Chat

Backfill is in /Users/jayd0/Desktop/meta-hack; finish slice S7 on `backfill/slice-7-demo`. Read docs/plans/backfill/handoff-s7.md first, especially Traps and the finish sequence in Open Work, then the S7 section at the end of docs/plans/backfill/00-status.md and build-plan.md "### S7".
Everything but the live run is done: 334 tests, 15 of 15 mutations, CI and the code are green, and Render on `4e69dc1` already serves the current `/demo`.
Do the pre-flight now (warm Render, confirm the tip, the read-only Neon before), then wait. At about 15:00 SGT I will say go, and only then run `npm run demo:scene -- https://backfill-9d0x.onrender.com record` (about 11 minutes, about US$0.10 of the US$4.906 left), read the recording, and continue down the finish sequence: the replay exit, `/demo` screenshots at 375 px and 1280 px, the Neon read after, the finished status section, the build-plan tick and CI.
If the record run does not reach 16 pooled covers, a sold-out pool and a `planned` re-plan, stop and report it. Do not shrink the rule, rewrite the 20 intents or fake the clock shown to the model.
Rules that still hold: no em dash, no co-author trailer or agent attribution, never read or print `.env.local`, `git branch --show-current` before every edit, ask by name before any fast-forward or push of `main`, and never present a replay or a simulated buyer as a real user.
Deliver the pre-flight result and wait for my go.

---

## Prompt for Handoff Review

Review slice S7 of Backfill in /Users/jayd0/Desktop/meta-hack, branch `backfill/slice-7-demo` from `0e7e091` to the final S7 tip, against build-plan.md "### S7".
Claims: 334 tests pass; 15 of 15 mutations in docs/plans/backfill/evidence/s7-demo killed on AssertionError; /demo never shows the hidden floor; replay makes no model call; the scene runs end to end through MCP on Render; the committed recording came from a live afternoon run and its billed cost matches the command's own printout.
Assume the work is flawed. Re-run the suite with TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres, read every changed file, and check whether each test could fail against broken code, mirrors the implementation, or misses edge cases (SSE on disconnect, retire-by-floor side effects on pending older occurrences, capacity shown on a public page, record mode swallowing errors, same-day rule churn in list_offers, a submit landing after commitBy under the new 10-minute lead, a buyer whose reply is truncated at 2048 tokens).
Do not pass tests for the sake of passing; flag any claim not backed by evidence. Do not touch Neon, Meta or Render.
Report PASS, ISSUES FOUND or FAIL with file:line evidence per finding.
Deliver your verdict and wait for instructions.
