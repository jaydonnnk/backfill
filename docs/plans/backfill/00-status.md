# Status: Backfill

Updated: 2026-10-28.

- Tech stack: approved by the user on 2026-10-26; see [../../tech-stack.md](../../tech-stack.md).
- Build plan: drafted 2026-10-26 in [build-plan.md](build-plan.md); approved by the user on 2026-10-28, with the Singapore steer, in their words: "Yes, approved".
- Singapore steer: 2026-10-28, after Muse launched in Singapore.
In the user's words: "update the pitch, tech stack and build plan for the Singapore steer: path A plus B, with E as a stretch. Add the Muse custom connector Day 0 check."
Pitch in [../../pitch.md](../../pitch.md); S2, S4 and S7 changed, S6b (WhatsApp) added as a stretch.
- Day 0 checks: model IDs done in S1 (below); the Muse custom connector check and the others not started.
- Slices: S1 done 2026-10-27, reviewed and fixed 2026-10-28; S2 done 2026-10-28 (below).

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
- **[unknown]** The `hermetic-env` mutation is killed only in a shell that exports the app's configuration, as this one does; in CI it would survive.
- **[unknown]** S2's migration on Neon: not applied; it needs the user's named go-ahead.
- Known limit: a table owner can still `ALTER TABLE ledger DISABLE TRIGGER`; no app code does, and the app should not connect as the owner once S4 adds a runtime role.
