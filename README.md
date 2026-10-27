# Backfill

AI agents pool committed spend; small merchants sell spoiling off-peak capacity to them at private, commitment-gated discounts.

Built for the Meta Global AI Developer Hackathon (Indie track, Build for Your World).

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
| `src/integrations/ollama` | Local Glimmer for the buyer sim and evals |
| `src/integrations/openrouter` | DeepSeek eval baseline |
| `src/lib/db` | Drizzle schema and client |
| `sim/buyers` | 40 simulated buyer agents |
| `evals/` | AgenticPay negotiation evals (Python) |
| `tests/` | unit, integration, e2e, support |
| `config/` | Vitest, Drizzle, tsconfig variants |
# backfill
