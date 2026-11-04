# Backfill

Singapore cafés publish quiet-hour offers that independent buyer agents can unlock together, within limits the merchant sets.

[Hosted app](https://backfill-9d0x.onrender.com/) · [Recorded demo](https://backfill-9d0x.onrender.com/demo)

## Try it in 60 seconds

Open `/buyer`, press **Use example**, save the request, and ask Glimmer to propose constraints. Review them, ask Spark Open for a decision, then separately approve and submit the exact terms. The sandbox merchant is synthetic. Checkout is simulated, with no payment, identity or attendance enforcement.

The hosted buyer flow was verified on Nov 4 with NVIDIA Glimmer and Gateway Spark Open, separate approval, and a stored synthetic commitment. See the [release record](docs/plans/final-leg/release-2026-11-04.md).

## Models

| Model | Role | Status in this build |
|---|---|---|
| Muse Spark | Menu extraction and merchant counter-offers | live in the product |
| Muse Wonder | Proposed terms after a sellout, subject to owner approval | live in the product |
| Voice Transcribe | Owner voice edits for review | live in the product |
| Muse Glimmer | Buyer intent through NVIDIA | live in the buyer sandbox |
| Muse Spark Open | Buyer recommendation through Vercel AI Gateway | live in the buyer sandbox |
| SAM 3.1 | Dish segmentation | enabled for merchants with daily caps; one hosted test on a synthetic image |
| Muse Image | Offer image generation | enabled for merchants with daily caps; one hosted test on a synthetic image |

The recorded scene had 11 of 20 simulated buyers commit and filled 16 covers. It does not prove merchant demand, actual attendance or recovered revenue. The author's own Muse account completed connector tests on Oct 29 and Nov 4. The Nov 4 sandbox commitment is independently verified in [the evidence](docs/plans/final-leg/evidence/muse-connector/README.md).

## Local setup

Use Node 24 and PostgreSQL. Create an empty local development database and an owner connection that can create roles and run migrations.

1. Run `npm ci`.
2. Copy `.env.example` to `.env.local` and configure `DATABASE_URL`, `META_API_KEY`, `META_BASE_URL`, `META_MODEL_SPARK` and `META_MODEL_WONDER`. Keep secrets private. `APP_BASE_URL` defaults to localhost in development.
3. Export the owner `DATABASE_URL` and run `npm run db:migrate`. Use a separate login in `backfill_app` for the running app after migration; the app does not need owner privileges.
4. For the buyer sandbox, export the owner connection and run `npm run sandbox:seed`. Configure `NVIDIA_API_KEY`, `AI_GATEWAY_API_KEY`, `BACKFILL_S4_NVIDIA_GLIMMER_APPROVED=1` and `BACKFILL_S4_GATEWAY_APPROVED=1` only when provider processing and spending are authorized. Buyer requests go to NVIDIA and Vercel AI Gateway.
5. Run `npm run dev`, then open `http://localhost:3000`.

Optional settings: `NEGOTIATION_SIGNING_SECRET` enables signed counters. The four `WHATSAPP_*` credentials in `.env.example` must all be set together to enable the webhook. Media remains disabled by default.

Automated tests use disposable local databases and fake model responses. Never point their database setting at production.

```sh
npx tsc --noEmit
npm run lint
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres npm test
npm run build
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres npx tsx scripts/verification/merchant-access.ts
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres npx tsx scripts/verification/final-browser.ts
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres npx tsx scripts/verification/final-browser.ts --truth
```

The browser runners copy allowlisted sources, use a restricted database login and block external traffic. They need the Chromium browser installed for Playwright.

## Original contributions

Solo submission by Jaydon Kua. Git history starts Oct 26, 2026 at 20:33 ET, with documentation and an empty skeleton. The first application code lands Oct 27 at 10:25 ET. These correspond to Oct 27 at 08:33 and 22:25 SGT.

Pre-existing scaffolding came from the author's public [envoi repository](https://github.com/jaydonnnk/envoi). `src/lib/entrypoint.ts` and `postcss.config.mjs` were carried over unchanged. `config/vitest.config.ts`, `src/lib/db/migrate.ts`, `src/lib/log.ts`, `tests/support/db.ts`, `src/env.ts` and `package.json` were adapted. Backfill's domain and application features were built during the event.

## Source and evidence

- `src/domain`: deterministic offer, commitment, clearing, negotiation and ledger rules.
- `src/app/merchant`, `src/app/buyer`, `src/app/demo`: merchant workspace, buyer review and recorded scene.
- `src/app/api`, `src/app/mcp`: HTTP APIs and authenticated MCP connector.
- `src/integrations/meta`: structured model provider and price metadata.
- `sim/buyers`: synthetic buyers and frozen recording replay.
- `tests`: unit, integration and browser verification.
- [Pitch](docs/pitch.md), [stack](docs/tech-stack.md), [evidence and limitations](docs/plans/backfill-proof/00-status.md), [final release plan](docs/plans/final-leg/build-plan.md).

`llm_calls` records supported Meta menu, negotiation and planning attempts. `/system` shows recent metadata and the tracer reply. Voice, media, sandbox models and the US$0.0878 scene recording are excluded from those totals.

MIT licensed. The locally retained hackathon guide and logos are excluded from this repository going forward; historical commits remain unchanged.
