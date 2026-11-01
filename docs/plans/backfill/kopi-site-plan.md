# Kopi site implementation plan

Goal: apply the user-approved HTML mockup across the existing Backfill site and provide a local review before S9.

Authority: user approved the mockup and explicitly requested site-wide implementation on 2026-11-01. This advances Kopi's visual companion from the previously deferred S9.5 scope. It does not start S9, authorize paid calls, or publish this change.

Architecture: preserve server pages, forms, read models and SSE. A reusable SVG draws Kopi. A shared client provider retains dismissal across navigation and shows route guidance or an explicit page-supplied state. A pure demo cue function distinguishes replay, unavailable data, pending clearing and confirmed results.

Design reference: `/Users/jayd0/.codex/visualizations/2026/11/01/01a19781-b6b4-74f1-b02c-8c64a395d692/kopi-landing.html`.

Constraints: existing colours including dark mode; Silkscreen headings and IBM Plex Mono body; no invented outcomes or evaluations; accessible controls and reduced motion; no database/domain changes. HTML for review artifacts, framework components for the actual Next app.

- [x] Shared typography, navigation, SVG and companion. Preserve hide/show preference, disable motion when requested, route-aware guidance.
- [x] Landing matches the approved composition with real navigation and existing stored totals. Restyle demo, evals, diagnostics, merchant entry, dashboard and draft review; preserve all forms and disclosure text.
- [x] Test demo cue branches, including stale feed and replay; run typecheck, lint, full local tests and production build.
- [x] Inspect public and authenticated local screens at desktop/mobile; preserve light/dark tokens and reduced-motion styles; exercise replay and hide/show. Save an HTML gallery and local preview links.

Verification risks: long merchant names and money values; mobile companion blocking controls; replay mistaken for a live event; stale data celebrated; merchant auto-replan invoking a provider. Preview uses a disposable database with a pre-existing plan and invalid dummy provider credentials.

Runtime dark/reduced-motion emulation is unavailable through this browser interface; no runtime verification of those preferences is claimed. See evidence/kopi-ui/README.md for build and verification details.
