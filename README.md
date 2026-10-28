# Backfill

AI agents pool committed spend; small merchants sell spoiling off-peak capacity to them at private, commitment-gated discounts.
Market: Singapore food and drink, the kopitiams, cafés and hawkers left out of Muse's launch partners.

Built for the Meta Global AI Developer Hackathon (Indie track, Build for Your World).

- Pitch: [docs/pitch.md](docs/pitch.md)
- Stack: [docs/tech-stack.md](docs/tech-stack.md)
- Plans: [docs/plans/backfill](docs/plans/backfill)

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
| `src/integrations/openrouter` | DeepSeek eval baseline |
| `src/lib/db` | Drizzle schema and client |
| `sim/buyers` | 20 simulated buyer agents, record and replay |
| `evals/` | AgenticPay negotiation evals (Python) |
| `tests/` | unit, integration, e2e, support |
| `config/` | Vitest, Drizzle, tsconfig variants |
# backfill
