# S9.5 final slice implementation plan

Goal: finish the approved Kopi contract and absorb S10 hardening and submission preparation.
Architecture: extend the existing companion, owner-keyed messages and demo snapshot flow. Pure transition and queue functions drive finite CSS animations; the server and financial domain remain unchanged.
Stack: existing Next.js, React, TypeScript and Vitest; Playwright for repeatable local browser checks.
Spec: build-plan.md S9.5 and S10, redesign-proposal.md pet contract, s9-handoff.md design continuation, and the user authorization recorded in 00-status.md.

## Constraints and review focus

- Never celebrate initial snapshots, reconnect catch-up, replay, stale feeds or unverified outcomes as live. Pending minimum attainment is not cleared savings.
- Keep owner-keyed message restoration. Bound the animation queue at three and cancel it on navigation, stale feed and replay.
- Keep one animation active. Reduced motion uses static poses and polite bubbles.
- Dragging cannot place Kopi over interactive controls, including after scrolling/resizing at 375px. Keyboard users retain dismissal.
- Test query flag hides the entire companion without changing the persisted preference.
- No production credentials in preview copies. No provider requests, hosted mutations or publication without named approval.

## Work items

- [ ] Transition unit: src/components/kopi-state.ts and tests/unit/kopi.test.ts. Diff consecutive snapshots, preserve event identity, label recorded outcomes and suppress catch-up. Exercise every trigger and negative case, mutation-check each new guard.
- [ ] Companion unit: kopi-companion.tsx, kopi.tsx and globals.css. Queue, finite animation props, deterministic query flag, reduced motion, bounded drag and control avoidance. Browser tests assert visible behavior and cancellation.
- [ ] Callers: demo/live-board.tsx and merchant pages. Wire real transitions; verify published state from stored data, not an arbitrary status query. Reuse existing KPI tiles and add only missing chips/stepper states.
- [ ] Verification: isolated local preview, Playwright desktop/mobile light/dark and reduced motion, five replay rehearsals, local onboard/commit/clear/ledger flow. Every new guard has a failing mutation, byte-identical restoration and passing rerun. Hosted mutating E2E remains separately gated.
- [ ] Delivery: fresh typecheck/lint/unit/integration/build/diffcheck, inspect untracked files, screenshot gallery in HTML, 3-minute storyboard and submission draft. Record unresolved live run, recording, upload and submission work.

The approved scope already supplies the design and execution request. Implement locally in this chat. Do not tick the full slice before its acceptance conditions are met.

## Final local checkpoint

Core implementation, merchant gaps, local production-browser workflow, five full local rehearsals and submission/video drafts are complete. Evidence: evidence/s95/README.md. Broader optional animation behavior, exhaustive defensive DOM branch mutation proof and the external/manual exit gates remain open. Full-slice checkboxes above are intentionally not all ticked.
