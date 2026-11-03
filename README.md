# Backfill

AI agents pool committed spend so small merchants can sell spoiling off-peak capacity at private, commitment-gated discounts.
Market: Singapore food and drink, the restaurants and cafés left out of Muse's launch partners.

Built for the Meta Global AI Developer Hackathon (Indie track, Build for Your World).

- Pitch: [docs/pitch.md](docs/pitch.md)
- Stack: [docs/tech-stack.md](docs/tech-stack.md)
- Plans: [docs/plans/backfill](docs/plans/backfill)

## Original contributions

Solo submission. Jaydon Kua is the sole author and the submitting participant.

Backfill's domain and application features were built during the hackathon window (2026-10-27 to 2026-11-04), with pre-existing scaffolding disclosed below. Git history starts 2026-10-27 08:33 SGT with a README only; the first application code lands the same day (S1 tracer bullet: Next.js app, `llm_calls` table, Muse Spark provider).

| Area | Built during the event |
|---|---|
| `src/domain` | Offer rules, hidden floors, conditional commitments, pooling and clearing, bounded negotiation with HMAC-signed counter-offers, savings ledger |
| `src/app` | Merchant onboarding, live demo board, MCP route, checkout and SSE endpoints |
| `src/integrations/meta` | Meta Model API provider (structured output, Zod re-validation, price-table gating, call logging), Muse Spark and Muse Wonder clients |
| `src/lib/mcp` | MCP server: offer listing, commitment submission and cancellation, negotiation, strict output filtering so hidden fields cannot leak |
| `sim/buyers` | 20 simulated buyer agents with record and replay |
| `tests/` | Unit, integration and e2e suites, hermetic test environment, disposable test databases |

**Pre-existing work, disclosed:** the project layout, build configuration and test scaffolding follow a separate personal project of the author's (`~/Desktop/envoi`), which is not part of this event and shares no domain logic. Two files are carried over unchanged — `src/lib/entrypoint.ts` (a 16-line module-entrypoint check) and `postcss.config.mjs`. Every other file that shares a path with that project was rewritten for Backfill.

**Simulated, not real:** the merchant is synthetic ("Backfill Demo Cafe" / "Singapore Test Restaurant"), the 20 buyer agents are simulated, the demo replay uses previously recorded buyer decisions and makes no model calls, and checkout is simulated — no money moves and no attendance is guaranteed.

## Layout

| Path | Holds |
|---|---|
| `src/app/merchant` | Merchant onboarding and rules UI |
| `src/app/demo` | Solo vs pooled demo screen |
| `src/app/api` | ACP-shaped checkout and SSE endpoints |
| `src/app/mcp` | MCP server for buyer agents |
| `src/domain/offers` | Merchant rules and hidden floors |
| `src/domain/commitments` | Binding conditional commitments |
| `src/domain/clearing` | Pooling and hidden-floor matching |
| `src/domain/negotiation` | Bounded rounds, signed counter-offers |
| `src/domain/ledger` | Append-only savings split |
| `src/domain/onboarding` | Menu photo to offer schema |
| `src/integrations/meta` | Muse Spark, Muse Wonder clients |
| `src/lib/db` | Drizzle schema and client |
| `sim/buyers` | 20 simulated buyer agents, record and replay |
| `tests/` | unit, integration, e2e, support |
| `config/` | Vitest, Drizzle, tsconfig variants |
# backfill
