# Build plan: Backfill

Window: 2026-10-26 to 2026-11-04, submission due 9:00 PM ET on Nov 4.
Stack: [../../tech-stack.md](../../tech-stack.md).
Labels follow envoi: **[verified]**, **[vendor claim]**, **[hypothesis]**, **[unknown]**.

## Goal

One live, rehearsed path that a judge can click:

1. A real merchant uploads a menu photo and sets a rule: "25% off Tue 2-5pm if 8 covers commit by noon, hidden floor X".
2. 20 buyer agents submit commitments through the MCP server.
3. Solo, no agent unlocks the rule; pooled, the rule clears.
4. The ledger shows each savings split, and the demo screen shows solo vs pooled side by side.
5. The eval chart shows deal rate, savings and cost per deal for Muse Spark vs DeepSeek.

## Judging map

| Criterion | Weight | What proves it |
|---|---|---|
| Impact | 30% | Real merchant, off-peak fill rate before vs after |
| Use of Meta AI tooling | 25% | Wonder merchant agent, Spark vision onboarding, Spark negotiation and buyers, eval chart |
| Technical depth | 20% | Pure clearing engine, limits in code, signed counter-offers, append-only ledger, tests |
| Demo | 25% | Live Render URL plus a 3-minute video |

## Day 0 checks (today, before S1)

- Confirm the model ID strings for Muse Spark and Muse Wonder in the Meta docs. Done 2026-10-27: `muse-spark-1.3` **[verified]** by the S1 live call, `muse-wonder-1.0` **[vendor claim]** from Meta's pricing page.
- Check DeepSeek's current OpenRouter price before topping up. **[unknown]**
- Confirm Muse Wonder's Responses API exposes memory across sessions to API callers. **[vendor claim]**
- Check whether the AgenticPay harness is public. If not, port its setup (private reservation prices, finite rounds). **[unknown]**
- Start asking 2-3 local merchants for permission to use their menu and a real off-peak rule.

## Slices

Each slice ends with its tests green and its exit check done.

### S1 - Tracer bullet (Oct 26)

- Next.js 16 app, Tailwind, ESLint, Vitest, GitHub Actions CI (lint, typecheck, test).
- Neon database, Drizzle, first migration.
- One `LLMProvider` call to Muse Spark through `https://api.meta.ai/v1`, logged to `llm_calls`.
- Deployed to a Render free web service, created by hand with env vars set in the dashboard.
- Exit: the Render URL shows one model reply and its logged cost.

### S2 - Schema and offers (Oct 27)

- Zod schemas in `src/domain`: `MerchantRule`, `Commitment`, `Offer`, `ClearingResult`, `LedgerEntry`.
- `src/domain/offers`: rule evaluation (time window, minimum covers, discount, hidden floor).
- DB tables for merchants, rules, commitments, ledger (append-only by constraint).
- Exit: unit tests cover window edges, the minimum-covers threshold and floor refusal.

### S3 - Clearing engine (Oct 27-28)

- `src/domain/clearing`: pool commitments per rule, match against the hidden floor, respect capacity, return partial fills.
- Pure functions, no I/O, deterministic for the same input.
- Exit: property tests show the engine never clears below the floor, above a buyer's max, or past capacity.

### S4 - MCP server and commitments (Oct 28-29)

- `src/app/mcp`: tools `list_offers`, `submit_commitment`, `get_commitment_status`, `cancel_commitment`.
- Commitments are binding until their deadline; idempotency key per agent.
- Exit: Claude or another MCP client submits a commitment against the Render URL.

### S5 - Negotiation (Oct 29-30)

- `src/domain/negotiation`: max 3 rounds, signed counter-offers (HMAC), refusal at round limit.
- Muse Spark proposes; the domain validates every proposal against both limits before it counts.
- Exit: tests show a model proposal outside the limits is rejected and never reaches the ledger.

### S6 - Merchant onboarding and Wonder agent (Oct 30-31)

- `src/domain/onboarding`: menu photo to `Offer` schema with Muse Spark vision, merchant confirms before publish.
- Muse Wonder merchant agent: remembers rules and fill history, re-plans when capacity sells out.
- `src/app/merchant`: upload, review, set rule.
- Exit: a real merchant's menu photo becomes a published offer with no hand edits beyond confirmation.

### S7 - Buyer sim and live demo screen (Oct 31-Nov 1)

- `sim/buyers`: 20 Muse Spark agents with varied intents, concurrency-limited, through the MCP server.
- Record mode saves every buyer request and model reply from a live run; replay mode re-sends them through the same MCP and clearing path with no model calls.
- `src/app/demo`: solo vs pooled side by side, live over SSE, plus one sellout case where the merchant agent re-plans.
- Exit: one command runs the full scene end to end on Render.

### S8 - Ledger and checkout (Nov 1)

- `src/domain/ledger`: savings split (buyer, agent, network), totals per merchant.
- ACP-shaped checkout endpoints in `src/app/api`, no real money.
- Exit: every cleared commitment has exactly one ledger entry and the totals reconcile.

### S9 - Evals (Nov 2)

- `evals/agenticpay`: Muse Spark vs DeepSeek (OpenRouter) on deal rate, savings and cost per deal.
- Cost comes from `llm_calls`, not estimates.
- Exit: one chart in `evals/results`, also shown on the demo screen.

### S10 - Harden, record, submit (Nov 3-4)

- Playwright E2E: onboard, commit, clear, ledger, on the Render URL.
- Rehearse the path 5 times in replay mode; fix every visual flaw seen.
- Run live (model calls) only for the final check and the video recording.
- Record the 3-minute video; write the submission text.
- Submit by Nov 4, 6:00 PM ET, leaving 3 hours of buffer.

## Models per slice

Runtime is what the product calls; coding is what opencode uses to build the slice.

| Slice | Runtime model | Coding model (opencode) |
|---|---|---|
| S1 Tracer bullet | Muse Spark (one test call) | Muse Spark |
| S2 Schema and offers | None | Muse Spark |
| S3 Clearing engine | None (pure code) | Muse Wonder |
| S4 MCP server | None | Muse Spark |
| S5 Negotiation | Muse Spark | Muse Wonder |
| S6 Onboarding and merchant agent | Muse Spark (vision), Muse Wonder (merchant agent) | Muse Spark |
| S7 Buyer sim and demo screen | Muse Spark (20 buyers) | Muse Spark |
| S8 Ledger and checkout | None | Muse Spark |
| S9 Evals | Muse Spark, DeepSeek (OpenRouter) | Muse Spark |
| S10 Harden and submit | Replay for rehearsals; all of the above for the final live run | Muse Wonder (debugging) |

## Cut order (if behind)

Cut from the top first:

1. Wonder memory across sessions (keep the re-plan on sellout).
2. ACP-shaped checkout (keep the ledger).
3. DeepSeek column in the eval (keep Spark's numbers alone).
4. Real merchant (fall back to clearly labelled synthetic merchants).

Never cut: clearing engine, limits in code, MCP server, solo vs pooled screen, live Render URL.

## Risks

| Risk | Falsifier | Fallback |
|---|---|---|
| Model IDs or hosting differ from the pasted research | Day 0 check fails | Swap the provider behind `LLMProvider` |
| Buyer sim burns Meta credits | Billing page shows over $100 spent before S10 | Rehearse only in replay mode; cut to 10 buyers for live runs |
| No merchant agrees | No yes by Oct 31 | Synthetic merchants, labelled as such |
| Wonder memory unavailable over API | Day 0 check fails | Store history in Postgres and pass it in context |
| Render free plan cold start or SSE drop in front of judges | E2E run on Render fails | Open the URL before each judging window, SSE reconnect with replay from the DB |
