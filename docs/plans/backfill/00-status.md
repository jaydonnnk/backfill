# Status: Backfill

Updated: 2026-10-30.

- Tech stack: approved by the user on 2026-10-26; see [../../tech-stack.md](../../tech-stack.md).
- Build plan: drafted 2026-10-26 in [build-plan.md](build-plan.md); approved by the user on 2026-10-28, with the Singapore steer, in their words: "Yes, approved".
- Singapore steer: 2026-10-28, after Muse launched in Singapore.
In the user's words: "update the pitch, tech stack and build plan for the Singapore steer: path A plus B, with E as a stretch. Add the Muse custom connector Day 0 check."
Pitch in [../../pitch.md](../../pitch.md); S2, S4 and S7 changed, S6b (WhatsApp) added as a stretch.
- Day 0 checks: model IDs done in S1 (below); the Muse custom connector check passed on 2026-10-29 (S4, below); the others not started.
- Slices: S1 done 2026-10-27, reviewed and fixed 2026-10-28; S2 done 2026-10-28 and merged to `main` at `dfd257c`; S3 done 2026-10-28, reviewed and fixed 2026-10-28 (below), merged to `main` at `97c1024`, migration `0003` on Neon; S4 done 2026-10-29 (below), on `main` at `ded7a05`, migrations `0004` and `0005` on Neon.

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
In progress.

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
