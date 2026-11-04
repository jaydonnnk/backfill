# Backfill submission draft

Draft for the user to review and paste into the hackathon form. Not submitted. Field limits and the current submission form have not been checked.

## Name and one-line description

Backfill: Singapore restaurants and cafés publish off-peak offers that buyer agents can unlock together, within limits set by the merchant.

## Project description

An empty restaurant table cannot be sold tomorrow. Backfill helps independent Singapore food and drink merchants offer quiet-hour capacity to AI agents while retaining control over price and availability.

The merchant uploads a menu, reviews Muse Spark's extraction, and sets the window, discount, minimum group size, per-agent cap and hidden price floor. Buyer agents accept those terms and submit conditional commitments through Backfill's MCP connector. One agent may be too small to unlock the offer. Their pooled commitments can clear it.

Muse Spark proposes merchant counter-offers. Code checks every proposal against both sides' limits. Muse Wonder proposes revised terms after a sellout, and the merchant must approve before those terms change. The append-only ledger records the outcome and allocates all savings to buyers, with zero agent or network share.

One Oct 29 test by the author's own Muse account submitted a commitment through the custom connector. The demo shows that commitment separately from the simulated buyer pool. Demo merchants are synthetic, and the replay uses previously recorded buyer decisions. No payment, identity or attendance is enforced. The recorded scene had 11 of 20 simulated buyers commit and filled 16 covers.

## Use of Meta tooling

- Muse custom connector: authenticated buyer commitments through streamable HTTP MCP.
- Muse Spark: menu extraction, merchant price proposals and the recorded simulated buyer decisions.
- Muse Wonder: proposed terms after sellout, subject to domain validation and merchant approval.
- WhatsApp Cloud API: the implemented merchant message flow uses a test-number sandbox.

## Technical depth

Typed agent terms, integer SGD cents, Singapore-local deadline handling, per-agent limits, idempotent commitments, bounded negotiation with signed counter-offers, transactional clearing and an append-only savings ledger. The dashboard distinguishes stored results, local replay and interrupted feeds. Kopi's guidance follows observed state and does not turn a pending minimum into a cleared deal.

## Model evidence

Supported Meta menu, negotiation and planning attempts are recorded in `llm_calls`. The diagnostics page lists recent metadata and the tracer reply. Voice, media, NVIDIA Glimmer, Gateway Spark Open and the US$0.0878 recorded scene are excluded from those totals. Costs are price-table estimates, not invoices. Code checks proposed prices against the merchant's private floor before signing a counter-offer.

## Links and completion state

- Hosted app: [Backfill](https://backfill-9d0x.onrender.com/)
- Recorded-demo dashboard: [Demo](https://backfill-9d0x.onrender.com/demo)
- Model roles and live call log: [Why Muse Spark](https://backfill-9d0x.onrender.com/evals) and [System](https://backfill-9d0x.onrender.com/system)
- Video: not recorded or uploaded for this final slice.
- S9.5 publication: not authorized or performed in this session. Hosted behavior may differ from the local preview.

## Evidence notes, not for the form

The real Muse connector result is recorded under the S4 Day 0 subsection in 00-status.md. Rehearsal evidence is in evidence/s95/rehearsals.json. No new production verification or paid model run is implied by this draft.

Historical note: the S9 comparison run and the `/evals` numbers that displayed it were removed on 2026-11-02: that run was served through OpenRouter, which is neither the Meta Model API nor an eligible open-weight inference partner, so presenting its figures as Muse Spark evidence misstated compliance with the required technology. The run's own artifacts are kept under evidence/s9-* as the spend audit trail. `/evals` now describes what each model does and links to the Meta-API call log.

Before submission, the user still owns final video approval/upload and the actual form submission. The plan's internal target converts to November 5 at 07:00 SGT; its deadline converts to November 5 at 10:00 SGT. The current hackathon form deadline remains independently unverified.
