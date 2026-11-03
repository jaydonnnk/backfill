# Backfill tech stack

Backfill is a clearing house where AI agents pool committed spend so small merchants can sell spoiling off-peak capacity at private, commitment-gated discounts.
Market: Singapore food and drink, from the 2026-10-28 steer (see [pitch.md](pitch.md)).

Layout follows `~/Desktop/envoi`, a pre-existing personal project of the author's that is not part of this event: one Next.js app with an MCP route, a pure `src/domain` layer, and vendor code isolated in `src/integrations`. Only `src/lib/entrypoint.ts` and `postcss.config.mjs` are carried over unchanged; all Backfill domain and application code was written during the hackathon.

## Runtime

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript | MCP SDK and ACP are most mature in TS |
| Node | 24.x (`.node-version`) | Same as envoi |
| App | Next.js 16 (App Router), React 19, Tailwind 4 | One deployable for UI, API and MCP |
| Schema | Zod 4: merchant rule, agent terms, commitment, offer, clearing result | One source of truth, also validates model output |
| Locale | `Asia/Singapore` time zone, SGD stored as integer cents | Off-peak windows and prices match the Singapore market |
| Domain | `src/domain/*`, pure TS, no I/O | Deterministic clearing; limits enforced in code, not prompts |
| MCP server | `@modelcontextprotocol/sdk`, streamable HTTP at `src/app/mcp` | Doubles as a Muse custom connector; any MCP client (Muse, Claude) can submit commitments |
| Checkout | ACP-shaped endpoints in `src/app/api`, no real money | Simulated checkout shape; no payment processing or ACP conformance claim |
| Live updates | Server-Sent Events | Clearing appears live in the demo |
| DB | Postgres on Neon, Drizzle ORM, append-only `ledger`, `llm_calls` (tokens, cost, latency) | Audit trail and cost-per-deal data |

## Models

| Role | Model | Access |
|---|---|---|
| Real buyer agent | Muse (Meta's consumer agent) | A Muse user adds Backfill as a custom MCP connector; **[unknown]** until the Day 0 check |
| Merchant agent (memory of rules and fill history, re-plans on sellout) | Muse Wonder | Meta Model API |
| Vision onboarding (menu photo to offer schema) | Muse Spark | Meta Model API |
| Live negotiation | Muse Spark | Meta Model API |
| Simulated buyer agents (20) | Muse Spark | Meta Model API |

- Base URL `https://api.meta.ai/v1` is OpenAI-compatible.
- Current application model calls go to Meta Model API. A separate, explicitly run diagnostic uses Muse Spark Open through Vercel AI Gateway; it is not wired into buyer agents yet. Historical OpenRouter evaluation rows remain audit history, not current product or Meta API evidence.
- One `LLMProvider` interface in `src/integrations`, JSON-schema structured output, Zod validation, retry on invalid output.
- Model IDs come from Meta's pricing page (https://dev.meta.ai/docs/pricing-rate-limits, read 2026-10-27): `muse-spark-1.3` and `muse-wonder-1.0`.
`muse-spark-1.3` is **[verified]** by the S1 live call on 2026-10-27; `muse-wonder-1.0` stays **[vendor claim]** until S6 calls it.
- Never a `-contributor` model: Meta trains on those prompts. `src/env.ts` refuses one at boot.
- Cost per call comes from the per-model price table in `src/integrations/meta/pricing.ts`, copied from that pricing page (**[vendor claim]**, not yet reconciled against a Meta invoice).

### Spark Open access diagnostic

`npm run gateway:example` runs the standalone `index.ts` using AI SDK `ai@7.0.162`, model `meta/muse-spark-open`, explicit low reasoning, bounded output and timeout, and no automatic client retries. It loads `AI_GATEWAY_API_KEY` through Node's local env-file support. The key stays in ignored `.env.local`; never print or commit it. This command makes an inference request and is not part of tests or app startup.

A successful HTTP 200 text response and subsequent credit-balance check are recorded in `docs/plans/backfill-proof/00-status.md`. Gateway access is verified; buyer integration and open-weight bonus partner verification remain pending. The current revised plan is `docs/plans/backfill-proof/build-proposal-2026-11-03.md`.

## Sim, tests

| Area | Choice |
|---|---|
| Buyer sim (`sim/`) | Script driving 20 Muse Spark agents with varied intents, concurrency-limited; records each live run and replays it with no model calls |
| Tests | Vitest (unit, integration), Playwright E2E: onboard, commit, clear, ledger |
| CI | GitHub Actions: lint, typecheck, test |
| Dev | Muse Code, ESLint |

## Deploy

| Piece | Choice |
|---|---|
| App | Render web service, free plan, created and configured by hand in the dashboard (sleeps when idle; warm it before judging) |
| DB | Neon, region next to the Render service; migrations run by hand with `npm run db:migrate`, never in the Render build |
| Config | Env vars entered by hand in the Render dashboard; no `render.yaml` |

## Stretch

| Piece | Choice |
|---|---|
| Merchant channel | WhatsApp Cloud API with Meta's test number; the owner sets or changes a rule by message and Muse Wonder updates the offer. Cut first if behind. |

## Out of scope

- Real payments.
- Auth beyond a demo merchant login.
- More than one vertical (local food and drink).
- More than one market (Singapore).
