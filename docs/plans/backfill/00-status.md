# Status: Backfill

Updated: 2026-11-01.

- Tech stack: approved by the user on 2026-10-26; see [../../tech-stack.md](../../tech-stack.md).
- Build plan: drafted 2026-10-26 in [build-plan.md](build-plan.md); approved by the user on 2026-10-28, with the Singapore steer, in their words: "Yes, approved".
- Singapore steer: 2026-10-28, after Muse launched in Singapore.
In the user's words: "update the pitch, tech stack and build plan for the Singapore steer: path A plus B, with E as a stretch. Add the Muse custom connector Day 0 check."
Pitch in [../../pitch.md](../../pitch.md); S2, S4 and S7 changed, S6b (WhatsApp) added as a stretch.
- Day 0 checks: model IDs done in S1 (below); the Muse custom connector check passed on 2026-10-29 (S4, below); the others not started.
- Slices: S1 done 2026-10-27, reviewed and fixed 2026-10-28; S2 done 2026-10-28 and merged to `main` at `dfd257c`; S3 done 2026-10-28, reviewed and fixed 2026-10-28 (below), merged to `main` at `97c1024`, migration `0003` on Neon; S4 done 2026-10-29 (below), merged to `main` at `ded7a05`, migrations `0004` and `0005` on Neon; S5 done 2026-10-30 (below), on `main` at `74f6cdc` and on Render, migrations `0006` and `0007` on Neon.

### S1 tracer bullet, 2026-10-27

Branch: `backfill/slice-1-tracer`, cut from `main` at `0561822`.

Authorizations, in the user's words:
- 2026-10-27: "The render deployment is failed as S1 has not started. finish s1 and ill deploy again".
- 2026-10-27, asked before the first Neon write (migration plus one live Muse Spark call): "Yes, run both".

Built:
- Next.js 16.4.3 app (React 19, Tailwind 4, ESLint, Vitest).
CI in `.github/workflows/ci.yml`: typecheck, lint, unit, integration on a postgres:18 service container, then `npm run build`.
- `src/env.ts`: Zod-validated env.
`APP_BASE_URL` falls back to `RENDER_EXTERNAL_URL`, then `http://localhost:3000`.
`OPENROUTER_*` is optional.
A `-contributor` model ID refuses to boot.
- `llm_calls` table (migration `drizzle/0000_llm_calls.sql`): one row per HTTP attempt, failures included, with tokens, cost in nano-USD, latency and `ok`.
- `LLMProvider` in `src/integrations/meta/provider.ts`: strict `json_schema` output from a Zod schema, Zod validation, and retry on invalid output (the model sees its error), on 429, 5xx and network errors.
It does not retry other 4xx, and it refuses an unpriced model before sending.
- `/` shows the latest successful tracer reply with tokens and cost.
Only the "Ask Muse Spark" button calls the model, gated by a 60 second cooldown and 20 attempts per 24 hours.
`/api/health` checks the database and never calls a model.
- Next.js 16.4.0 and Zod 4.6.5 had published advisories (`npm audit`: critical for next, high for zod), and `next build` refused to run, so they are pinned to next 16.4.3 and zod 4.6.7.
`npm audit --omit=dev` reports 0 vulnerabilities.
4 moderate advisories remain in dev-only `drizzle-kit` (an old esbuild).

Evidence:
- **[verified]** Local: typecheck and lint clean; 30 unit tests and 4 integration tests pass (integration against a local PostgreSQL 18, never Neon); `next build` passes; `next start` honors `PORT` (served on 3123).
- **[verified]** Every added guard was mutated: 23 mutations, each failed its test on an AssertionError, was restored byte-identical and passed on rerun.
- **[verified]** Migration applied to Neon by `npm run db:migrate`.
- **[verified]** One live call to `muse-spark-1.3` through the local production server: 1 attempt, 116 tokens in, 451 out, 2591 ms, $0.002062 (116 x 1250 + 451 x 4250 = 2,061,750 nano-USD), shown on `/` and logged in `llm_calls`.
- **[verified]** CI run 40522973714 on `3a81747` passed: typecheck, lint, 30 unit tests, 4 integration tests on postgres:18, build.
- **[verified]** Exit check on https://backfill-9d0x.onrender.com after the user's deploy of `aac0d3e`, by read-only requests: `/api/health` returned 200 `{"ok":true,"db":"up"}`; `/` showed the `muse-spark-1.3` reply with 116 tokens in, 451 out and cost $0.002062.
- **[verified]** CI run 40523255876 on `main` at `aac0d3e` passed.
- **[vendor claim]** Prices in `src/integrations/meta/pricing.ts`, from Meta's pricing page, not reconciled against an invoice.
- **[hypothesis]** Reasoning tokens are inside `completion_tokens` and billed as output.
- Known limit: the cooldown check and the call are not locked together, so two presses in the same instant can both pass.
The daily cap still bounds spend.
Superseded by the S1 review below: the daily cap did not bound spend, and the fix locks the check and the call together.

### S1 review fixes, 2026-10-28

Branch: `backfill/slice-1-review-fixes`, cut from `main` at `f5d3b8f`.

Authorizations, in the user's words:
- 2026-10-27, asking for the review: "Yup done, lets do an unbiased, honest review of S1. IF all is good, start s2."
- 2026-10-28, on running it before S2: "Review S1 first (Recommended)".
- 2026-10-28, on the verdict: "Fix 1-4(and 5 if its quick), then give the continuation copy paste prompt for the next agent to go and start s2".

Review verdict: ISSUES FOUND, no blockers.
The review ran on local copies of the tree with a disposable local PostgreSQL and a local HTTPS stub in place of Meta; no Neon access, no Meta call, no press on Render.
Fixed:
1. **Major: the spend gate did not hold under simultaneous presses.**
Reproduced end to end on a local production build: 25 simultaneous POSTs of the "Ask Muse Spark" server action, with no page, made 25 model calls and 25 `llm_calls` rows, past both the 60 second cooldown and the 20-per-day cap.
Fix: `src/lib/tracer-press.ts` reads the gate and calls the model inside one transaction holding `pg_try_advisory_xact_lock`; a press that cannot take the lock is refused as `busy` without waiting.
Attempts are logged on the recorder's own connection and committed before the lock is released, so the next press sees them.
No migration.
After the fix, the same 25-POST burst made 1 model call (1 `ok`, 24 `busy`) and the next press returned `cooldown`.
2. **Medium: 12 guards had no test** (each survived its own mutation): TLS verification and URL parameter refusal in `pgConnection`, redaction inside `log()`, the gate check in the server action, retry on HTTP 500, the 4000-character output limit, provider error redaction, the test database's Neon refusal, the latency check constraint, the timeout message and `isEntrypoint` through a symlink.
Each now has a test, except provider error redaction, which was removed: its input is built only from constants, HTTP statuses, error names and Zod issue messages, so it had nothing to redact.
3. **Minor: 3 kills were not on an AssertionError** (the 429 retry, the 4xx refusal, the SQL constraints): those tests now catch the error and assert on it.
The Zod-message assertion now matches a pattern instead of Zod's exact English text.
4. **Medium: S1's mutation evidence was not in the repository.**
Runner, mutation lists and results are now in [evidence/s1-review](evidence/s1-review/README.md).
5. **Minor: a blank env value broke the app and looked like a database outage.**
An empty value now counts as unset, and `/api/health` answers `{"ok":false,"config":"invalid"}` for a configuration error instead of `db: down`.

Not fixed, by the user's choice: a 200 reply with an unexpected body is logged with 0 tokens and $0 though Meta may bill it; the status banners all look alike and the `failed` banner sits above the last successful reply.

Evidence:
- **[verified]** Typecheck and lint clean; 42 unit tests and 6 integration tests pass on a local PostgreSQL 18.
- **[verified]** Mutations, with [evidence/s1-review/mutate.mjs](evidence/s1-review/mutate.mjs) on a copy of the tree: before the fixes, 43 mutations gave 28 killed on an AssertionError, 3 killed otherwise and 12 survived; after the fixes, all 46 mutations were killed on an AssertionError, each file restored byte-identical and each rerun green.
- **[verified]** The same 25-POST burst against a local production build of the fixed tree: 1 model call, 1 `ok`, 24 `busy`, then `cooldown`; the new `busy` banner renders.
- **[verified]** Secret scan by shape (Postgres URLs with a password, bearer values, Neon `npg_` passwords, 64-hex secrets, `sk-` keys) on all Git history, the working tree, 4 CI logs, the local server logs and local `llm_calls` rows: a planted needle was found on every surface, and nothing else except Docker IDs and cache hashes in CI logs.
- **[unknown]** Whether Next.js's server-action origin check holds behind Render's proxy (needs a press on Render); Neon `llm_calls` rows and Render logs (not read); an exact-value secret scan (`.env.local` is not readable here).

### S2 schema and offers, 2026-10-28

Branch: `backfill/slice-2-schema-offers`, cut from `main` at `65d0de2` (main already contained the S1 review fixes).

Authorizations, in the user's words:
- 2026-10-28: "Fix 1-4(and 5 if its quick), then give the continuation copy paste prompt for the next agent to go and start s2".
- 2026-10-28, after being told the Neon migration and the merge to main were waiting on them: "yea do all and delete the handoff file".

Decisions, taken before coding; the user picked the recommended option for each on 2026-10-28:
- **Window edges:** start inclusive, end exclusive, in `Asia/Singapore` local time.
A rule's window is one weekday with a start and end minute of the day (end may be 1440, midnight); overnight windows are refused.
The commit deadline ("8 people commit by noon") is a minute of the same Singapore day, at or before the start, and is exclusive too: a commitment made at 12:00:00 for a noon deadline is late.
- **`ClearingResult`:** a Zod schema only; S3 decides whether results are stored.
- **Terms versioning:** an integer `terms_version` on the rule, starting at 1, carried by every commitment.
A trigger bumps it on any change to the public terms (weekday, window, deadline, list price, discount, minimum pool, per-agent cap) and refuses a manual change.
The hidden floor and capacity are left out of the bump, so a version bump never reveals a floor change; evaluation checks the floor against the current rule anyway.
A second trigger refuses a commitment whose `terms_version` is not the rule's current one, reading the rule `FOR SHARE` so a concurrent terms change cannot slip past.
- **Append-only ledger:** row triggers raise on UPDATE and DELETE and a statement trigger raises on TRUNCATE, so the table owner and the superuser are bound too, not only roles without grants.

Built:
- Zod schemas in `src/domain`: `Window`, `AgentTerms`, `MerchantRule` and `Offer` in `offers/schema.ts`, `Commitment`, `ClearingResult`, `LedgerEntry`, with shared `Cents`, `Covers` and `TermsVersion` in `money.ts`.
Money is SGD in integer cents; discounts are basis points.
- `src/domain/singapore-time.ts`: reads an instant's Singapore date, ISO weekday and minute through `Intl` with `Asia/Singapore`, never the host time zone.
- `src/domain/offers/evaluate.ts`: `evaluateCommitment` refuses `stale_terms`, `outside_window`, `past_deadline`, `over_agent_cap` and `below_floor`; `evaluatePool` takes one occurrence's commitments in arrival order, counts each agent's covers toward its cap, and unlocks at the minimum pool; `toOffer` builds the public view field by field.
The discount rounds down to a whole cent, so the fraction stays with the merchant (25% off S$12.50 is S$9.38).
Buyer max price and capacity are carried by the schemas but left to S3's clearing.
- Migrations `drizzle/0001_s2_merchants_rules_commitments_ledger.sql` (generated) and `drizzle/0002_s2_triggers.sql` (custom): tables `merchants`, `rules`, `commitments` (unique per agent and idempotency key, for S4) and `ledger` (one entry per commitment), with check constraints mirroring the Zod schemas.
Triggers, all `ENABLE ALWAYS`: `rules_terms_version`, `commitments_require_current_terms` (`SECURITY DEFINER`, reads the rule `FOR SHARE`), `ledger_append_only` (UPDATE, DELETE) and `ledger_no_truncate`.
- Found and fixed on the way: this machine's shell exports the app's configuration, so the "unit" health test was reaching the real `DATABASE_URL` (a `select 1` on Neon) and failing.
`tests/support/hermetic-env.ts` now removes every app env name except `TEST_DATABASE_URL` before each test file.
CI never saw it, because CI sets no app configuration.

Evidence:
- **[verified]** Typecheck and lint clean; 85 tests pass (66 unit, 19 integration) on a local PostgreSQL 18; `git diff --check` clean.
- **[verified]** Exit tests: window edges in `Asia/Singapore` (start in, end out, midnight on both sides, instants written in UTC, and the host set to `America/New_York`), the minimum pool at, below and above, the per-agent cap at and above with covers already held, the floor at, below and above, and stale terms (older and newer) refused, all in `tests/unit/offers.test.ts`.
- **[verified]** The public `Offer` has exactly the public fields and no floor or capacity, and the strict `Offer` schema refuses an object carrying a floor.
- **[verified]** `tests/integration/s2-tables.test.ts`: the ledger refuses UPDATE, DELETE, TRUNCATE and a cascading TRUNCATE for a non-superuser role holding every privilege, for a non-superuser table owner, and for the superuser, also with `session_replication_role = replica`; the row is untouched afterwards and the role can still insert.
A commitment against stale terms is refused on insert and on update, and a commitment racing a terms change waits for it and is then refused.
- **[verified]** Mutations, with the S1 review runner on a copy of the tree, in [evidence/s2-schema-offers](evidence/s2-schema-offers/README.md): a first run of 102 had one survivor, the `rules.terms_version >= 1` check, which the trigger already implies, so it was removed; the remaining 101 were each killed on an AssertionError, each file restored byte-identical and each rerun green.
- **[verified]** Migrations applied to a local scratch database with `npm run db:migrate` (inline local `DATABASE_URL`); a second run was a no-op; the scratch database was dropped.
- **[verified]** Secret scan by shape (Postgres URLs with a password, bearer values, Neon `npg_` passwords, 64-hex secrets, `sk-` keys) on the working tree and all Git history: the planted needle was found, and otherwise only S1's placeholder test fixtures.
- **[verified]** CI run 40640545545 on `5ce2020` passed: typecheck, lint, 66 unit tests, 19 integration tests on postgres:18, build.
- CI's unit and integration steps now set a fake, unreachable app configuration (`DATABASE_URL` at `db.invalid`, a dummy Meta key), so the `hermetic-env` guard is proven there too, not only in a shell like this one.
**[verified]** Locally under that configuration, with the guard removed, the health unit test failed on an AssertionError (`db: 'down'` instead of `config: 'invalid'`); restored, it passed.
- **[verified]** S2's migration applied to Neon on 2026-10-28 by `npm run db:migrate`, with the URL from `.env.local` (the shell's `DATABASE_URL` unset for the run).
Read-only check afterwards: tables `merchants`, `rules`, `commitments`, `ledger` present and empty, the four triggers enabled `ALWAYS`, 3 migrations recorded.
- Known limit: a table owner can still `ALTER TABLE ledger DISABLE TRIGGER`; no app code does, and the app should not connect as the owner once S4 adds a runtime role.
- **[verified]** S2 merged to `main` at `dfd257c` and pushed; CI run 40647360101 on `dfd257c` passed.
- **[user-reported]** Render serves `dfd257c`: asked what the Render dashboard showed for the live build, the user answered on 2026-10-28 "Live is dfd257c".
`/api/health` had returned 200 `{"ok":true,"db":"up"}` before that answer.

### S3 clearing engine, 2026-10-28

Branch: `backfill/slice-3-clearing`, cut from `main` at `dfd257c`.

Decisions, taken before coding; the user picked the recommended option for each on 2026-10-28:
- **Capacity shortfall:** first come first served, in arrival order (`committedAt`, then `id` as tie-break).
- **Order independence:** the engine sorts commitments into that canonical order itself, so the result does not depend on the caller's array order.
- **Partial fill:** all-or-nothing per commitment.
A commitment that no longer fits the remaining capacity is skipped whole, and later, smaller ones may still fill.
- **Re-check after trimming:** if capacity or a buyer's max price drops the filled covers below `minPoolCovers`, the rule stays locked and nothing fills.
- **Storage:** S3 stays pure, with no clearing table; S4 or S8 decides persistence.

Authorizations, in the user's words:
- 2026-10-28, the handoff prompt: "Build slice S3, "Clearing engine", end to end."
- 2026-10-28, answering the open decisions: "FCFS, engine sorts (Recommended)", "All-or-nothing (Recommended)", "Stay locked, pure (Recommended)".

Built:
- `src/domain/clearing/clear.ts`: `clear(rule, visitDate, commitments)` returns a `ClearingResult` for one occurrence.
It sorts a copy of the commitments into arrival order, runs `evaluatePool` on them for the terms version, window, deadline, per-agent cap and hidden floor, drops commitments whose max price is below `offerPriceCents`, and fills whole commitments first come first served up to `capacityCovers`.
If the filled covers miss `minPoolCovers`, the result is locked and fills nothing.
It is pure: no I/O, no clock, no randomness, and the caller's array is left as it was.
- `ClearingResult` is unchanged: no decision needed a new field.
- `fast-check` `4.10.2` added as a devDependency, pinned exactly.

Evidence:
- **[verified]** Typecheck and lint clean; 109 tests pass (90 unit, 19 integration) on a local PostgreSQL 18 through `TEST_DATABASE_URL`; `git diff --check` clean.
- **[verified]** Unit tests in `tests/unit/clearing.test.ts`: capacity exactly met, a commitment one cover too big skipped whole while a later one still fills, arrival order over array order, the id tie-break, the per-agent cap counted in arrival order, a buyer max at the price and one cent below, the floor at the price and one cent above, the minimum pool exactly met after trimming, locked when capacity or a buyer's max drops the pool below the minimum, refused commitments left out, an empty pool, the caller's array untouched, and the occurrence named in the result.
- **[verified]** Property tests in `tests/unit/clearing.property.test.ts`, fast-check seed `20261028`, 2000 runs per property: a valid result at the offer price, no fill below the hidden floor, none above a buyer's max, total fills within capacity, a locked result fills nothing and an unlocked one reaches the minimum, every fill a whole commitment `evaluatePool` accepted and each at most once, fills first come first served with an eligible commitment skipped only when it does not fit, and the same result for the same input and for any shuffle of it.
A check on the same seed shows the generator is not vacuous: 306 cases unlock, 140 unlock after trimming, 219 are unlocked by `evaluatePool` but left locked by clearing.
- **[verified]** Mutations, with the S1 review runner on a copy of the tree, in [evidence/s3-clearing](evidence/s3-clearing/README.md): a first run of 21 had one survivor, the result's `visitDate` pinned to the only date the tests used, so a test clearing the next week's occurrence was added; the rerun killed all 21 on an AssertionError, each file restored byte-identical and each rerun green.
- **[verified]** CI run 40685470846 on `14b3d00` passed: typecheck, lint, unit tests, integration tests on postgres:18, build.
- Known limit: a commitment whose max price is below the offer price still counts toward its agent's per-agent cap inside `evaluatePool`, because the cap runs before clearing drops it.
The offer price is fixed per terms version, so S4 can refuse such a commitment at submit time.
- Known limit: clearing is not stored; S4 or S8 decides persistence.

### S3 review fixes, 2026-10-28

Branch: `backfill/slice-3-review-fixes`, cut from `backfill/slice-3-clearing` at `f1e957d`, because S3 is not on `main` yet.

Authorizations, in the user's words:
- 2026-10-28, asking for the review: "lets do an unbiased, honest review of S2. IF all is good, start s3", then, asked to clarify, "Review S3, then S4" and "Not yet, after review" for the merge to `main`.
- 2026-10-28, on the verdict: "Fix F1-F4".

Review verdict: ISSUES FOUND, no blockers.
The review ran on local copies of the tree with a disposable local PostgreSQL; no Neon access, no Meta call, no push.
It reproduced 109 passing tests, all 21 S3 mutations killed, and the generator counts 306, 140 and 219.
Fixed:
1. **Medium: a commitment priced out by the buyer's max still counted toward its agent's per-agent cap.**
Reproduced: an agent's 4 covers at 937 cents against a 938-cent price, then its 4 covers at 1250 cents, with a minimum pool of 4, gave a locked result, because the second commitment was refused `over_agent_cap`.
Fix: `clear()` drops commitments whose max price is below the offer price before `evaluatePool`, so such a commitment never counts, as a stale or late one already did not.
2. **Medium: `clear()` could return a result `ClearingResult` refuses.**
Reproduced: two commitments with one id filled the id twice, and `clear(rule, "not-a-date", [])` returned that date.
Fix: `clear()` parses its result, so such an input throws.
3. **Minor: a rule could have a minimum pool above its capacity**, which can never clear, yet buyers would see and commit to it.
Fix: a `MerchantRule` refinement and the check `rules_min_pool_within_capacity` in migration `0003_s3_min_pool_within_capacity`, generated by drizzle-kit.
The clearing property generator now keeps the minimum pool within capacity, and the unit test that relied on a minimum above capacity now skips a commitment that does not fit instead.
4. **Minor: the mutation runner did not count a property failure as an AssertionError.**
Vitest's JSON report keeps only "Property failed" and drops the error behind it, so the S3 README said the properties did not fail on an AssertionError.
Fix: the property file sets fast-check's `includeErrorInReport`, the runner reads the error it adds, and the S3 README is corrected.
A first attempt read a "Caused by:" line, which the JSON report does not hold; the property-only rerun showed it, and it was replaced.

Not fixed, by the user's choice: the build plan's "return partial fills" is read as part of the pool, never part of one commitment; some mutations survive the properties alone and are killed by unit tests.

Evidence:
- **[verified]** Typecheck and lint clean; 114 tests pass (95 unit, 19 integration) on a local PostgreSQL 18 through `TEST_DATABASE_URL`; `git diff --check` clean.
- **[verified]** New tests: a priced-out commitment does not count toward its agent's cap, a repeated id and a visit date that is not ISO are refused, a minimum pool above capacity is refused by `MerchantRule` and by the database with one equal to capacity accepted, and the property "gives the same result with the commitments priced out by the buyer's max left out".
The generator check now also requires cases where a priced-out commitment would change what `evaluatePool` accepts; with seed `20261028`: 1021 unlocked, 450 unlocked after trimming, 247 left locked by clearing, 50 where a priced-out commitment matters.
- **[verified]** Mutations in [evidence/s3-review-fixes](evidence/s3-review-fixes/README.md), at `97c23e1`: all 8 on the fixes killed on an AssertionError, each file restored byte-identical and each rerun green; the 21 S3 mutations on the fixed tree give 17 killed and 4 that no longer apply to the replaced code.
- **[verified]** The S3 exit criterion on the properties alone: with `tests/unit/clearing.test.ts` removed, the properties kill the floor, buyer-max and capacity mutations on an AssertionError.
- Known limit: a commitment for another rule or occurrence whose max price is below the offer price is now dropped before `evaluatePool` sees it, so it no longer throws as a caller error.
- **[verified]** CI run 40698190873 on `7ffa194` passed: typecheck, lint, unit tests, integration tests on postgres:18, build.
- **[verified]** Merged to `main` at `97c1024` on the user's words "Merge to main"; CI run 40698887400 on `main` passed.
- **[verified]** Migration `0003` applied on Neon on the user's words "Apply on Neon": a read-only read before showed 0 rules, none with a minimum pool above capacity, 3 migrations and no `rules_min_pool_within_capacity`; after, 4 migrations and the check present.
- **[unknown]** Whether Render serves `97c1024` (not checked here).

### S4 MCP server and commitments, 2026-10-29

Branch: `backfill/slice-4-mcp`, cut from `main` at `a1c29e0`, after `main` was fast-forwarded from `97c1024` to `a1c29e0` (one status-only commit) and pushed.

Decisions, taken before coding; the user picked the recommended option for each on 2026-10-28:
- **Transport and auth:** streamable HTTP MCP at `/mcp`, stateless, with a bearer token per agent.
The token is minted by `npm run agent:mint`, shown once or written to `.env.local`, and only its SHA-256 is stored.
The agent id comes from the token, never from a tool argument.
The Day 0 check runs alongside; if Muse needs OAuth or no auth, only the auth layer changes.
- **Commitments:** submit refuses at once anything that could not count: stale terms, a date off the offer's weekday, a late commitment, an agent over its cap, and a max price below the offer price.
Cancel is allowed only before the occurrence's deadline; from the deadline on a commitment is binding.
A rule whose offer price is below its floor is left out of `list_offers` and answered `offer_unavailable`, exactly like a missing rule, so no reply ever says `below_floor`.
Status is `pending` (with the pooled covers and the public minimum), `cancelled`, `filled` (with the price per cover) or `not_filled`.
- **Storage and role:** the first status read after an occurrence's deadline runs `clear()` and stores the result once; a cancel sets `cancelled_at` instead of deleting; a least-privilege `NOLOGIN` role `backfill_app` is added for the app to connect through.
- **Branch base:** fast-forward `main` first, then cut S4 from it.

Authorizations, in the user's words:
- 2026-10-28, the handoff prompt: "start S4".
- 2026-10-28, answering the open decisions: "HTTP + agent token (Recommended)", "Strict, floor hidden (Recommended)", "Store at deadline + role (Recommended)", "Fast-forward main first (Recommended)".
- 2026-10-28, for the exit: "Neon: migrations 0004+0005", "Neon: seed demo offer + agent", "Fast-forward main and push", "Claude runs the exit on Render"; for Day 0: "I'll do it after deploy".

Built:
- `@modelcontextprotocol/sdk` `1.32.1`, pinned exactly (1.32.2 was 5 days old).
- Migration `0004_s4_agents_cancel_clearings` (generated): `agents` (hashed token, `revoked_at`), `commitments.cancelled_at` and a foreign key from each commitment to its agent, and `clearings` with `clearing_fills`.
- Migration `0005_s4_triggers_runtime_role` (custom): `commitments_until_cleared` lets a commitment only be cancelled, once, and refuses a new commitment or a cancel once its occurrence is cleared, reading the visit's `Asia/Singapore` date.
Row triggers keep `clearings` and `clearing_fills` append-only and a statement trigger refuses TRUNCATE on `clearing_fills`; `clearings` needs none, because the foreign key refuses a TRUNCATE without CASCADE and one with CASCADE reaches `clearing_fills`.
`lock_rule_for_clearing` takes the rule `FOR UPDATE` as `SECURITY DEFINER`, so clearing waits for every commitment insert holding the rule `FOR SHARE`, without granting the runtime role UPDATE on rules.
`backfill_app` holds SELECT on merchants, rules and agents; SELECT and INSERT on commitments, clearings, clearing_fills and llm_calls; UPDATE on `commitments.cancelled_at` only; nothing on the ledger.
- `src/domain/commitments/occurrence.ts`: an occurrence's deadline, start and end as instants for a Singapore date, and the next occurrence whose deadline is ahead, through `Intl`, never the host time zone or a fixed offset.
- `src/lib/commitments/service.ts`: list, terms, submit (per-agent advisory lock, idempotency key per agent, a retried key returns the first commitment, a key reused for different arguments is refused), status (clears and stores at the first read from the deadline on), cancel.
A commitment's visit time is the window's start on its date.
- `src/lib/mcp/server.ts` and `src/app/mcp/route.ts`: the five tools, each reply parsed by a strict schema before it is sent, and any failure answered `unavailable` with no query or error text.
The submit and cancel descriptions say plainly that a commitment is binding and cannot be withdrawn from the deadline on, and tell the agent to show the user the terms and get their agreement first.
`GET` and `DELETE` answer 405; a missing, wrong-scheme, unknown or revoked token answers 401 with a Bearer challenge.
- `npm run agent:mint` and `npm run mcp:smoke` (a scripted MCP client that reads its token from env and never prints it).
- The mutation runner now writes a mutation with a replacer function: with a plain string, `$$` in SQL became `$`.

Evidence:
- **[verified]** Typecheck and lint clean; 145 tests pass (106 unit, 39 integration) on a local PostgreSQL 18 through `TEST_DATABASE_URL`; `git diff --check` clean.
- **[verified]** `tests/integration/s4-mcp.test.ts` drives the route's handler with the SDK's own MCP client over streamable HTTP, connected as a login role that is only a member of `backfill_app`.
It covers auth, the tool list and binding wording, the floor-hidden offer answered like a missing one, every submit refusal and its boundary, the cap across visits and cancels, idempotency, eight simultaneous submits holding the cap at 4, a submit that waited on a terms change (`stale_terms`) or a clearing (`occurrence_cleared`), status before and at the deadline, a clearing stored once and unchanged by a later floor or capacity change, cancel before and at the deadline, another agent's commitment answered `not_found`, the database triggers and the runtime role's grants.
- **[verified]** Mutations in [evidence/s4-mcp](evidence/s4-mcp/README.md), at `5b00ee6`: all 47 killed on an AssertionError, each file restored byte-identical and each rerun green.
A first run gave 42, 1 survivor and 4 crashes, from the runner bug above, two weak mutations and tests that crashed on a refused submit; all fixed before the rerun.
The two lock mutations are killed by racing requests, so those kills are likely rather than certain.
- **[verified]** Local production build (`next start`) as a runtime-role login on a scratch database: `/api/health` 200, `POST /mcp` without a token 401, `GET /mcp` 405, a rule with its floor above the offer price left out, a 2-cover commitment submitted and read back pending, the server log line `mcp.tool` with the agent id and no token; the scratch database and role were dropped.
- **[verified]** CI run 40720604862 on `ded7a05` passed: typecheck, lint, unit tests, integration tests on postgres:18, build.
- **[verified]** Migrations `0004` and `0005` applied on Neon with `npm run db:migrate`: a read-only read before showed 4 migrations, no S4 tables, 0 rules, 0 commitments and no `backfill_app`, and `neondb_owner` with CREATEROLE; after, 6 migrations, `agents`, `clearings`, `clearing_fills` and `cancelled_at` present, `backfill_app` present, 8 triggers all `ENABLE ALWAYS`.
- **[verified]** Seeded on Neon: one merchant named "Demo Kopitiam (synthetic)" with one rule (25% off S$12.50, Tuesday 14:00-17:00, by 12:00, minimum 8, 4 per agent, floor S$9.00, capacity 20), and the agent `smoke-claude`, whose token is in `.env.local` as `BACKFILL_SMOKE_TOKEN`.
- **[verified]** `main` fast-forwarded to `ded7a05` and pushed; CI run 40724398296 on `main` passed; Render then answered `GET /mcp` with 405 and `/api/health` with 200.
- **[verified]** Exit, by Claude, since the Day 0 check is not done: `npm run mcp:smoke` against https://backfill-9d0x.onrender.com, a scripted MCP client run by Claude (not Claude's own connector, and not Muse).
`POST /mcp` without a token returned 401; with the token it listed the five tools and the offer at 938 cents, read the terms, submitted commitment `687a0503-f0ae-405a-a44c-5ee4c219d9fa` (2 covers at 938 cents for 2026-11-03) and read it back pending with 2 pooled covers of 8; no reply mentioned a floor or capacity.
A read-only read of Neon showed that one commitment row, agent `smoke-claude`, not cancelled.
- **[verified]** CI run 40724901739 on `9aa37a1` (this status) passed.
- **[user-reported]** Render logs (screenshot, 2026-10-29): `mcp.tool` lines for `smoke-claude` (`list_offers`, `get_agent_terms`, `submit_commitment`, `get_commitment_status`, all ok) and for `muse-user` (`list_offers`, `get_agent_terms`).
- **Day 0 Muse connector check, 2026-10-29.**
The user minted the agent `muse-user` and added `https://backfill-9d0x.onrender.com/mcp` as a custom connector in their Singapore Muse account.
**[user-reported]** It could be added without Meta's review and authenticated with the bearer token; the first check timed out while Render woke from its free-plan spin-down, the second listed the five tools.
**[user-reported]** Muse asked before submitting, not before reads: it showed the merchant, visit, covers, total at the offer price (S$18.76), deadline, pool rules and the binding wording, with "Yes, commit 2 covers" and "No, don't commit".
- **[verified]** Exit by a real Muse account: after the user chose "Yes, commit 2 covers", a read-only read of Neon showed commitment `34e1cb93-a6cc-41f8-8869-4e458b6f90c8`, agent `muse-user`, 2 covers at 938 cents for 2026-11-03, committed 2026-10-29T17:44:02Z, not cancelled.
- Runtime role: `backfill_web` (LOGIN, member of `backfill_app`) created on Neon by SQL at the user's request, since the Neon console showed no Roles page; its URL is in `.env.local` as `RUNTIME_DATABASE_URL`.
**[verified]** Connected as it through the pooled host: it reads `rules` and is refused DELETE on `commitments` and SELECT on `ledger`.
**[verified]** Render uses it since 2026-10-30: the user replaced Render's `DATABASE_URL` (which had still been the owner URL) with the `backfill_web` URL and redeployed; while Render answered `/api/health` with 200, `pg_stat_activity` showed `backfill_web` sessions, and `POST /mcp` with an unknown token answered 401 (the agent lookup ran as `backfill_web`), not 503.
**[unknown]** A full tool call as `backfill_web` on Render: `BACKFILL_SMOKE_TOKEN` could no longer be read from `.env.local` for `npm run mcp:smoke`.
- Known limit: a clearing is stored at the first status read from the deadline on, not at the deadline itself, so a floor or capacity change between the two still counts.
- Known limit: a buyer can still infer a little: pooled covers drop if the merchant later raises the floor above the offer price (the rule then stops counting), and `not_filled` with a full pool hints at capacity.
- Known limit: `agent:mint` and `mcp:smoke` have no automated tests; both were run for real here (mint on Neon, smoke on Render).
- Neon now holds the two exit commitments (Claude's and Muse's); they become binding at 12:00 on 2026-11-03 and, with 4 of 8 covers pooled, will clear as `not_filled` unless more commit.

### S5 negotiation, 2026-10-30

Branch: `backfill/slice-5-negotiation`, cut from `main` at `96900fb`.
Fast-forwarded to `main` at `74f6cdc` and running on Render; migrations on Neon.

Decisions, taken before coding; the user picked the recommended option for each on 2026-10-30:
- **Price model:** a counter-offer sets the price per cover of one buyer's commitment only.
"Both limits" are the merchant's hidden floor and the buyer's max price per cover.
Clearing fills each commitment at its own agreed price, and an unnegotiated one at the offer price; `clearing_fills` gets a price column.
- **Who and when:** a buyer agent negotiates through a new MCP tool before it submits, and Muse Spark speaks for the merchant and proposes each counter.
The signed counter is passed to `submit_commitment` as a new optional field; pending commitments are never re-priced.
- **Storage and floor leakage:** `negotiations` and `negotiation_rounds` tables, append-only by trigger and granted to `backfill_app`.
One negotiation per agent per rule occurrence, so a restart adds no probes.
Merchant counters never rise, concede at most a fixed step per round and never go below the floor; when a proposal would cross the floor, the merchant holds with the same reply as the model's own hold.
At most 3 rounds, then refusal; the HMAC token names its stored round, and one negotiation makes at most one commitment.
- **Spark spend:** tests fake the model at the fetch boundary; one authorized live negotiation for evidence, stopped if spend passes US$0.10.

Authorizations, in the user's words:
- 2026-10-30, answering the open decisions: "Per-commitment price (Recommended)", "Buyer via MCP, pre-submit (Recommended)", "Table, 1 per occurrence (Recommended)", "Fake HTTP + 1 live, cap US$0.10 (Recommended)".
- 2026-10-30, for the local work after the code: "Local work first".
- 2026-10-30, for the live run: "Live Spark run", then, asked before the Meta call with its cost and cap: "Yes, run it (Recommended)".
- 2026-10-30, to push: "Push branch for CI".
- 2026-10-30, for main: "Fast-forward main"; then "Render redeployed", and, asked before minting a smoke agent on Neon: "Mint and check (Recommended)".
- 2026-10-30, for Neon: "Neon migrations", then, asked before the write with the warning that S4's clearing insert fails once `0006` is applied: "Yes, apply both (Recommended)".

Built:
- Migration `0006_s5_negotiations` (generated): `negotiations` (one per agent, rule and visit date, with fixed covers and terms version) and `negotiation_rounds` (rounds 1 to 3, the bid, the model's proposal and why it did or did not count, the status and the merchant's price after the round); `commitments.negotiation_id` (at most one commitment per negotiation) and `negotiated_price_cents`; `clearing_fills.price_per_cover_cents`, NOT NULL with no default.
- Migration `0007_s5_negotiation_triggers` (custom): `commitments_until_cleared` now also fixes the two new commitment columns; `commitments_negotiated_match` refuses a commitment whose agent, rule, terms version, visit date, covers or price differ from its negotiation and that negotiation's latest round; `negotiation_rounds_in_order` keeps rounds in order with no gap and the merchant's price never rising; both new tables are append-only and refuse TRUNCATE for every role; `backfill_app` gets SELECT and INSERT on both.
- `src/domain/negotiation/rules.ts`: at most 3 rounds, at most 250 bps of the list price conceded per round, rounded down; `judgeProposal` refuses a proposal that rises, concedes more than one step, falls below the bid or below the floor; `settleRound` holds at the previous price on any refused or missing proposal, and closes when the previous price is below a raised floor or above the offer price.
- `src/domain/negotiation/counter-offer.ts`: a strict `CounterOffer` signed with HMAC-SHA256 under `NEGOTIATION_SIGNING_SECRET` (at least 32 characters), verified in constant time; a token with extra parts, a re-encoded signature or a payload that is not a valid offer is refused.
- `src/lib/negotiation/merchant-agent.ts`: `sparkMerchant` asks Muse Spark for a price per cover with the public numbers and the round's bounds, never the floor; any failure becomes a hold.
- `src/lib/negotiation/service.ts` and the MCP tool `negotiate_offer`, offered only when the server has the signing secret: the same refusals as submit for availability, terms, weekday, deadline and cap, plus `round_limit`, `negotiation_mismatch`, `negotiation_closed`, `negotiation_used` and `negotiation_busy`; the model is called outside any transaction and the round stored under its primary key.
- `submit_commitment` takes an optional `counterOffer`: it must verify, name this agent and these arguments, be its negotiation's latest round and meet the current floor, or the reply is `counter_offer_invalid`; then `max_price_below_counter_price` and `counter_offer_used`.
The per-agent cap counts each held commitment at its own price.
- `clear()` fills each commitment at its own price: the negotiated price, or else the offer price, and only when that is at or below its max, at or below the offer price and at or above the floor.
The stored fill and `get_commitment_status` carry that price.
- The mutation runner takes several edits per mutation, so an app check and the trigger behind it can be removed together.
- `npm run negotiation:live -- <local-postgres-url>`: one negotiation against the real merchant model, on a scratch database on a local PostgreSQL (it refuses any other host) as a runtime-role login, bidding S$8.50 each round, then a commitment at the last counter-offer; no round starts once the cost recorded in `llm_calls` reaches US$0.10, and the scratch database and role are dropped after.
It prints only whether `NEGOTIATION_SIGNING_SECRET` is set and signs with a fresh secret of its own.
Tested end to end with the model's fetch faked.
- `sparkMerchant` now logs the proposed price and the model's rationale with each proposal, as its comment already said; neither reaches the buyer.

Evidence:
- **[verified]** Typecheck, lint, `npm run build` and `git diff --check` clean; 198 tests pass (130 unit, 68 integration) on a local PostgreSQL 18 through `TEST_DATABASE_URL`.
- **[verified]** `tests/integration/s5-negotiation.test.ts` drives the route's handler with the SDK's MCP client, connected as a login role that is only a member of `backfill_app`, with the real Meta provider and its fetch faked at the HTTP boundary.
It covers the exit: a proposal below the floor (899 against a floor of 903) is recorded `below_floor`, holds with the same reply as any hold, cannot be committed with a token signed by another secret, with a token signed by the right secret, or by a direct insert as the runtime role, and never reaches a commitment or a clearing; the held counter commits and clears at 907 while unnegotiated commitments clear at 938.
It also covers each round outcome, the round limit, model failure, every refusal, races for the first and second round, counter-offer misuse, idempotency, the cap at the negotiated price, a floor raised after a counter, and the database guards and grants.
- **[verified]** Mutations in [evidence/s5-negotiation](evidence/s5-negotiation/README.md), at `7a5382b`: all 68 killed on an AssertionError, each file restored byte-identical and each rerun green.
A first run, at `2b2e58c`, gave 58 killed and 10 survivors, all test gaps, closed in `7a5382b`; 2 of its reruns failed on unmutated files, most likely chance collisions of random ids with the floor's digits in two leak checks, also fixed there.
- **[verified]** Mutations of the live script and the rationale log, in the same folder, at `31ac9fd`: all 4 killed on an AssertionError, each restored byte-identical and each rerun green, after two test fixes found by a first run.
- **[verified]** Live negotiation, 2026-10-30T01:00Z, with `muse-spark-1.3` through the Meta API, run from the working tree committed as `9ece551` before the rationale log was added, on a scratch local database (no Neon write).
Offer 938 cents for 2 covers on 2026-11-03, bid 850 each round.
Spark proposed 938 (held), then 930 and 920 (countered); every proposal was judged `ok`, every price stayed between the floor of 903 and the offer, and each step was within 31 cents.
`submit_commitment` with the round 3 counter-offer was accepted at 920 cents.
3 calls, each on the first attempt: 275 tokens in each, 311, 326 and 701 out, 3.0, 2.5 and 4.9 seconds, US$0.006593 in all, against the US$0.10 cap.
The scratch database and role were dropped; `NEGOTIATION_SIGNING_SECRET` is set locally.
- **[verified]** CI run 40987205858 on `79036e6`, the pushed branch, passed: typecheck, lint, unit tests, integration tests on postgres:18, build.
- **[verified]** Migrations `0006` and `0007` applied on Neon with `npm run db:migrate`, as `neondb_owner`: a read-only read before showed 6 migrations, no S5 tables, 0 clearings, 0 clearing fills and the 2 pending exit commitments for 2026-11-03; after, 8 migrations, `negotiations` and `negotiation_rounds` present, `clearing_fills.price_per_cover_cents` NOT NULL, the 8 triggers on `commitments`, `negotiations` and `negotiation_rounds` all `ENABLE ALWAYS`, `backfill_app` with INSERT and SELECT only on both new tables, the 2 commitments unchanged and 0 fills.
- **[verified]** `main` fast-forwarded from `96900fb` to `74f6cdc` and pushed; CI run 40993395127 on `main` passed.
- **[user-reported]** Render redeployed with `NEGOTIATION_SIGNING_SECRET` set.
- **[verified]** Render after the redeploy: `/api/health` 200 with the database up, `GET /mcp` 405, `POST /mcp` without a token 401.
Agent `smoke-s5` minted on Neon, its token in `.env.local` as `BACKFILL_SMOKE_S5_TOKEN`; `npm run mcp:smoke` without covers (no commitment) listed six tools including `negotiate_offer`, read the offer and terms, and no reply mentioned a floor or capacity.
So Render runs S5 and will clear the 2 exit commitments with S5's clearing.
- Known limit: `counter_offer_invalid` for a token that was valid, and `negotiation_closed`, each tell a buyer that the floor rose past a price it already knows (or that the terms changed); neither names the floor.
- Known limit: `sparkMerchant` turns every error into a hold, including a wrong key, an unpriced model or a code bug, so a broken model setup looks like a stubborn merchant to the buyer; each failure is logged as `negotiation.proposal_failed` and recorded in `llm_calls`.

Not done:
- **[user-reported]** Render: `NEGOTIATION_SIGNING_SECRET` is set there; the user set it and redeployed on 2026-10-30.
**[verified]** `negotiate_offer` is listed to `smoke-s5` on Render (above).
- **[unknown]** A negotiation on Render: none was run there; the live negotiation ran locally.

### S6 onboarding and Wonder merchant agent, 2026-10-30

Branch: `backfill/slice-6-onboarding`, cut from `main` at `67d0cab`.

Decisions, taken before coding on 2026-10-30:
- **Merchant:** synthetic only, re-steered by the user on 2026-10-30: the exit uses "Singapore Test Restaurant" and a synthetic menu photo, not a real merchant.
This takes cut-order item 5 (real merchant) and changes S6's exit from "a real Singapore merchant's menu photo" to a synthetic one.
The user also dropped the "(synthetic)" label for S6 merchants: a name with "Test" in it says it is not real.
Existing rows such as "Demo Kopitiam (synthetic)" on Neon and in the S5 live script are left as they are.
No payment method is needed from the merchant, since Backfill moves no real money.
- **Look:** the user asked for a colour theme that fits Muse and a different font.
The theme is a cream ground, deep ink text, electric blue for actions and a thin teal, blue and magenta bar, after Muse's iridescent identity; the font is Figtree. No Muse or Meta logo is used.
- **Wonder memory:** rules, fill history and past plans live in our own Postgres and are passed to Muse Wonder in every call; Meta's Responses API memory is not relied on.
- **Storage:** the menu photo is sent to Muse Spark and not kept; only its SHA-256 and size are stored.
Spark's draft and the merchant's confirmation go in new append-only tables, guarded by triggers like `negotiations`.
- **Spend:** tests fake the model at the fetch boundary; live evidence is up to 3 Spark vision calls and up to 3 Wonder calls, stopped once the cost recorded in `llm_calls` reaches US$1.00, each asked for by name before it runs.
- **Merchant auth:** a per-merchant secret link; only the token's SHA-256 is stored, like agent tokens.

Authorizations and permissions, in the user's words:
- 2026-10-30, on the real merchant: "Merchants have given me verbal persmission already to use their menu".
The permission is verbal, not in writing; no merchant's name or menu is published beyond the demo without asking.
- 2026-10-30, answering the open decisions: "Our DB, passed each call (Recommended)", "No photo kept; append-only drafts (Recommended)", "Up to 3 each, US$1.00", "Per-merchant secret link (Recommended)".
- 2026-10-30, on the synthetic merchant: "Synthetic restaurant build not kopitiam. I would think this would be more prevalent to cafes or restaurants".
- 2026-10-30, on the look and the merchant: "Can u change the color theme to fit that of Muse?, and also change the font to something else." and "As for the real restaurant or cafe, i would want you to just make a synthetic one. So like "Singapore Test Restaurant". This is a hackathon not a product we're building for a customer."
- 2026-10-30, on the label: "Remove (synthetic), Singapore Test Shop literally screams its alr a fake merchant dont overcomplicte".
- 2026-10-30, for the live run: "Run live calls".
- 2026-10-30, to push the branch: "Push branch".
- 2026-10-30, for Neon, asked before each step: "Yes, read-only check", then "Yes, apply 0008 and 0009".
- 2026-10-30, for the merchant on Neon: "Yes, in my terminal tab", so the secret link was printed in the user's own terminal tab and never read by Claude.
- 2026-10-30, for main: "Yes, ff and push main"; then "Redeployed".
- 2026-10-30, unprompted: "can u add a loading icon i cant tell if its loading or not".

Built:
- Migration `0008_s6_onboarding` (generated): `menu_drafts` (Spark's draft, the photo's SHA-256 and size, never the photo), `offer_publications`, `wonder_plans` and `plan_applications`.
- Migration `0009_s6_onboarding_triggers` (custom): `menu_drafts_price_matches` checks the cover's price against the draft's items; all four tables are append-only and refuse TRUNCATE; the functions `publish_offer` and `apply_wonder_plan` are the only way the runtime role creates or changes a merchant's rule.
- `src/domain/onboarding/menu.ts`: the photo sniff and 4 MiB limit, the strict `MenuDraft`, `judgeDraft` (SGD only, at least one item, a cover of 1 to 4 distinct menu items) and `ruleFromDraft` (the hidden floor must not exceed the offer price).
- `src/domain/onboarding/replan.ts`: the strict `WonderPlan` and `judgePlan`, which bounds a plan's terms and lets capacity grow at most 2 times.
- `src/lib/onboarding`: `readMenu` (Spark vision, one read at a time per merchant, 30 a day), `publishDraft`, `dashboard`, `replanSoldOut` (Wonder, once per sold-out occurrence, 30 a day) and `applyPlan`; `mintMerchant` and `authenticateMerchant` for the secret link; `models.ts` holds the Spark and Wonder prompts, and Wonder gets the rules, fill history and past plans from our Postgres on every call and never the floor.
- `src/integrations/meta/provider.ts` sends images as data-URL `image_url` parts.
- `src/app/merchant`: the secret-link entry (the token is in the URL fragment, only its hash is stored), the upload page, the draft review and publish form, and the dashboard with each occurrence and Wonder's plans; the pages use a cream, ink and blue theme and Figtree.
- `npm run merchant:mint -- "<name>"` and `npm run onboarding:live -- <local-postgres-url>`.
- `SubmitButton` (`src/app/merchant/submit-button.tsx`): on Read menu, Confirm and publish, and Apply plan, the button disables itself, shows a spinner and changes its label while the action runs; added on 2026-10-30 after the user could not tell whether Read menu was working.

Evidence:
- **[verified]** At `065eaef`: typecheck and lint clean, `npm run build` completes, and 244 tests pass (147 unit, 97 integration) with `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres`.
- **[verified]** Mutations in [evidence/s6-onboarding](evidence/s6-onboarding/README.md), at `9069c3a`: all 106 killed on an AssertionError, and all 8 of the live script's, each file restored byte-identical and each rerun green.
A first run, at `0022e07`, gave 68 killed, 31 survivors and 7 killed only by an error; the survivors were test gaps, and 3 reruns on unmutated files failed on a leak check that grepped random UUIDs for the floor's digits; all fixed in `1c56e60`.
- **[verified]** Live run, 2026-10-30T13:04Z, at `d6e46f1`, on a scratch local database (no Neon write): Spark read all 12 prices of the synthetic menu exactly and chose Hainanese Chicken Rice and Kopi C, so the cover is S$8.30; the draft published at 25% off, S$6.23, with a hidden floor of S$5.81; 2 agents filled all 4 covers of 2026-11-03; Wonder planned 20% off, 6 covers, a pool of 3 and 2 per agent, judged `ok`, applied as terms version 2.
Spark cost US$0.010438 and Wonder US$0.017296, US$0.027734 in all against the US$1.00 cap.
This settles that Meta accepts `image_url` data-URL parts.
- **[verified]** CI run 41062170795 on `02fa613` (the branch) and run 41067301697 on `main` at the same commit passed.
- **[verified]** Migrations `0008` and `0009` applied on Neon with `npm run db:migrate`: a read-only read before showed 8 migrations and no S6 tables; after, 10 migrations and `menu_drafts`, `offer_publications`, `plan_applications` and `wonder_plans` present.
Rows in `0000` to `0007` tables were not touched.
- **[verified]** "Singapore Test Restaurant" minted on Neon with `npm run merchant:mint`; a read-only read shows one merchant of that name.
The secret link is only in the user's terminal tab.
- **[verified]** `main` fast-forwarded from `67d0cab` to `02fa613` and pushed, with `git fetch . backfill/slice-6-onboarding:main`.
- **[user-reported]** Render redeployed at `02fa613`.
- **[verified]** Render after the redeploy: `/api/health` 200 with the database up, `/merchant` and `/merchant/enter` 200.
- **[user-reported]** The user opened the secret link on Render, uploaded a menu photo of their own and published an offer; the Render merchant page showed "Singapore Test Restaurant" with a file chosen and "No offers yet" before it.
- **[verified]** Exit on Render, with `npm run mcp:smoke` as `smoke-s5`, no covers (no commitment): the offers now include "Singapore Test Restaurant" at S$7.00 listed and S$5.25 offered (25% off), Tuesday 14:00-17:00, pool 8, 4 per agent, next visit 2026-11-03; the output has no "floor" or "capacity".
A read-only read of Neon shows that rule with a hidden floor of 490 cents (70%), capacity 20, terms version 1, 1 `offer_publications` row, 2 `menu_drafts` rows and 0 `wonder_plans`; the 2 commitments from S4 are unchanged.
So the photo became a published offer, with the floor kept from buyers.
- **[verified]** The spinner, in the browser, on a temporary page with a 6 second server action and the real `SubmitButton`: while pending, the button was dimmed with a spinner and the label "Reading menu…"; the temporary page was deleted.

Known limits:
- The Spark and Wonder daily caps of 30 are global, not per merchant.
- The merchant cookie is `Secure` only in production.
- A Wonder plan cannot be applied while any commitment is pending.
- An occurrence with no plan is judged sold out against the current capacity.
- Two offers of one merchant with the same window are not told apart on the dashboard.
- Wonder's memory is our Postgres, not Meta's Responses API memory ([vendor claim], unused).
- Wonder's rationale can be a bare phrase: in the live run it was only "sold out", and the schema checks only its length.
- A bare `npm test` failed in 8 integration files with `TEST_DATABASE_URL` undefined; CI and the commands above set it.

Not done:
- **[unknown]** Whether Spark read the user's own photo correctly on Render: Claude never saw that photo, and only the published S$7.00 price and the 2 stored drafts are known.
- **[unknown]** A Wonder plan on Render: none was run there; it ran locally.
- **[unknown]** The spinner on Render and on the real forms: it was seen only on the temporary page, and `065eaef` is not on `main` or Render.
- Negotiation on Render, S6b to S10, the 8 old `backfill_t_*` databases on local PostgreSQL (from earlier interrupted runs, not S6).

### S6b WhatsApp merchant agent, 2026-10-30

Branch: `backfill/slice-6b-whatsapp`, cut from `backfill/slice-6-onboarding` at `39540fc` (S6 plus the spinner, the S6 record and the `.gitkeep` cleanup, none of which is on `main` yet).
The user asked for it on 2026-10-30 ("Continue to s6b"); S6 finished on 2026-10-30, inside the plan's "only if S6 is done by Oct 31" condition.
In the same message the user approved deleting the 6 stale `.gitkeep` files, done in `39540fc`.

Decisions, taken before coding; the user picked the recommended option for each on 2026-10-30:
- **Setup:** "Not set up yet (Recommended)": the webhook is built and tested with fake WhatsApp payloads first, and the user creates the Meta app, the test number and the secrets while that happens.
The live exit (a real message from the owner's phone) waits for those; until then it is [unknown].
- **Owner binding:** "Link code, then reply YES (Recommended)": the merchant page shows a one-time code, the owner sends `LINK <code>` from their phone, and only that number can then change that merchant's offer.
A change proposed by Muse Wonder is shown to the owner as plain text and publishes only after a `YES` reply that the code reads, not the model.

Design, mine within those two decisions:
- The owner may change the four terms Wonder already plans (discount, capacity, minimum pool, per-agent cap), in either direction, within bounds checked in the domain and again in SQL; the window and the floor never change, and the new offer price must stay at or above the floor.
- Only a merchant with exactly one rule can use WhatsApp for now; with two or more, the reply sends them to the merchant page.
- "No discount this Tuesday" is not a term the schema has (a discount cannot be 0 and an occurrence cannot be paused), so Wonder says what it can change.

Built:
- Migration `0010_s6b_whatsapp` (generated): `whatsapp_link_codes` (the SHA-256 of a one-time code, never the code), `whatsapp_links` (a phone number bound to a merchant by one code), `whatsapp_inbound` (one row per inbound message id), `owner_changes` (a proposed change with its verdict, the message text cut to 500 characters, the terms version it was made against and a 15 minute expiry) and `owner_change_outcomes` (applied or cancelled).
- Migration `0011_s6b_whatsapp_triggers` (custom): all five tables are append-only and refuse TRUNCATE for every role; `claim_whatsapp_link` links a number from an unexpired, unused code; `apply_owner_change` applies a change only if it counted, is the merchant's own, is unexpired, is the merchant's newest, was made against the rule's current terms version, is inside the owner bounds (checked again) and no live commitment is pending; `cancel_owner_change`; the runtime role records codes, inbound ids and proposals, and links, applies and cancels only through the functions.
- `src/domain/whatsapp/owner-change.ts`: the strict `OwnerChange` the model returns, `judgeOwnerChange` (discount 1 to 9,999 bps, capacity 1 to 10,000, minimum pool and per-agent cap between 1 and capacity, at least one change, price at or above the floor) and `readIntent`, which reads LINK, YES and NO by code so the model never confirms.
- `src/lib/whatsapp`: `cloud.ts` (the `X-Hub-Signature-256` check, Meta's subscription challenge, reading text messages, sending a text reply), `owner-model.ts` (Wonder reads the message from the rule's public terms and never the floor) and `service.ts` (`newLinkCode`, `handleMessage`, `processInbound`; one reply per message; a message id handled once; one model call at a time and 30 a day across all merchants).
- `src/app/api/whatsapp/route.ts`: GET answers the subscription check, POST verifies the signature, answers 200 at once and handles the messages after the response with `after()`; without the `WHATSAPP_*` settings it answers 404.
- `src/env.ts` and `.env.example`: `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` (all four or none, or the app refuses to boot) and `WHATSAPP_GRAPH_BASE_URL`.
- The merchant page has a "Change your offer by WhatsApp" card, shown only when WhatsApp is set up: it shows a link code in place (never in a URL) and the last four digits of the linked number.
- Two bugs found by the tests and fixed before the commit: the phone lookup compared a timestamp it had read back at millisecond precision with Postgres's microsecond one, so a freshly linked number never resolved; and a second `YES` racing the first was told its offer had changed instead of that it was already live.
- `tests/integration/s2-tables.test.ts` granted privileges on a hard-coded table list, so every new table broke it; it now grants on all tables in the schema.

Evidence:
- **[verified]** At `0d75d76`: typecheck and lint clean, `npm run build` completes with `/api/whatsapp` listed, and 319 tests pass (28 files) with `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres`, three plain runs in a row after the last test change.
- **[verified]** Mutations in [evidence/s6b-whatsapp](evidence/s6b-whatsapp/README.md), at `0d75d76`: all 113 killed on an AssertionError, each file restored byte-identical and each rerun green.
Earlier runs gave 97 killed with 12 survivors and 4 killed only by an error, then 111 with 2 killed only by an error; the survivors were test gaps, redundant guards or invalid mutants, all closed.
The same leak check that failed 7 reruns in the first run (a floor's digits found in random UUIDs) is the likely cause of one baseline failure at the start of the second attempt; it was fixed in `1681501`.
- **[verified]** End to end on the real route, on a throwaway local database, with a fake Meta model and a fake Graph API over HTTPS and `next dev`: `GET /api/whatsapp` echoed the challenge for the right token and refused a wrong one; an unsigned `POST` was 403; a signed `LINK <code>` bound the number; a signed "make it 20% off" answered 200 in 36 ms and the reply listing the change reached the fake Graph API after the 1.5 second fake model call; `YES` changed the rule from 25% to 20% and the terms version from 1 to 2; "no discount this Tuesday" got the guidance reply and a later `YES` got "Nothing is waiting"; the merchant page showed the code in place and then "linked to the number ending 4567".
Nothing there touched Neon or Meta.
- **[unknown]** A mutation runner started on a fresh copy of the tree at `cdacd02` stopped with "baseline not green", though the same suite passed 6 plain runs in a row in the working tree and again inside that copy right after; the likely cause is a cold start in a fresh copy (not shown), and the runner's own baseline is the only evidence of the failure. Not fixed: it did not reproduce.
- **[verified]** Migrations `0010` and `0011` applied on Neon with `npm run db:migrate`: a read-only read before showed 10 migrations and no S6b tables; after, 12 migrations, the five tables, the three functions, 10 triggers all `ENABLE ALWAYS`, and `backfill_app` with INSERT and SELECT on `owner_changes`, `whatsapp_inbound` and `whatsapp_link_codes` and SELECT only on `whatsapp_links` and `owner_change_outcomes`; rules and commitments unchanged at 2 and 2.
- **[verified]** `main` fast-forwarded from `02fa613` to `0d75d76` and pushed; CI run 41080257101 on `main` passed.
That puts on `main` the spinner (`065eaef`), the S6 record, the `.gitkeep` cleanup and all of S6b's code.

Known limits:
- A link code has 8 characters from a 30-letter alphabet and lives 10 minutes; nothing limits wrong guesses, so the only protection is that Meta's sandbox lets only the recipients you add message the test number.
- A phone number is linked to one merchant and a merchant to one number; the newest link wins, and nothing unlinks without a new code.
- Only a merchant with exactly one offer can use WhatsApp; the model is called once per instruction, at most 30 a day across all merchants.
- A message id is claimed before it is handled, so a crash between the claim and the reply drops that message; the owner sends it again.
- The owner's message text is stored in `owner_changes`, cut to 500 characters.
- An owner change cannot be applied while any commitment on the offer is pending, as with a Wonder plan.
- The Graph API version in `WHATSAPP_GRAPH_BASE_URL` (`v23.0`) is a default I could not confirm against Meta's current docs ([unknown]).
- Replies are free text, which Meta allows only within 24 hours of the owner's last message ([vendor claim]); the owner's own message always opens that window.

Live check, 2026-10-30 (user-driven, with Claude reading Neon and Render read-only):
- **[user-reported]** The user created the Meta app "Backfill Test" and claimed Meta's WhatsApp test number, added their own phone as a recipient, set the four `WHATSAPP_*` values and `WHATSAPP_GRAPH_BASE_URL=https://graph.facebook.com/v25.0` on Render (the Meta page's own curl uses v25.0), redeployed, and saved the webhook in Meta with the `messages` field.
- **[verified]** Before the first real message, from `.env.local` against Render: a webhook signed with the app secret got 200, one signed with a wrong secret got 403, and the verify token got the challenge back, so Render's secret and token matched the local ones.
- **[verified]** The first real texts got no reply and Neon showed no inbound row: Meta's Graph API listed the test WhatsApp account as subscribed only to Meta's own sample app ("WA DevX Webhook Events 1P App"), not to "Backfill Test". Meta's Test button still worked (the app logged `whatsapp.send_failed` status 400, since Meta's sample sender is a fake number), because that button calls the callback URL directly.
- **[verified]** With the user's yes ("Yes, subscribe it"), Claude ran `POST /<account id>/subscribed_apps` with the user's token, which returned `{"success":true}`; a read-back listed "Backfill Test" beside Meta's sample app.
- **[user-reported]** The user then linked their phone with a code from the merchant page, sent "make it 20% off" and `YES` from their phone, and got "Done. Singapore Test Restaurant's offer is updated and buyers see the new terms now (terms version 2)."
- **[verified]** Neon, read-only: the rule is 20% off (2000 bps), capacity 20, minimum pool 8, 4 per agent, terms version 2; one link; one `owner_changes` row, verdict `ok`, outcome `applied` at 2026-10-30 16:43 UTC; 4 inbound ids (Meta's Test and the user's messages).
- **[verified]** Exit, with `npm run mcp:smoke` as `smoke-s5` against https://backfill-9d0x.onrender.com, no covers: Singapore Test Restaurant is listed at S$7.00 and offered at S$5.60 (20% off), terms version 2, and the output has no "floor" or "capacity"; a run a minute earlier, before the YES, showed S$5.25 and version 1.
So one message from the owner's phone changed a live offer on Render, and a buyer agent sees the new price and not the floor.
- **[verified]** `main` is at `1e9b012`, which adds two log lines to the webhook (`whatsapp.received` with the message count, `whatsapp.rejected` with the reason, never a body, number or signature); CI passed on it, and the user redeployed Render.

Found while doing it:
- A new WhatsApp test account is not subscribed to your own app. The Meta UI's webhook screen alone did not do it; `POST /<account id>/subscribed_apps` did. A setup note for anyone repeating this.
- Render shows only the app's own log lines, not HTTP requests, so before the log lines a refused or missing webhook call left no trace.

Not done:
- **[unknown]** Whether the temporary Meta access token (24 hours) will be replaced before the demo; a replies-never-arrive symptom after a day is most likely an expired token, which shows as `whatsapp.send_failed` with status 401.
- The Graph API version is now v25.0 on Render, matching Meta's page; the code's default is still `v23.0`.
- A message sent by the owner while buyers hold a pending commitment on the offer is refused, as designed; not exercised live.
- Real messages from any number but the user's one linked phone, and a second merchant, were not tried.

### S6 and S6b review, 2026-10-31

Branch: `backfill/slice-6-review-fixes`, cut from `main` at `cc35e0b`.

Authorizations, in the user's words:
- 2026-10-31, asking for the review: "review S6 and S6b, then start S7", then, after a first pass, "Keep reviewing first".
- 2026-10-31, on the verdict: "Fix F1 and F4".

Review verdict: ISSUES FOUND, no blockers.
The review read the S6 and S6b code, migrations and tests, and ran tests on a local PostgreSQL 18; no Neon access, no Meta call, no push.
It reproduced 320 passing tests at `cc35e0b`.
Fixed:
1. **Medium: `apply_owner_change` did not check that the rule belongs to the merchant.**
It checked only the merchant on the change row, and no foreign key ties that row's rule to its merchant, while the runtime role may insert change rows.
Reproduced as a `backfill_app` login on a scratch database: a change filed under merchant A with merchant B's rule id, applied as A, moved B's discount from 2500 to 6000 bps.
The WhatsApp code always files the merchant's own rule, so this is the SQL re-check failing, not a path a phone can reach.
Fix: migration `0012_s6_review_owner_change_rule` (custom, by `drizzle-kit generate --custom`) replaces the function so it also requires the rule's own merchant, as `apply_wonder_plan` already did.
2. **Medium: an occurrence was cleared only when a buyer asked for its status after the deadline.**
So a commitment no buyer asked about stayed pending for ever: its sellout never showed on the dashboard, Wonder never planned it, and every plan and WhatsApp change on its rule was refused as pending, even after the visit date.
This was worse than the recorded limit "no plan or change while a commitment is pending".
Reproduced with tests that failed before the fix: 4 covers committed by two agents with no status call, and at the deadline the dashboard showed no occurrence; a plan and a WhatsApp `YES` were refused as pending after the deadline had passed.
Fix: `settleDue` in `src/lib/commitments/service.ts` clears every occurrence of the merchant's rules with a live commitment, no clearing and a deadline already passed; the dashboard (and so `replanSoldOut`), `applyPlan` and the WhatsApp `YES` call it first.

Not fixed, by the user's choice:
- Any message between a proposal and `YES` makes the newest proposal one that did not count, so the `YES` gets "Nothing is waiting", and the message uses one of the day's 30 model calls.
- Link codes have no guess limit; about 6.6 x 10^11 codes over 10 minutes, and Meta's sandbox accepts only the recipients added, so not needed before the demo; needed before real use.
- The S6 record says Spark reads "one read at a time per merchant"; the advisory lock is global, so one merchant's read makes every other merchant's answer `busy`.

Checked and found as recorded: no prompt to Spark or Wonder and no WhatsApp reply to an unlinked number carries the floor; `apply_wonder_plan` refuses what `judgePlan` refuses except an unchanged plan; the floor arithmetic rounds down the same way in SQL and TypeScript; PUBLIC has no EXECUTE on the S6 and S6b functions; the append-only triggers are tested under `session_replication_role = replica`.

Evidence:
- **[verified]** At `6eb384b`: typecheck and lint clean, 324 tests pass (28 files) with `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres`, `git diff --check` clean.
- **[verified]** New tests: the cross-merchant change refused in SQL with the other rule untouched; the dashboard settling and showing a sellout at 12:00:00 and not at 11:59:59, then planning and applying it; `applyPlan` refused as pending before the deadline and applied at it; a WhatsApp `YES` applying after settling a past Tuesday's commitment.
Each failed on an AssertionError before its fix.
- **[verified]** Mutations in [evidence/s6-review-fixes](evidence/s6-review-fixes/README.md), at `f1e5df4`: all 6 killed on an AssertionError, each file restored byte-identical and each rerun green.
- **[unknown]** The S6 and S6b mutation sets were not rerun on the fixed tree.
- **[unknown]** The S6b mutation runner baseline failure was not retried.
- 2026-10-31, to push and migrate: "Push, then Neon".
- **[verified]** Branch pushed to `origin/backfill/slice-6-review-fixes`.
- **[verified]** Migration `0012` applied on Neon with `npm run db:migrate`: a read-only read before showed 12 migrations and `apply_owner_change` without the rule's merchant check; after, 13 migrations and the check present, `backfill_app` still with EXECUTE and PUBLIC without; rules (Demo Kopitiam 2500 bps v1, Singapore Test Restaurant 2000 bps v2, both capacity 20), 2 live commitments, 0 clearings and 1 owner change unchanged.
- Once `settleDue` is deployed, the first merchant page view for Demo Kopitiam after 2026-11-03's deadline clears that occurrence and its 2 S4 commitments, as a buyer's status call would have.
- Not done: `main` and Render; each waits for the user's yes.

### S7 buyer sim and live demo screen, 2026-10-31 to 2026-11-01

Branch: `backfill/slice-7-demo`, cut from `main` at `0e7e091`; `backfill/slice-6-review-fixes` (one status-only commit, `262edbd`) was not brought in.

Decisions, taken before coding, in the user's words on 2026-10-31:
- Scene: "Backfill Demo Cafe instea, no synthetic label. One new merchant on Neon ... Each run resets its rule so the deadline is a few minutes ahead, then the pool clears live on Render. Real rows untouched".
This re-steers the cut-order note that synthetic merchants carry a test name.
- Muse commitment: "Show it read-only beside the scene (Recommended)"; it stays in the Demo Kopitiam pool and the screen says so.
- Tokens: "Mint once into .env.local (Recommended)". Spend cap: "US$5 hard cap". Wonder: "Record once, replay (Recommended)".
- Taken by Claude: SSE polls Postgres once a second, since writes come from Render and from the scene command; recordings are JSON in `sim/buyers/recordings/`.
- A rule cannot be reset for a second run on the same day, because a cleared occurrence and its Wonder plan are kept once per rule and date.
So each run adds a new rule and retires the merchant's older ones by raising their hidden floor to the list price, which hides them from `list_offers` without moving a terms version.
- The scene shows Wonder's plan but does not apply it: the merchant applies a plan, as in S6.

Authorizations, in the user's words, 2026-10-31: "1. Fast-forward and push main", "2. Neon writes", "3. Live record run, US$5 cap", "4. Replay run as the exit"; then "Deployed, it shows Live" for the Render redeploy.
2026-11-01, after the user wrote "Screw the timing i just want to finish this slice" and the timing blocker below was reported: they chose "Afternoon run, you start it" (the record run is the user's to start on 2026-11-01) and "1 probe call (~US$0.005)".

Built:
- `src/domain/demo/scene.ts`: the scene window (today in Singapore, deadline the first whole minute at least the lead away, refused past midnight) and solo vs pooled through the same `clear()`.
- `sim/buyers`: 20 intents, a Muse Spark buyer decision, `npm run sim:mint`, and `npm run demo:scene -- <base-url> record|replay [recording]`, which talks to the MCP server with each buyer's own token, 4 at a time.
- `src/lib/demo/snapshot.ts`, `src/lib/demo/sse.ts`, `/api/demo/stream` and `/demo`: the live screen, read only, with no floor and capacity only after a sellout.

Evidence:
- **[verified]** Typecheck and lint clean; 334 tests pass with `TEST_DATABASE_URL`; `git diff --check` clean.
- **[verified]** Mutations in [evidence/s7-demo](evidence/s7-demo/README.md): 15 of 15 killed on the second run, one survivor fixed after the first.
- **[verified]** CI run 41180996552 on `4e69dc1` passed.
- **[verified]** A local replay run against `next dev` on a scratch database showed the screen live: 0 of 16 alone, pooled 38 covers, 16 filled and sold out, the plan card and the Muse card; no horizontal scroll at 375 px.
- **[verified]** `main` fast-forwarded from `0e7e091` to `4e69dc1` and pushed; after the user's redeploy, Render answered `/demo` with 200.
- **[verified]** Neon read only before: 13 migrations, 2 merchants, 2 rules, 2 live commitments, 0 clearings, 0 plans, no sim agents; 20 sim agents minted after.
- **[verified]** First live record run on Render at 22:36 Singapore time, billed US$0.087038: the window was 22:40-23:40, so 12 buyers correctly declined a late-night slot, 1 committed 3 covers, and the pool stayed locked.
7 buyers had no reply, with the cause not kept; the recording was not committed.
- **[verified]** Neon read only after: merchant Backfill Demo Cafe, one more rule, one more commitment (`sim-buyer-17`), one locked clearing, 0 plans.
- Fix since: the recording keeps each failure's name and first line, and buyers may use 2048 output tokens.
- **[verified]** `b6e49e0` touched only `sim/buyers/{buyer,scene}.ts` and `tests/integration/s7-demo.test.ts`, so Render on `4e69dc1` already serves the current `/demo` and no redeploy is needed for a record or replay run.

2026-11-01, just after midnight:
- **[verified]** No scene run can start after about 22:55 Singapore. `sceneWindow` refuses when the 60-minute window would cross midnight ([src/domain/demo/scene.ts:25](../../../src/domain/demo/scene.ts)), so `prepareScene` throws "too late in the Singapore day". Ran directly against six clocks: 22:56 record fits (commitBy 1380, end 1440); at 23:09 both the record lead and the replay lead return null.
- **[verified]** A night run cannot produce the sellout, so it cannot meet build-plan's S7 exit: `replanSoldOut` plans only occurrences where `soldOut` ([src/lib/onboarding/service.ts:188](../../../src/lib/onboarding/service.ts)), and `soldOut` needs `filledCovers >= capacityCovers` = 16. The one night data point is 1 buyer and 3 covers. Reported to the user before acting; they chose the afternoon run.
- **[verified]** One Muse Spark probe call, billed US$0.006844: 1 attempt, HTTP 200, 1502 output tokens, 7.3 s, reply `{"covers":2,"reason":"Kopi kaya toast for two after 2pm matches, Tanjong Pagar is adjacent to Tiong Bahru."}`. The key works and headroom remains: US$4.906 of the US$5 cap. Throwaway script under `src/`, deleted after; no Neon write, no MCP call.
- **[hypothesis, backed by that measurement]** The 7 `no_reply` calls were truncation at the 1024 output token limit then in force: one buyer decision needs 1502 output tokens, so the reply never reached the JSON, `validate` saw an empty reply, the retry prompt grew, and after 3 attempts the provider threw `LlmError`, which `sparkBuyer` records as a null reply. The 22:36 calls' own error text was never kept, since `run.ts` records model calls into an in-memory array and not into `llm_calls`, so those specific failures cannot be proved directly.
- Taken by Claude: the record lead went from 4 to 10 minutes and the replay lead from 2 to 5 ([sim/buyers/run.ts:64](../../../sim/buyers/run.ts)). A failing buyer call can burn three 60 s attempts plus backoff at concurrency 4, and a submit after `commitBy` is refused, which would cost covers and could lose the sellout. No test binds either lead; 334 tests, typecheck, lint and `git diff --check` are clean after the change.
- **[verified]** Neon read only at 00:03 Singapore, throwaway script under `src/` deleted after: 13 migrations, 3 merchants, 3 rules, 3 commitments, 1 clearing (locked, 0 fills), 0 plans, 0 applications, 20 `sim-buyer-*` agents, 1 `muse-user`. Backfill Demo Cafe holds its Saturday 22:40-23:40 rule (floor still 500, not retired) and sim-buyer-17's 3 covers; the `muse-user` commitment `34e1cb93-a6cc-41f8-8869-4e458b6f90c8` is still 2 covers pending in the Demo Kopitiam pool for 2026-11-03, and Singapore Test Restaurant is untouched.
- **[verified]** Render answered `/demo` with 200 at 00:12 Singapore, in 24.9 s: a cold start on the free tier. The run warms it first, or the first MCP calls stall on it.

The run, 2026-11-01:
- **[verified]** Render was cold before the run: `/demo` answered 200 in 45.1 s on the first warm-up curl and 0.45 s on the second.
- **[verified]** Read-only Neon before, at 13:57, with a throwaway script under `src/` deleted after: 13 migrations, 3 merchants, 3 rules, 3 commitments, 1 clearing (locked, 0 fills), 0 plans, 0 applications, 20 sim agents, 1 muse-user.
- **[verified]** Live record run, started 13:58:34 Singapore, `npm run demo:scene -- https://backfill-9d0x.onrender.com record`, exit 0 after about 9 minutes, billed US$0.087824: scene rule `b99be92a-53a6-499a-9b44-c838c2789cc4` for 2026-11-01, window 14:07-15:07. All 20 buyers got a model reply with no error, so the 2048 output limit held where the 1024 limit had failed. 11 committed 30 covers and 9 declined, each reason naming the misfit (drink, MRT station, weekday, 8pm dinner, two hours, 10am Sunday, after 3pm, after midnight, vegan at noon). Solo: 0 of 11 unlock alone. Pooled: 30 covers of a minimum 8, unlocked, 16 filled, sold out. Wonder planned `ok` in 8.7 s for US$0.02394: 20% to 15% off, capacity 16 to 24, pool 8 to 12, cap stays 4. Recording at [sim/buyers/recordings/scene.json](../../../sim/buyers/recordings/scene.json).
- **[verified]** Replay exit, started 14:08 on the same Render URL, `npm run demo:scene -- https://backfill-9d0x.onrender.com replay`, exit 0: scene rule `b80547e2-08d8-44f6-94f5-ffa395be9546`, window 14:13-15:13, the same 11 commitments and 30 covers, 0 of 11 alone, 16 filled and sold out, re-plan `planned` `ok` stored as `replay:muse-wonder-1.0`, and no model call: every buyer reply, reason and prompt came from the recording.
- **[verified]** `/demo` on Render after the replay, captured over CDP with the viewport set to 375x812 and 1280x900: [375 px](evidence/s7-demo/demo-375.png) and [1280 px](evidence/s7-demo/demo-1280.png). Both show "Each agent alone 0 of 11 unlock", "Pooled 30 covers ... Unlocked: 16 covers filled at S$5.44, sold out", the sold-out card with Wonder's next terms and rationale, and the Muse card "Real, not simulated" stating its pool is separate. Both had the Live indicator on, `scrollWidth === clientWidth` (no horizontal scroll), and no "floor" word and no "S$5.00" anywhere in the page text, the hidden floor.
- **[verified]** `/api/demo/stream` sent a full snapshot on connect (`retry: 2000`, `"phase":"cleared"`) with no floor and no capacity in the payload.
- **[verified]** Read-only Neon after, at 14:15, same script deleted after: 13 migrations, 3 merchants, 5 rules, 25 commitments, 3 clearings, 14 fills, 2 plans, 0 applications, 20 sim agents, 1 muse-user. Each new rule has 11 commitments, one clearing of 16 filled covers across 7 filled commitments, and one plan. Both earlier Backfill Demo Cafe rules now have floor = list price 680, which is how they left `list_offers`. Demo Kopitiam (2 commitments) and Singapore Test Restaurant are unchanged.
- **[verified]** Total live spend for S7: US$0.181706 (the 22:36 night run US$0.087038, the probe US$0.006844, this record run US$0.087824) of the US$5 cap; the replay made no billed call.
- **[verified]** 2026-11-01 was a Sunday, and the buyers said so: intent 8 declined with "Offer is Sunday afternoon but intent requires a weekday afternoon." and intent 11 with "Offer at 14:07-15:07 does not fit 10am-only requirement."
- **[verified]** CI run 41280146370 on `324bae0`, the commit carrying the recording and these records, passed. The commit after it changes only this section.

Known limits:
- Wonder's rationale is exactly 400 characters, the schema's `maxLength`, and the model stopped mid-word ("avoid over-"); the demo card shows it exactly as recorded. A later fix is a shorter bound or a description that asks for a finished sentence, with a fresh record run.
- The replay's window (14:13-15:13) is six minutes after the recording's (14:07-15:07); the recorded reasons quote the record's window, and `/demo` does not display reasons.
- The sim's model calls are kept in memory, not written to `llm_calls`; the cost evidence is the recording's `costNanoUsd` and the command's own printout.
- 2048 output tokens leaves about 35% of margin over the 1502 tokens one buyer decision used; a longer decision would still truncate into a null reply.
- Every run adds a rule and keeps its commitments and clearing for that date, append-only: two Backfill Demo Cafe rules from 2026-11-01 now sit retired at floor = list price.
- A scene run cannot start after about 22:55 Singapore, since the 60-minute window would cross midnight.
- `/demo` lists only the buyers who committed; the 9 who declined appear in the recording and the command's output, not on the page.

Not done:
- S8 ledger and checkout.


### S7 review fixes, 2026-11-01

Branch: `main`, starting at `328569b`.

Authorization, in the user's words:
- 2026-11-01: "continue the read-only review, treat the repo as authoritative for those two lines, and record them as a single **minor** finding (stale status) rather than stopping. fix both in one docs-only commit, and push to main".

Fixed:
1. **Minor: stale status for S7 on main.** The S7 status and handoff still listed the fast-forward and push as unfinished. Before this docs-only fix, `git rev-parse HEAD main origin/main backfill/slice-7-demo origin/backfill/slice-7-demo` returned `328569b30203d928dac429bc5046143d0fd908a0` for all five refs and `git status --short` was empty. Both documents now reflect that evidence. The S7 review remains in progress; no code fix, Neon write, Render change or model call is authorized by this entry.


Code-fix continuation: `backfill/slice-7-review-fixes`, from `main` at `c7965da`.

Further authorizations, in the user's words:
- 2026-11-01: "Fix f1-f6 first, then let me know once they're fixed".
- 2026-11-01, after the test-isolation incident was disclosed and the exact guarded correction was proposed: "Restore those two changes".

Review verdict delivered: ISSUES FOUND, no blocker established. F1-F6 were selected; F7, the unfinished rationale, was not selected. The earlier minor stale-main-status fix is the separate commit `c7965da` above.

Implementation:
- **F1:** Paid S7 recording now refuses before configuration, database setup, MCP or model requests. A verified provider-enforced spending allowance is not available; byte estimates are not treated as a hard cap. Replay remains available. Restoring paid recording is an open integration requirement, not an implied permission to spend.
- **F2:** Exclusive append-and-fsync partial journals retain started requests, attributed attempts, completed buyer decisions and Wonder proposals before later steps. Recorder failures are fatal through both S7 model adapters. Queued workers stop, already-started workers drain, and final JSON cannot overwrite an existing recording.
- **F3:** The frozen V1 recording is unchanged and hash-bound to its verified source. V2 records public source context; identity, intent and economics are checked before scene setup. Source and rehearsal windows are disclosed. The board labels simulated buyers and replayed Wonder output; missing provenance is unknown.
- **F4:** Due pools settle before floor retirement. Future pending commitments block retirement under rule locks. Submission takes the existing SECURITY DEFINER rule lock before reading availability, so both race orderings are covered without a migration.
- **F5:** Read errors mark the feed stale; a successful snapshot or recovery marks it Live. Socket-open alone does not. A hung read has no new timeout.
- **F6:** Direct Spark-adapter tests protect successful replies, saved errors and the 2048-token limit; fractional positive lead is tested separately.

**[verified]** Full suite: 386 tests in 38 files, typecheck, lint and git diff --check passed. The full-suite mutation proof in [evidence/s7-review-fixes](evidence/s7-review-fixes/README.md) killed all 75 faults on AssertionError, restored every file byte-identical and passed every restored rerun, with zero file errors. A scoped independent re-review passed the corrected recorder propagation, attempt attribution and both retirement orderings. A local browser showed Stale during failed reads and Live on recovery, with explicit replay labels. The fixes were local at that verification. Their later integration and S8 authorization are recorded below.

Incident record:
- An initial regression CLI child ran from the real checkout, loaded configuration and prepared a Neon scene before its loopback MCP connection failed. It inserted empty rule `d57a7e1d-0ce3-4bad-b4dd-30f5f36d8543` and raised rule `b80547e2-08d8-44f6-94f5-ffa395be9546` floor from 500 to 680. No model request occurred. This was an unauthorized write, disclosed to the user.
- With the user's exact correction approval above, one guarded transaction locked and checked both rows, deleted the empty new rule without CASCADE and restored the old floor only if its expected values still matched. Read-only counts went from rules 6 back to 5; commitments 25, clearings 3, fills 14, plans 2 and llm_calls 4 stayed unchanged. The restored floor is 500. Temporary scripts were deleted.
- The CLI regression now runs in an empty temporary directory with an explicit minimal environment. Mutation copies contain no .env.local. No further production write, model call or Render change is authorized.


### S7 integration and S8 authorization, 2026-11-01

The user authorized: "Yes. i authroize both fixes into main and push as well as S8 and produiction writes". In context, this names S7 F1-F6 integration and push, S8 implementation, and production writes within S8. It does not select F7 or authorize model calls, real payments, S9, or changes to the protected real Muse commitment and other merchants.

- **[verified]** A secret-free git archive of `7cdbb56d5cd2b3ad0bcfa3fbf6cefe200f25661c` passed 386 tests in 38 files, typecheck and lint. Tests used the explicit disposable local `TEST_DATABASE_URL`.
- **[verified]** `main` fast-forwarded from `c7965da` to `7cdbb56` and pushed. `git ls-remote origin refs/heads/main` confirmed that exact published tip. CI run 41290674332 completed successfully on that exact tip. No Render redeploy has occurred in this session.
- S8 starts on `backfill/slice-8-ledger-checkout` from `7cdbb56`. The approved build plan covers ledger splits, merchant totals, reconciliation and ACP-shaped checkout without real money or model calls. Migration `0013` is available; `0000` through `0012` remain frozen.
- The savings split percentages were not specified in the approved plan. The user has been asked to choose a policy before implementation of the split. Existing accepted prices cannot silently gain fees.

S8 design is recorded in [s8-plan.md](s8-plan.md). Two independent sketches and a separate judge compared transaction ownership, source binding and historical price evidence. The split policy remains pending; no S8 product code, migration, backfill, production write or deployment has occurred.

S8 split decision, 2026-11-01, in the user's words: "100% buyer, 0% agent, 0% network. Keep the split as explicit ledger fields (buyer/agent/network) so a fee policy can be added later for new commitments only. Do not apply fees to existing commitments." Implementation continues under this policy.


### S8 ledger and checkout, 2026-11-01

Branch: `backfill/slice-8-ledger-checkout`, from published S7 `7cdbb56`. Source and final assertion harness: `2dda7bc`; later commits record proof. The user authorized S8 and scoped production writes, and explicitly selected 100% buyer savings, zero agent/network fees, explicit share fields, and no future fee applied to existing commitments.

Built:
- Pure ledger constructor and merchant totals. The existing rule-locked clearing transaction writes fills and each ledger entry atomically, using per-fill negotiated prices.
- Migration 0013 source checks, zero-fee enforcement, deferred fill completeness, append-only simulated receipts and narrow runtime SELECT/INSERT grants. No old migration or snapshot changed.
- Bearer-owned ACP-shaped simulated create/read/complete endpoints. They refuse payment credentials, malformed requests and foreign IDs. Stored receipts and ledger prices survive current rule/deadline changes. The merchant dashboard shows authenticated totals and read-only historical reconciliation.
- A bounded evidence-pinned backfill function refuses drift, wrong identities, unapproved buyers and conflicting rows; its entire batch rolls back together. It has not run on Neon.

**[verified locally]** 417 tests in 41 files; typecheck, lint, diffcheck and a secret-free production build. A real local HTTP smoke as the runtime role returned 401/201/200/405, persisted one ledger and one receipt, kept the accepted 1876-cent total and 624-cent buyer savings, and recorded zero model attempts. Merchant server HTML was checked; browser interaction and hosted behavior were not.

**[verified locally]** All 88 guard faults in [evidence/s8-ledger](evidence/s8-ledger/README.md) have S8 AssertionError kills, byte-identical restores, green restored full-suite reruns and zero file errors. Initial diagnostic failures remain disclosed: unrestricted parallel suites exhausted local connections, and receipt promise/string matchers produced generic errors. A complete worker-limited rerun and six explicit receipt confirmations supply the accepted proof. Application bytes are identical across the proof stages.

Independent source review reported one P2: completed checkout could become pending after a changed deadline. Its regression failed on AssertionError, then passed after immutable ledger/receipt reads preceded mutable timing. No other actionable finding was reported; no second independent review of the fix or hosted acceptance is claimed.

**[verified read-only]** Neon preflight: 13 migrations, 3 merchants, 5 rules, 25 commitments, 3 clearings, 14 fills, zero ledger entries, 2 plans and 4 existing model-call rows. The two S7 scene rules each have 7 fills and 16 covers at 544 cents, list 680 cents, version 1. [Prepared source pins](evidence/s8-ledger/historical-sources.json) bind the recorded ownership/economics and allowed simulated buyers. Protected fingerprints are recorded. Expected after the unapplied backfill: 14 entries and 4352 cents buyer savings, zero other shares. No production write, model call, new live scene or redeploy occurred in S8.

Not done: S8 main merge/push, published-tip CI, Render rollout, migration 0013 on Neon, bounded historical backfill and hosted acceptance. Production-write authorization is already given. Main publication and Render changes still need named authorization. Migration 0013 requires the S8 writer; the old writer would fail its completeness guard. Coordinate rollout. Original Muse and other merchants remain outside the prepared writes. Paid S7 recording remains closed, F7 remains unselected and S9 is not authorized.

Continuation: [s8-handoff.md](s8-handoff.md).


### S8 publication and production rollout, 2026-11-01

The user selected the question "Authorize S8 merge/push and Render rollout?" and answered: "I authorize the merchant push and the vendor rollout, and afterwards let me know what I need to do." In that explicit annotation context, this authorizes S8 main integration/push and the Render rollout. S8 production migration and bounded historical backfill were already authorized. No model calls, real payments, S9 or protected-record changes are added to the scope.

Before publication, a fresh secret-free archive of `f492d28` passed 417 tests in 41 files, typecheck and lint, using the explicit disposable local TEST_DATABASE_URL and two Vitest workers. Production rollout verification is in progress.


### S8 production exit verified, 2026-11-01

**[verified]** S8 fast-forwarded to `main` and pushed at `94dd8ede54ab009b762897c5ccee64ed5d82ad25`. CI run 41302385552 passed. Render deploy `dep-dbji6tbbc2fs73dfovs0` was confirmed Live at that application commit. Correction: Auto-Deploy was enabled and had also deployed S7 `7cdbb56`; the earlier manual-deploy/pending assumption was stale. No duplicate manual deployment or configuration change was needed.

**[verified]** After fresh read-only pins, migration 0013 applied as the sole pending migration. The count is 14. Source/completeness/append-only guards are ALWAYS; runtime ledger/receipt grants are SELECT/INSERT only. Old SQL migration hashes matched, and no snapshot was read or changed. The bounded backfill inserted exactly 14 historical entries: Demo Cafe buyer savings 4352 cents, zero agent/network shares, totals reconciled. All protected fingerprints matched.

**[verified]** Hosted checkout used one separately labelled simulated S8 verification merchant and an operator-seeded earlier test clock. Valid bearer create returned 201 and exercised the deployed runtime's clearing/ledger transaction. Three simultaneous complete requests returned 200 with one identical receipt; retrieval 200, foreign/missing 404, absent/revoked token 401. Only its new test agent was revoked and only its new rule retired from discovery afterward. The audit fixture is retained and is not a real booking or a new S7 recording.

Final global state: 4 merchants, 6 rules, 24 agents, 26 commitments, 4 clearings, 15 fills, 15 unique matching ledger entries, 1 simulated receipt, 2 plans and 4 existing model-call rows. Zero missing, orphan or mismatched ledger entries. All four ledger CHECK constraints validate. The extra test fixture contributes 624 cents simulated savings; global buyer savings are 4976 cents, while historical Demo Cafe savings remain 4352 cents. No real payment or new model call occurred. Original protected fingerprints and all 14 historical ledger rows are unchanged. The real Muse commitment remains two covers pending, not cancelled or cleared.

**[verified]** Health and demo HTTP 200. Browser public demo displayed Live, simulated buyers and recorded replay, with no private floor text. No authenticated merchant browser was mounted because its pre-existing auto-replan effect may invoke Wonder. Production evidence and public deployment screenshot: [evidence/s8-ledger/rollout](evidence/s8-ledger/rollout/README.md). Frozen recording/screenshots and migrations 0000 through 0012 remain unchanged.

S8 exit is met. No further deployment or production write is required for S8. The user may review the public demo, then decide whether to authorize S9 and its model-call/spending policy. S9, real payments and restoring paid S7 recording remain unauthorized. Current continuation: [s8-handoff.md](s8-handoff.md).


### S8.5 authorized and started, 2026-11-01

The user approved S8.5, S9.5 and the S9 exit change and requested S8.5 on its own slice branch. Branch `codex/slice-8.5-design-shell` starts at `95deb4d`. Existing README/pitch edits are preserved. The proposal was already untracked and is retained with the approval annotation.

Ruling: start S8.5 directly, following the explicit final instruction despite the unfilled mockup/start placeholder. Kopi is an original coffee-cup mascot selected under the user's delegated choice, reserved for S9.5.
Ruling: use the existing checkout with a dedicated branch; preserve dirty documentation. No publication, model call or production write is needed for this UI slice.

Implementation checklist:
- [x] Shell, semantic tokens, landing and system route.
- [x] Public demo ledger read, truthful timeline, pool visual, local replay, Wonder diff.
- [x] Tests, build, responsive/theme/reduced-motion verification and independent review.

### S8.5 local exit, 2026-11-01

Implemented on `codex/slice-8.5-design-shell`: Gloock/Manrope, semantic light/dark tokens, shared navigation, landing with stored Demo Cafe totals, tracer and aggregate model costs at `/system`, and a redesigned `/demo`. The demo includes alone/pooled tokens, bounded buyer details, Singapore event times, current-pool buyer savings, all-demo ledger splits, Wonder term differences and a separate Muse card. Client replay freezes the viewed snapshot and performs no write; reduced motion reveals stored results immediately. Initial database failure shows an unavailable state and reconnects through SSE.

The public ledger read is restricted to the same Demo Cafe selected by the existing scene. Snapshot queries use one read-only repeatable-read transaction. Reconciliation checks ledger rows against stored fills. No domain, clearing, checkout, migration or fee-policy change.

**[verified locally]** 418 tests in 41 files, typecheck, lint, diffcheck, secret-free production build, and 20 browser route/viewport/theme combinations passed. Browser checks include every popover, replay completion/return, reduced motion and no HTTP writes or page errors. One independent P2 popover finding was reproduced and fixed. Screenshots were visually inspected. Evidence: [HTML review](evidence/s85-ui/index.html), [verification details](evidence/s85-ui/README.md).

Ruling: `/evals` is a truthful empty route until S9 supplies results; no invented numbers. Omitted unsourced market/launch claims from the landing. The global feed status is shown on the demo where SSE is actually subscribed. Pet and merchant redesign remain S9.5.

Local exit met; visual acceptance by the user and hosted deployment are not claimed. No merge, push, deployment, production write or model call was performed. Existing README and pitch edits are unchanged. S9.5 is approved in the plan but not implemented here. S9's result contract is approved; its model-call/spending policy remains unselected.


### S8.5 publication authorized, 2026-11-01

The user requested: "Go ahead and push and deploy this branch to main and the readme and the page edits as well. Push them to main as well." This authorizes integrating the S8.5 branch and the existing README/pitch edits into main, pushing main and deploying the existing Render service. No model call, payment or database mutation is needed.

Preflight: origin/main and local main both at `95deb4d`; S8.5 at `98dc125`. The README/pitch edits narrow the merchant audience to restaurants and cafés. Fresh local verification passed 418 tests in 41 files, typecheck, lint and diffcheck. The application bytes had already passed the secret-free production build and browser suite. Render currently serves main with Auto-Deploy enabled. Publication and hosted verification are in progress.


### S8.5 published and hosted exit verified, 2026-11-01

S8.5 and the user-owned README/pitch edits fast-forwarded to main and were pushed at `b20bd164ec5996479a144c211786d1957c91afb7`. [CI 41315773866](https://github.com/jaydonnnk/backfill/actions/runs/41315773866) passed typecheck, lint, unit tests, integration tests and production build. Local preflight passed 418 tests.

Render Auto-Deploy `dep-dbjklmlg1s2s7382gasg` was confirmed `Deploy succeeded|Live` with source `b20bd16`. No duplicate manual deployment was triggered. [Hosted landing](https://backfill-9d0x.onrender.com/) and `/demo`, `/evals`, `/system` returned 200 with the new shared shell and expected content; health returned `{"ok":true,"db":"up"}`. One request during the rolling transition returned 502, followed by successful hosted checks.

Hosted browser verification showed Live feed, 0 of 11 unlocking alone, 30 pooled covers, 16 filled and sold out, recorded Wonder differences, current-pool buyer savings S$21.76, historical Demo Cafe buyer savings S$43.52 and reconciled totals. Client replay completed and returned to Live. The Muse card remained visibly separate. No authenticated merchant browser, tracer button, model call, migration or production data write was used for this verification.

S8.5 is published. Pet and merchant redesign remain S9.5; S9 evaluation results are still pending the separate model-call/spending decision. This final status update changes documentation only and is included in the authorized main push.

### Kopi site-wide design, local review ready, 2026-11-01

The user approved the animated HTML landing mockup and requested: "implement a site wide change according to this design ... let me see the final results ... before we start slice 9". Implementation is local on `codex/kopi-site-design`. This advances the visual companion from the earlier S9.5 deferral; it does not start S9 or authorize publication/model spending.

- Silkscreen headings and IBM Plex Mono supporting text; existing light/dark colours retained. Shared pixel cup mark, landing composition and animated scanline Kopi.
- Shared route-aware, dismissible companion with persisted preference. Demo guidance distinguishes connecting/stale/replay/open/cleared/sold-out states; merchant pending messages restore the underlying guidance after completion.
- Existing demo, evals, diagnostics, merchant entry, dashboard and draft review restyled. Merchant summary and onboarding steps use existing data. Forms, server actions, domain rules, migrations and financial policies unchanged.
- Verified locally: 425 tests in 42 files, typecheck, lint, diffcheck and a secret-free production build with webpack. Fourteen route/viewport checks at 375/1280, no horizontal overflow; local replay/return, comparison, all 11 mobile buyer popovers, persistent dismissal and local merchant validation/publication checked. No browser console errors in the captured session.
- Independent review found one temporary-message ownership defect; fixed with owner-keyed messages and a regression test, then narrowly re-reviewed without further findings.
- Dark-mode and reduced-motion CSS are preserved, but this browser interface did not expose preference emulation, so new runtime verification of those preferences is not claimed.
- Local verification published one synthetic offer in a disposable database; a fresh fixture replaced that database for review. Current review fixture: zero model calls, one unpublished menu draft. No production data writes or model calls.

Review at http://127.0.0.1:3190/; HTML screenshot gallery at http://127.0.0.1:3191/ and [evidence/kopi-ui/index.html](evidence/kopi-ui/index.html). Local merchant is signed in in the review browser. Preview copy: `/tmp/backfill-kopi-preview`. See [verification notes](evidence/kopi-ui/README.md). No commit, merge, push or deployment is claimed; visual acceptance remains with the user. S9 is unstarted.


### Kopi design accepted and main publication authorized, 2026-11-01

The user accepted the local site: "Alright looks good" and explicitly requested committing the working tree, pushing it to main, and a copy-paste S9 continuation prompt preserving the design. This authorizes the main push and its existing Render auto-deploy side effect. No migration, production data write or model call is needed.

The S9 handoff is [s9-handoff.md](s9-handoff.md). Build-plan and redesign-proposal now explicitly point to the accepted pixel typography, original palette and shared scanline Kopi implementation; historical typography/pet deferral is superseded. S9 implementation has not started in this session, and model-call/spending policy remains a separate decision. Application and handoff committed at `f3553421125fa9cc9146de7daecde9dfa3ade3dc`, fast-forwarded into main and pushed. A remote ref read confirmed that exact main tip. Fresh pre-publication checks passed 425 tests in 42 files, typecheck, lint and diffcheck. The working tree was clean after publication. Push-triggered CI and Render auto-deployment are checked separately; no model call, migration or production data mutation occurred.

### S9 offline implementation, 2026-11-01

User authorized offline S9 implementation and local design review, preserving the approved Kopi design. Branch `backfill/slice-9-evaluations` starts from current main `745184b`. Model spending, production writes, push/deployment and payments remain separately gated.

Implemented a six-episode, eighteen-call maximum AgenticPay-style comparison with identical scenarios/seeds, deterministic buyers and existing three-round domain guards. OpenRouter adapter stores each attempt and uses reported charges, not price estimates. Strict JSON validation replays proposals and summaries; stored verification requires the complete exact run-scoped `llm_calls` set. Durable exclusive journals and final result files retain partial failure evidence. Paid CLI remains disabled; no environment file is loaded.

`/evals` now has empty/invalid/partial/failed/completed handling, paired metrics, call-cost chart and keyboard-inspectable episodes. Shared Kopi, pixel/mono fonts, palette and square controls are preserved. Development-only fixture is explicitly synthetic and production cannot load it through the preview query. No published manifest or measured result exists.

Verified locally: 442 tests in 45 files, typecheck, lint, secret-free webpack production build, desktop/mobile browser inspection and keyboard episode expansion. Independent review's four findings were fixed and the suite rerun. [HTML visual review](evidence/s9-ui/index.html); [verification notes](evidence/s9-ui/README.md). Dark/reduced-motion runtime emulation remains unverified.

Offline implementation is ready for local review. Full S9 exit remains pending the exact paid-run policy, activation/preflight, actual run and validated stored evidence. OpenRouter's read-only catalog lists seed support for Spark Open but not proprietary Spark 1.3; model selection was requested rather than silently substituted. No paid call, production write, payment, commit, push or deployment occurred. Protected records, frozen evidence, old migrations and savings policy were not changed.

### S9 model selection correction, 2026-11-01

The user selected exactly `meta/muse-spark-1.3` versus `deepseek/deepseek-v4.1-flash-1017` and prohibited rolling aliases. This selects models only; it does not authorize spending. Both models retain identical scenario seeds, but neither receives a provider `seed` parameter. `require_parameters` remains enabled symmetrically. The README and `/evals` methodology now distinguish scenario seeds from provider seeds.

The measured-run contract enforces the exact ordered model pair and records `providerSeed: null`. Tests inspect both serialized HTTP bodies for symmetry and absence of `seed`, and reject aliases before any attempt. Recheck exact catalog IDs and required capabilities at activation; availability of the selected DeepSeek snapshot has not yet been verified. Paid CLI remains disabled.

### S9 paid-run authorization and preflight stop, 2026-11-01

The user approved the explicitly annotated bounded run: `meta/muse-spark-1.3` versus `deepseek/deepseek-v4.1-flash-1017`, six episodes, at most eighteen calls, zero retries, identical scenario seeds with no provider seed, provider-enforced US$1 total cap and isolated evaluation storage. This approval does not authorize production writes, publication, push/deployment or real payments. Do not request this same spending approval again unless scope changes.

Read-only catalog preflight at 2026-11-01T15:43:34Z found both exact IDs and the required max_tokens, temperature and structured-output parameters. [Sanitized preflight evidence](evidence/s9-activation/catalog-preflight.json). No OpenRouter API credential is available in the process environment. `.env.local` was not read. Therefore the provider-enforced allowance cannot yet be verified and execution stopped before any paid call or evaluation-database creation. Zero paid attempts; the authorized run remains unused. A dedicated capped credential must be supplied through a local secret source before activation can continue.

S9 credential preflight update, 2026-11-01: the user explicitly authorized using credentials from `.env.local`, superseding the earlier prohibition for this scoped activation. Read only to obtain the OpenRouter credential; no key values were printed. Authenticated read-only `/api/v1/key` returned a US$3 non-resetting cap with US$2.997675666 remaining, no tighter budget, BYOK excluded, and `is_management_key=false`. This does not enforce the approved US$1 run cap. [Sanitized key preflight](evidence/s9-activation/key-preflight.json). No key settings changed and zero paid calls occurred. Execution remains stopped pending a provider-enforced allowance no greater than US$1. Spending authorization remains valid and unused.

### S9 authorized live attempt finished, 2026-11-02 Singapore time

After being told that the existing OpenRouter key had a US$3 non-resetting limit, the user instructed: "Bruh im teelling u its fine just go through with it". Execution proceeded with that existing key cap, retaining US$1 as an operational run target with per-attempt checks and US$0.05 headroom. This supersedes requiring a provider-enforced US$1 cap; it is not evidence that the provider enforced US$1. No scope for production writes, push/deployment or real payments was added.

Activation rechecked exact model availability/capabilities and key limits before creating isolated local database `backfill_s9_authorized_20261101_01`. The fixed run `s9-20261101-authorized-01` exclusively consumed its marker. Its source SHA256 and input policy are pinned in [activation evidence](evidence/s9-activation/s9-20261101-authorized-01.consumed.json). Calls never sent provider seeds. Test verification passed 447 tests in 46 files, typecheck and lint; the secret-free result preview build passed.

The run made thirteen paid calls, zero retries, completing all six episode records. Final status is **failed**. Muse Spark: all three episodes failed response validation, zero deals. DeepSeek: one deal, one no-deal, one failed episode; S$2.20 synthetic-scenario buyer savings. These are actual model attempts on isolated synthetic scenarios, not production savings. No winner is justified.

Stored costs: Spark US$0.02072285; DeepSeek US$0.00248046; total **US$0.02320331**. The immediate account read lagged; later usage US$0.025527644 minus baseline US$0.002324334 reconciles exactly. [Stored call audit](evidence/s9-activation/stored-call-audit.json), [later account reading](evidence/s9-activation/key-followup.json), and `evals/results/s9-20261101-authorized-01.json` retain evidence. The isolated database has thirteen llm_calls, zero merchants and zero commitments; no production data was accessed or written.

All four failed replies had HTTP 200 and 1024–1065 reported output tokens. The adapter did not preserve finish reasons or malformed payloads, so truncation/output-budget exhaustion is only a hypothesis. Do not claim a diagnosed model-quality failure. Results, journal, call records and consumed marker are frozen. No retry or new live diagnostic is authorized by the original run.

Local measured review at http://127.0.0.1:3194/evals verifies against the isolated stored rows, clearly marks the failed run, withholds the chart, and preserves Kopi. Keyboard disclosure and 375px layout checked. Only the local preview copy selects this result; repository publication manifest remains absent. [Screenshot gallery](evidence/s9-ui/index.html). Offline implementation and the authorized attempt are complete; successful head-to-head evaluation/full S9 acceptance remain open. No commit, push, deployment or real payment occurred.

### S9 diagnosis and run 02, 2026-11-02

The user asked for an evidence-based diagnosis of run 01 and authorized up to US$10 for Muse and US$1 for DeepSeek.
**[verified]** Cause: reasoning exhausted the shared 1024-token output budget. This is a harness configuration issue, not a Spark capability failure.
Run 01 sent no reasoning effort, so Spark used its catalog default `medium` and DeepSeek its default `high`; production `sparkMerchant` sends `low`.
**[verified]** Probe `s9-20261102-diagnostic-01`, 8 calls, US$0.01886569: replaying the failed prompts unchanged gave 2 of 3 Spark replies with `finish_reason: "length"`, 1022 reasoning tokens and no content; with effort `low`, 4 of 4 were valid. [Probe evidence](evidence/s9-diagnosis/s9-20261102-diagnostic-01.json).
The adapter now journals generation ID, finish reason, reasoning tokens and failure class per attempt; validation is unchanged and run 01 artifacts are untouched.
**[verified]** Run `s9-20261102-authorized-02`, effort `low` for both: 18 of 18 calls valid, status complete. Outcomes identical per scenario (1 deal, S$2.20, 1 floor refusal each). Cost: Spark US$0.02138305, DeepSeek US$0.00186283.
Unit tests 276 passed, typecheck and lint clean. Not published to `/evals`; no commit, push, deployment or production write.
**[verified]** 2026-11-02, on the user's "Copy calls to Neon": run 02's 18 `llm_calls` rows were inserted into Neon in one transaction, as IDs 6-23, after a full in-transaction verification; nothing else in Neon was written. The published result file is re-keyed to the Neon IDs; the local-ID original and mapping are in [s9-neon-import](evidence/s9-neon-import/). A local server reading Neon showed `/evals` verified (9 of 9, S$2.20, calls #6-#23). `/evals` now tells the "Why Muse Spark" story with DeepSeek as a cost aside. Not committed, pushed or deployed.

### S9.5 final slice authorized, 2026-11-02

User authorization: "1. Start 9.5. 2. Absorb it" in response to starting S9.5 and absorbing S10. S9.5 now includes S10 hardening, five replay rehearsals, video preparation and submission text. Named authorization remains required for paid calls with a cap, production writes, Render changes, publication and live recording. The user retains visual acceptance, video approval/upload and submission.

Branch: `backfill/slice-9.5-pet-dashboard`, created from `origin/main` at `988ba592529818eeb38475e9e39f9f64a34c43a7`. Remote main was verified with `git ls-remote`. This supersedes the preceding S9 publication status: remote main includes `b2d98c4` and its collation fix. Render revision is [unknown] in this session.

Fresh baseline: typecheck, lint, 276 unit tests and 182 integration tests passed. Integration used the explicit disposable local PostgreSQL server. Production build and browser checks remain open. No model calls, production writes, push or deploy performed.

S9.5 checkpoint, still incomplete: demo event observation, a three-event animation queue, finite SVG props, `?kopi=off`, reduced-motion behavior and pointer/keyboard dragging with control avoidance are implemented locally. Merchant refinements and the absorbed S10 full workflow remain open.

Fresh checkpoint verification: typecheck/lint passed; 308 unit and 182 disposable-local integration tests passed; isolated webpack production build passed; all 8 Playwright tests passed on the final preview. Browser coverage includes demo/evals/signed-out merchant at 375/1280 in light/dark, no horizontal overflow or console errors on those routes, hiding preference, SSE buyer cue with normal/reduced motion, replay cancellation and mobile dragging/scroll/resize. Five client-only replay cycles per viewport/theme passed. These are NOT the five full S10 MCP/clearing replay rehearsals. The local fixture has zero llm_calls.

26 event/queue mutations and 10 placement mutations were killed by assertions, with byte-identical restoration and passing reruns. Remaining UI/handler guards are not all mutation-proven, so the every-guard condition stays open. No independent review or user visual acceptance is claimed. [Evidence and limitations](evidence/s95/README.md), [HTML gallery](evidence/s95/index.html), [continuation handoff](s95-handoff.md).

Preview: http://127.0.0.1:3195/demo from `/tmp/backfill-s95-preview`, with a disposable local database and dummy provider credentials. The generated merchant token exists only in that copy's .env.local. It has not been used for authenticated browser checks. Current changes remain uncommitted; no merge, push, deploy, model call, Neon write or Render change.

Deadline math re-derived with IANA `America/New_York` and `Asia/Singapore`: Nov 4 18:00 ET is Nov 5 07:00 SGT; Nov 4 21:00 ET is Nov 5 10:00 SGT. This verifies the conversion of the plan's deadline, not the hackathon site's current deadline.

### S9.5 local implementation and S10 preparation, 2026-11-02

Continuation authorization: the user said "Just continue with this" and supplied the S9.5 checkpoint context. The earlier "1. Start 9.5. 2. Absorb it" still defines the combined scope. No additional external authority was granted.

Local changes: finite Kopi event queue/props, context invalidation, replay/stale suppression, query hiding, reduced motion, pointer/keyboard dragging and collision avoidance; merchant offer chips, stored-record guidance, publication marker verification and draft-aware onboarding steps. Publication/refusal query strings alone no longer drive Kopi's claims. Independent review findings were fixed with regressions; final static re-review found no further concrete code blockers.

Fresh final checks: typecheck, lint, 318 unit tests, 182 disposable-local integration tests, isolated webpack production build, 18 Playwright tests and diffcheck passed. 54 targeted mutations failed under assertions with byte-identical restoration and passing reruns. Five full local HTTP MCP replay rehearsals passed with actual clocks; each filled 16 covers and reconciled S$21.76 buyer savings. Authenticated merchant Playwright flow uses an explicitly offline menu extraction, real publication/MCP/clearing, and reconciles four covers/S$6.00. Final local llm_calls count is zero.

[Evidence and limits](evidence/s95/README.md), [HTML gallery](evidence/s95/index.html), [submission draft](submission-draft.md), [three-minute storyboard](video-storyboard.md), [handoff](s95-handoff.md). Final review preview is http://127.0.0.1:3196/demo. No migration of production data, model call, merge, push, deploy or Render change. Protected evidence has no diff.

Full slice is not accepted: user visual approval, exhaustive defensive DOM guard mutation proof, hosted write E2E, fresh live-run allowance/authorization, video recording/upload and submission remain open. Broader receipt-stamp/richer idle behavior is not implemented. S9.5 local implementation is marked complete separately from these remaining gates; no blanket full-slice completion is claimed.
