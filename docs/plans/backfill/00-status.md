# Status: Backfill

Updated: 2026-10-27.

- Tech stack: approved by the user on 2026-10-26; see [../../tech-stack.md](../../tech-stack.md).
- Build plan: drafted 2026-10-26 in [build-plan.md](build-plan.md), awaiting the user's approval.
- Day 0 checks: model IDs done in S1 (below); the others not started.
- Slices: S1 built on `backfill/slice-1-tracer`, awaiting push, CI and the Render exit check.

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
- **[unknown]** Render redeploy and the exit check (the Render URL shows one reply and its cost).
- **[vendor claim]** Prices in `src/integrations/meta/pricing.ts`, from Meta's pricing page, not reconciled against an invoice.
- **[hypothesis]** Reasoning tokens are inside `completion_tokens` and billed as output.
- Known limit: the cooldown check and the call are not locked together, so two presses in the same instant can both pass.
The daily cap still bounds spend.
