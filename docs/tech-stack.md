# Backfill tech stack

Backfill is a clearing house where AI agents pool committed spend and small merchants sell spoiling off-peak capacity at private, commitment-gated discounts.

Layout follows `~/Desktop/envoi`: one Next.js app with an MCP route, a pure `src/domain` layer, and vendor code isolated in `src/integrations`.

## Runtime

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (product), Python (evals only) | MCP SDK and ACP are most mature in TS |
| Node | 24.x (`.node-version`) | Same as envoi |
| App | Next.js 16 (App Router), React 19, Tailwind 4 | One deployable for UI, API and MCP |
| Schema | Zod 4: merchant rule, commitment, offer, clearing result | One source of truth, also validates model output |
| Domain | `src/domain/*`, pure TS, no I/O | Deterministic clearing; limits enforced in code, not prompts |
| MCP server | `@modelcontextprotocol/sdk`, streamable HTTP at `src/app/mcp` | Any agent (Muse Spark, Claude, ChatGPT) can submit commitments |
| Checkout | ACP-shaped endpoints in `src/app/api`, no real money | Protocol-compatible without a payments license |
| Live updates | Server-Sent Events | Clearing appears live in the demo |
| DB | Postgres on Neon, Drizzle ORM, append-only `ledger`, `llm_calls` (tokens, cost, latency) | Audit trail and cost-per-deal data |

## Models

| Role | Model | Access |
|---|---|---|
| Merchant agent (memory of rules and fill history, re-plans on sellout) | Muse Wonder | Meta Model API, Responses format |
| Vision onboarding (menu photo to offer schema) | Muse Spark | Meta Model API |
| Live negotiation | Muse Spark | Meta Model API |
| Simulated buyer agents (20) | Muse Spark | Meta Model API |
| Eval baseline only | DeepSeek | OpenRouter, paid by the user |

- Base URL `https://api.meta.ai/v1` is OpenAI-compatible; so is OpenRouter.
- No non-Meta model runs in the live product; DeepSeek appears only in the S9 eval.
- One `LLMProvider` interface in `src/integrations`, JSON-schema structured output, Zod validation, retry on invalid output.
- Model IDs are **[unknown]** until checked in the Meta docs.

## Evals, sim, tests

| Area | Choice |
|---|---|
| Evals (`evals/`) | Python with `uv`, AgenticPay harness or a port; Muse Spark vs DeepSeek on deal rate, savings, cost per deal |
| Buyer sim (`sim/`) | Script driving 20 Muse Spark agents with varied intents, concurrency-limited; records each live run and replays it with no model calls |
| Tests | Vitest (unit, integration), Playwright E2E: onboard, commit, clear, ledger |
| CI | GitHub Actions: lint, typecheck, test |
| Dev | Muse Code, ESLint |

## Deploy

| Piece | Choice |
|---|---|
| App | Render web service, free plan, created and configured by hand in the dashboard (sleeps when idle; warm it before judging) |
| DB | Neon, region next to the Render service |
| Config | Env vars entered by hand in the Render dashboard; no `render.yaml` |

## Out of scope

- Real payments.
- Auth beyond a demo merchant login.
- More than one vertical (local food and drink).
