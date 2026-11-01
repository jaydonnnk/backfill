# S9 handoff: evaluations with the approved Kopi design

## Scope and authority

The user visually accepted the Kopi site on 2026-11-01 and authorized committing the working tree and pushing it to main. S9 is not implemented in this handoff. Their requested continuation prompt starts S9 implementation, while paid model calls still require a separately agreed policy. Offline harness, schema, tests and UI preparation can proceed without model spending. No production data write, new live S7 scene, real payment or separate publication is authorized for S9 by this handoff.

Read the latest status in `00-status.md`, the S9 section of `build-plan.md`, and this document. The older `redesign-proposal.md` supplies evaluation content requirements; its Gloock/Manrope styling and Kopi deferral are superseded by the accepted site. Do not reopen completed S8/S8.5 work.

## Design continuation, binding for S9

Use the implemented site as the visual source of truth, particularly `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx` and `src/components/kopi*.tsx`. The committed screenshot gallery is `evidence/kopi-ui/index.html`, with desktop and mobile references. The original approved HTML mockup is local at `/Users/jayd0/.codex/visualizations/2026/11/01/01a19781-b6b4-74f1-b02c-8c64a395d692/kopi-landing.html`; it is an additional reference, not a runtime dependency.

- Silkscreen pixel headings; IBM Plex Mono supporting copy, controls and numbers. Fonts are self-hosted through next/font. No return to the older Gloock/Manrope design.
- Retain the existing cream, deep ink and electric blue CSS tokens, dark-mode equivalents, and thin teal/blue/magenta top bar. Use semantic good/wait/bad colours for results.
- Open spacing, clear left alignment, square controls/panels and restrained structural rules. Match the existing demo dashboard, rather than introducing a separate generic dashboard theme.
- Keep the shared header/footer and original scanline coffee-cup Kopi. Reuse KopiMessage for page guidance; the shared provider owns positioning, route continuity, dismissal and persistence. Do not create a second mascot, replace Kopi with a cat, or simulate celebrations for unverified results.
- Kopi starts `/evals` saying no results exist. Change this only when a validated run is loaded. Empty, invalid, partial and failed runs must remain distinguishable from completed runs.
- Preserve keyboard navigation, legible numbers, narrow-screen layout and prefers-reduced-motion support. HTML for standalone visualizations/mockups; actual Next components can use TSX.

The visual companion and merchant overview/steps have already advanced from the S9.5 deferral. Do not reimplement them. S9.5's additional ambitions are not all claimed complete; dragging, expanded state animation/props and a deterministic test switch were not delivered in this design update.

## S9 deliverables

1. A bounded AgenticPay-style evaluation harness under `evals/agenticpay`, comparing Muse Spark and DeepSeek through OpenRouter. Inspect existing provider, negotiation and call-log interfaces before deciding the harness boundary. Research any referenced upstream harness from its primary source; do not claim exact reproduction if it is unavailable.
2. Identical scenarios/seeds and bounded negotiation rules for both models. Real domain guards enforce hidden floors, buyer limits and the existing maximum rounds. Paid runs may start only after explicit authorization of exact models, allowed calls/episodes, retries and total spending cap.
3. A validated `evals/results/<run-id>.json` contract with run/model/config provenance, scenario/seed IDs, per-episode rounds, proposals, refusals, outcomes, savings, persisted llm_calls IDs and cost, plus summary. Define denominators, missing costs, failed episodes and zero-deal cost-per-deal before calculating summaries. Zero deals has an unavailable cost-per-deal, not zero cost.
4. `/evals` renders that validated data with a head-to-head header, run date/count, paired deal-rate/savings/cost-per-deal comparisons, guardrail refusal counts, an inspectable episode grid and cost-versus-deal-rate chart where actual data supports it. A detailed episode drawer is secondary. Do not announce an overall winner from mixed or insufficient evidence.
5. Every published number traces to the episode data and corresponding stored llm_calls records. Join only this evaluation run's calls, including chargeable failed attempts/retries. Do not mix old tracer/onboarding/S7 calls into evaluation cost. Historical model IDs/prices in old docs are not current verification.
6. No invented results. Explicitly labelled synthetic test fixtures can prove parsing/rendering locally, but cannot be presented as measured model comparisons. The empty public page stays truthful until real evaluated data is authorized and validated. Public pages must not expose production merchant floors, secrets or private call payloads. Use isolated synthetic evaluation scenarios; do not repurpose protected production records.

## Existing verification and traps

The accepted design passed 425 tests in 42 files, typecheck, lint and a secret-free production build using webpack. Fourteen desktop/mobile route checks, replay/return, comparison, mobile popovers, local merchant validation/publication and dismissal persistence were checked. Runtime dark/reduced-motion emulation was unavailable in that browser interface; CSS is preserved but those runtime checks remain open.

The local production preview uses `/tmp/backfill-kopi-preview`, a disposable synthetic database and dummy provider credentials at https://model.invalid. URLs `http://127.0.0.1:3190/` and `http://127.0.0.1:3191/` are temporary and may need restarting. It has no live model access. Local merchant credentials are only in `/tmp/backfill-kopi-merchant.json`; never commit them. An authenticated production merchant page can auto-trigger Wonder; use local fixtures for UI checks.

Temporary form messages previously erased persistent page guidance. The owner-keyed message reducer and its regression now restore the underlying message. Preserve that behavior when integrating eval status. Tests must continue using an explicit disposable local TEST_DATABASE_URL; do not run against Neon. Keep original S7 recording/screenshots and old migrations/snapshots frozen. Never read .env.local, package-lock.json or migration snapshots or print credentials. Preserve the 100% buyer / zero agent / zero network savings policy and existing accepted prices.

## Exit

A repeatable, tested evaluation pipeline and `/evals` in the approved Kopi design, with traceable results from an explicitly authorized model run. If spending remains unapproved, report offline preparation as complete and live evaluation as pending. Do not claim the full S9 exit from fixture data. Provide a local visual review before proposing publication.
