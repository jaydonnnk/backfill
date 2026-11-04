# Backfill tech stack

One Next.js 16 app runs the merchant workspace, buyer review flow, recorded demo, APIs and streamable HTTP MCP connector. TypeScript, React 19, Tailwind 4 and Zod 4 provide the UI and boundary validation. PostgreSQL with Drizzle stores merchant rules, scoped agents, conditional commitments, clearings and the append-only ledger. SGD values are integer cents; windows use Asia/Singapore.

## Models and trust boundaries

Muse Spark reads menus and proposes merchant counter-offers. Muse Wonder proposes revised terms after sellout. Voice Transcribe handles owner voice-edit transcription. The owner reviews extracted content and approves term changes. Code enforces prices, capacity, scope, idempotency and deadlines independently of model output.

The buyer sandbox uses NVIDIA-hosted `meta/muse-glimmer-30b` for intent and Vercel AI Gateway `meta/muse-spark-open` for decisions. Independent approval switches gate both providers. Requests have bounded output, timeouts and no automatic retries. Sandbox tokens cannot access listed merchants. Limits cap mints, sessions and model actions.

SAM 3.1 and Muse Image have one recorded run each and are disabled in the hosted product. Checkout is simulated. The recorded scene replays frozen historical decisions without inference. One Oct 29 connector test used the author's own Muse account; broader interoperability is unverified.

## Observability and verification

`llm_calls` records supported Meta menu, negotiation and planning attempts, with token counts, price-table cost estimates and latency. `/system` exposes recent metadata and the tracer reply. Voice, media, sandbox models and the US$0.0878 scene recording are excluded from those totals. Cost estimates are not provider invoices.

Vitest tests pure domain behavior and disposable local PostgreSQL integrations. Playwright uses isolated app copies, restricted database roles, fake HTTP providers and external network blocking. Production deployment is separate from local verification.

## Deployment and provenance

Render hosts the app and Neon hosts production PostgreSQL. Migration precedes deployment and requires the owner connection. The normal app uses a restricted login in `backfill_app`. Render free instances can sleep; the operator must choose the judging-period hosting plan.

Scaffolding derives from the author's [envoi](https://github.com/jaydonnnk/envoi) repository. `src/lib/entrypoint.ts` and `postcss.config.mjs` are unchanged. `config/vitest.config.ts`, `src/lib/db/migrate.ts`, `src/lib/log.ts`, `tests/support/db.ts`, `src/env.ts` and `package.json` are adapted. Backfill's application and domain code were built during the event. See [README](../README.md) for setup and [the final plan](plans/final-leg/build-plan.md) for release gates.
