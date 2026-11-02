# Build plan: Backfill

Window: 2026-10-26 to 2026-11-04, submission due 9:00 PM ET on Nov 4.
Stack: [../../tech-stack.md](../../tech-stack.md).
Labels follow envoi: **[verified]**, **[vendor claim]**, **[hypothesis]**, **[unknown]**.
Pitch: [../../pitch.md](../../pitch.md).

## Singapore steer (2026-10-28)

Meta launched Muse, its consumer agent, in Singapore on 2026-10-28 with large partners only (Grab, Shopee, Lazada, Klook and others).
Backfill now targets Singapore food and drink: kopitiams, cafés and hawkers that have no way into Muse.
Two changes and one stretch follow:

- **Path A, small merchants into Muse:** the MCP server doubles as a Muse custom connector, so a real Muse user's agent can be a buyer.
- **Path B, terms instead of blocking:** retailers abroad block agents; Backfill merchants publish agent terms (window, discount, minimum pool, per-agent cap, hidden floor) that every commitment must accept.
- **Stretch E, WhatsApp merchant agent:** the owner sets or changes a rule by WhatsApp message. Only if S6 is done by Oct 31.

## Goal

One live, rehearsed path that a judge can click:

1. A real Singapore merchant uploads a menu photo and sets agent terms: "25% off Tue 2-5pm if 8 people commit by noon, hidden floor X", prices in SGD.
2. One real Muse user's agent (through the custom connector) and 20 Muse Spark buyer agents submit commitments through the MCP server.
3. Solo, no agent unlocks the rule; pooled, the rule clears.
4. The ledger shows each savings split, and the demo screen shows solo vs pooled side by side.
5. The eval chart shows deal rate, savings and cost per deal for Muse Spark vs DeepSeek.

## Judging map

| Criterion | Weight | What proves it |
|---|---|---|
| Impact | 30% | Real Singapore merchant left out of Muse's launch partners, off-peak fill rate before vs after |
| Use of Meta AI tooling | 25% | Real Muse as buyer via custom connector, Wonder merchant agent, Spark vision onboarding, Spark negotiation and buyers, eval chart |
| Technical depth | 20% | Pure clearing engine, limits in code, signed counter-offers, append-only ledger, tests |
| Demo | 25% | Live Render URL plus a 3-minute video |

## Day 0 checks (today, before S1)

- Confirm the model ID strings for Muse Spark and Muse Wonder in the Meta docs. Done 2026-10-27: `muse-spark-1.3` **[verified]** by the S1 live call, `muse-wonder-1.0` **[vendor claim]** from Meta's pricing page.
- Check DeepSeek's current OpenRouter price before topping up. **[unknown]**
- Confirm Muse Wonder's Responses API exposes memory across sessions to API callers. **[vendor claim]**
- Check whether the AgenticPay harness is public. If not, port its setup (private reservation prices, finite rounds). **[unknown]**
- Start asking 2-3 Singapore merchants (kopitiam, café, hawker stall) for permission to use their menu and a real off-peak rule.
- **Muse custom connector check.** **[unknown]** Secondary sources (Parallel, Zapier, CryptoBriefing) say Muse accepts custom MCP connectors; Meta's Singapore launch post does not mention them. In the user's own Singapore Muse account, answer:
  1. Can a custom connector be added today, in Singapore, without Meta's review?
  2. Which transport and auth does it need: streamable HTTP or SSE; none, bearer token or OAuth?
  3. Does Muse ask the user before each tool call, or only before purchases?
  4. Can it reach a public HTTPS URL on Render (test with a throwaway MCP server that has one `ping` tool)?
  Pass: Muse calls `ping` on Render and the call shows in the server log. Fail: S4's exit uses Claude as the MCP client, the 20 Spark buyers stand in for Muse users, and the pitch says "built to the Muse connector shape" instead of claiming a live Muse buyer.
- WhatsApp Cloud API test number (stretch E): confirm a test number and sandbox recipients work without business verification. **[vendor claim]**

## Slices

Each slice ends with its tests green and its exit check done.

### S1 - Tracer bullet (Oct 26) - done 2026-10-27

- Next.js 16 app, Tailwind, ESLint, Vitest, GitHub Actions CI (lint, typecheck, test).
- Neon database, Drizzle, first migration.
- One `LLMProvider` call to Muse Spark through `https://api.meta.ai/v1`, logged to `llm_calls`.
- Deployed to a Render free web service, created by hand with env vars set in the dashboard.
- Exit: the Render URL shows one model reply and its logged cost.

### S2 - Schema and offers (Oct 27) - done 2026-10-28

- Zod schemas in `src/domain`: `MerchantRule`, `AgentTerms`, `Commitment`, `Offer`, `ClearingResult`, `LedgerEntry`.
- `AgentTerms` (path B): window, discount, minimum pool, per-agent cap, hidden floor; a commitment must accept the terms version it was made against.
- Money in SGD integer cents; windows evaluated in `Asia/Singapore`.
- `src/domain/offers`: rule evaluation (time window, minimum covers, discount, hidden floor, per-agent cap).
- DB tables for merchants, rules, commitments, ledger (append-only by constraint).
- Exit: unit tests cover window edges in `Asia/Singapore`, the minimum-covers threshold, the per-agent cap, floor refusal, and refusal of a commitment against stale terms.

### S3 - Clearing engine (Oct 27-28) - done 2026-10-28

- `src/domain/clearing`: pool commitments per rule, match against the hidden floor, respect capacity, return partial fills.
- Pure functions, no I/O, deterministic for the same input.
- Exit: property tests show the engine never clears below the floor, above a buyer's max, or past capacity.

### S4 - MCP server and commitments (Oct 28-29) - done 2026-10-29

- `src/app/mcp`: tools `list_offers`, `get_agent_terms`, `submit_commitment`, `get_commitment_status`, `cancel_commitment`.
- Shaped as a Muse custom connector, using the transport and auth the Day 0 check found.
- Tool descriptions say plainly that a commitment is binding, so Muse's own confirmation step shows the user what they agree to.
- Commitments are binding until their deadline; idempotency key per agent.
- Exit: a real Muse account submits a commitment against the Render URL; if the Day 0 check failed, Claude does.

### S5 - Negotiation (Oct 29-30) - done 2026-10-30

- `src/domain/negotiation`: max 3 rounds, signed counter-offers (HMAC), refusal at round limit.
- Muse Spark proposes; the domain validates every proposal against both limits before it counts.
- Exit: tests show a model proposal outside the limits is rejected and never reaches the ledger.

### S6 - Merchant onboarding and Wonder agent (Oct 30-31) - done 2026-10-30

- `src/domain/onboarding`: menu photo to `Offer` schema with Muse Spark vision, merchant confirms before publish.
- Muse Wonder merchant agent: remembers rules and fill history, re-plans when capacity sells out.
- `src/app/merchant`: upload, review, set rule.
- Exit: a synthetic Singapore merchant's menu photo (re-steered by the user on 2026-10-30, see 00-status.md) becomes a published offer with no hand edits beyond confirmation.

### S6b - Stretch: WhatsApp merchant agent (Oct 31-Nov 1, only if S6 is done by Oct 31) - done 2026-10-30

- WhatsApp Cloud API webhook in `src/app/api/whatsapp`, Meta test number, sandbox recipients only.
- The owner sends "no discount this Tuesday" or "make it 20% off"; Muse Wonder turns it into an `AgentTerms` change, and the owner confirms by reply before it publishes.
- Exit: one message from the owner's phone changes a live offer on the Render URL.

### S7 - Buyer sim and live demo screen (Oct 31-Nov 1) - done 2026-11-01

- `sim/buyers`: 20 Muse Spark agents with varied Singapore intents (kopi and kaya toast after 2pm, a quiet desk near an MRT station), concurrency-limited, through the MCP server.
- Record mode saves every buyer request and model reply from a live run; replay mode re-sends them through the same MCP and clearing path with no model calls.
- `src/app/demo`: solo vs pooled side by side, live over SSE, plus one sellout case where the merchant agent re-plans.
The real Muse commitment from S4, if Day 0 passed, appears in the pool labelled as a real Muse user.
- Exit: one command runs the full scene end to end on Render.

### S8 - Ledger and checkout (Nov 1) - done 2026-11-01

- `src/domain/ledger`: savings split (buyer, agent, network), totals per merchant.
- ACP-shaped checkout endpoints in `src/app/api`, no real money.
- Exit: every filled commitment has exactly one ledger entry and the totals reconcile.

### S8.5 - Design shell (published and hosted-verified 2026-11-01)

- Semantic tokens, shared navigation, landing page, tracer moved to `/system`.
- `/demo`: alone/pooled visual, read-only ledger splits, Wonder diff, event timeline and client-only replay.
- Preserve provenance, hidden-floor privacy, stale-feed feedback and reduced motion.
- Exit: local dashboard verified at 375 and 1280 in light/dark; no model calls or production writes.

### S9 - Evals (Nov 2)

- Continuation and approved visual direction: [s9-handoff.md](s9-handoff.md). Use the current Silkscreen/IBM Plex Mono, existing palette and shared scanline Kopi design.

- `evals/agenticpay`: Muse Spark vs DeepSeek (OpenRouter) on deal rate, savings and cost per deal.
- Cost comes from `llm_calls`, not estimates.
- Same scenarios and seeds for both models; write `evals/results/<run-id>.json` with per-episode proposals, refusals, rounds, outcomes, savings, call IDs and costs, plus summary.
- Exit (approved 2026-11-01): `/evals` renders the run JSON and every displayed number traces to `llm_calls` rows. PNG is optional.
- Model-call/spending policy remains a separate decision.

### S9.5 - Pet and merchant dashboard (approved 2026-11-01)

The user subsequently advanced the visual companion and merchant overview/steps into the accepted pre-S9 Kopi site update. Reuse that implementation; expanded pet animation/props, dragging and a deterministic test switch remain unclaimed. See [s9-handoff.md](s9-handoff.md).

- Kopi, an original coffee-cup mascot: idle, nod, unlock, sold out, shield.
- Merchant KPI tiles, offer chips and onboarding stepper; event-driven pet with dismissal, reduced motion and deterministic test flag.

Local checkpoint, 2026-11-02:
- [x] Core pet/dashboard implementation and local verification. See [S9.5 evidence](evidence/s95/README.md).
- [x] Five full local MCP replay rehearsals and submission/video drafts.
- [ ] Visual acceptance, remaining defensive-guard proof, hosted E2E, fresh live run, recording/upload and submission. Full final slice is not complete.

### S10 - Harden, record, submit (Nov 3-4)

Absorbed into S9.5 on 2026-11-02 by the user: "1. Start 9.5. 2. Absorb it". The tasks below remain required; paid runs, production writes and publication retain their separate authorization gates.

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
| S6b WhatsApp merchant agent (stretch) | Muse Wonder | Muse Spark |
| S7 Buyer sim and demo screen | Muse Spark (20 buyers) | Muse Spark |
| S8 Ledger and checkout | None | Muse Spark |
| S9 Evals | Muse Spark, DeepSeek (OpenRouter) | Muse Spark |
| S10 Harden and submit | Replay for rehearsals; all of the above for the final live run | Muse Wonder (debugging) |

## Cut order (if behind)

Cut from the top first:

1. S6b WhatsApp merchant agent.
2. Wonder memory across sessions (keep the re-plan on sellout).
3. ACP-shaped checkout (keep the ledger).
4. DeepSeek column in the eval (keep Spark's numbers alone).
5. Real merchant (fall back to synthetic Singapore merchants whose names say they are tests, such as "Singapore Test Restaurant"). Taken in S6, 2026-10-30.

Never cut: clearing engine, agent terms and limits in code, MCP server, solo vs pooled screen, live Render URL.

## Risks

| Risk | Falsifier | Fallback |
|---|---|---|
| Model IDs or hosting differ from the pasted research | Day 0 check fails | Swap the provider behind `LLMProvider` |
| Buyer sim burns Meta credits | Billing page shows over $100 spent before S10 | Rehearse only in replay mode; cut to 10 buyers for live runs |
| No merchant agrees | No yes by Oct 31 | Synthetic Singapore merchants whose names say they are tests |
| Muse custom connectors unavailable in Singapore, gated by review, or unable to reach Render | Day 0 connector check fails | Claude as the MCP client in S4, 20 Spark buyers stand in for Muse users, pitch claims only the connector shape |
| Muse asks the user before every tool call and slows the live demo | Day 0 check, question 3 | Record the Muse commitment ahead of time and show it in the pool; keep the live part to the Spark buyers |
| Wonder memory unavailable over API | Day 0 check fails | Store history in Postgres and pass it in context |
| Render free plan cold start or SSE drop in front of judges | E2E run on Render fails | Open the URL before each judging window, SSE reconnect with replay from the DB |
