# Final-leg release status

Branch `final-leg`. The tested branch has been merged, pushed and deployed. See [production release evidence](release-2026-11-04.md).

## Completed local work

- Tasks 1-2: migration 0019, visibility, agent scope, rate limits, merchant review and prompt hardening.
- Task 3 (`1c0f743`): client caps, menu model calls outside transactions, bounded bodies, capped hosted negotiation. 674 tests passed.
- Task 4 (`ceda57d`): scoped sandbox credential, mint/session/action caps and synthetic seed. 679 tests passed.
- Task 5 (`526c6d8`): first-visitor buyer flow and three browser journeys over HTTP fixtures. 679 tests passed.
- Task 6 (`ac2cc81`): recorded replay trail and overdue Muse status. 681 tests passed.
- Task 7 (`11156f5`): public claims, recent diagnostic metadata, collapsed guide, singular cover and pending merchant browser proof. 682 tests passed.
- Task 8: documentation, MIT default, source disclosure, local-only guide and logos. Verification recorded in the local ledger.

Task 9 is complete locally. A fresh-context reviewer found no Critical findings and four Important findings. All four were fixed with observed failing regressions in `f9b51e5`; see [review record](review.md). Final fresh-clone installation, typecheck, lint, 685 tests, three consecutive 271-test integration runs, production build, seven merchant browser tests, four sandbox browser tests, and five truth/pixel tests passed. Thirty-six screenshots covered 375px and 1280px, light and dark. No paid or production calls ran.

Gate B was approved. Task 10 is fully green as of Nov 4 at 23:12 SGT. The author's new Muse sandbox commitment is independently verified; see the connector evidence. Task 11 remains conditional on Task 10 being fully green before 04:00 SGT. Task 12 and the real Muse connector run remain operator-owned.

## Rulings and limits

Frozen `buyerRequest`, `BUYER_SYSTEM` and `frozenProposalPrompt` remain unchanged for the stored recording and closed S6 contract. Live calls use hardened variants. Cost if wrong: disabled record-mode code still retains the original prompt contract.

Menu quota windows use database time, with 100 reads globally and 10 per known client. The clock argument remains for source compatibility. A menu read can retain up to three provider attempts. Cost if wrong: fixed-window boundary bursts and retry spend may exceed an interpretation based on individual HTTP attempts.

Hosted negotiation uses one provider attempt per reserved proposal. Cost if wrong: transient provider failures immediately hold the price.

Sandbox seeding consumes explicitly exported owner configuration, uses deterministic IDs and never resets existing rules. Cost if wrong: changed seed terms need a deliberate migration. The existing ten-session per-agent cap remains alongside the shared 40-session daily cap.

An incompatible buyer window has a specific service status and guidance. Cost if wrong: old clients expecting model_failed must adapt. Browser model responses are HTTP fixtures, not proof of live providers or current key credit.

Replay approval is scripted, never human consent. A trail write occurs after the MCP commitment. Cost if wrong: failure between the two operations requires operator repair.

Kopi defaults collapsed at every width and retains explicit visibility preferences. Cost if wrong: less unsolicited guidance, and a prior show preference can reopen it. Per-model diagnostic aggregates were omitted; the recent metadata list is implemented.

MIT is assumed pending Gate A. Cost if wrong: replace the licence before release. Existing historical commits are retained. The adapted scaffolding disclosure is explicit. GitHub confirmed envoi public on Nov 4. Source checks used the local git timeline; Meta's Singapore announcement is dated Oct 27 while Singapore launch coverage is dated Oct 28.

## Operator steps

Before Gate B, confirm the Render judging-period plan, sandbox NVIDIA/Gateway keys and credit, and daily spend ceiling. The plan defaults allow roughly US$15/day, an estimate rather than an invoice guarantee.

Approve each production action separately: merge/push, migration 0019, merchant-name review, Render variables, deploy, synthetic seed/settle/replay, and paid smoke calls under about US$0.10. Replay must run after midnight SGT or before roughly 22:50 SGT.

The real Muse connector run and Task 12 merchant conversations belong to the operator. Do not add quotes without real answers and consent. Task 11 starts only if Task 10 is fully green before 04:00 SGT. Code freezes at 05:00 SGT. Video and submission are out of scope.

## Review fixes and final rulings

Incompatible offers are checked before model-attempt reservation. Use example resets local request state and can be used after a refusal. Cost if wrong: choosing the example abandons the displayed local session, whose saved database record expires normally; a newly saved request counts toward the daily session cap.

Buyer HTTP bodies are now bounded to 6,000 bytes after authentication. Cost if wrong: unusually large Unicode constraints may be refused even when their character count is below 6,000. Standard credentials are never exported under the sandbox promise; only a page-minted sandbox token is eligible.

Pending merchant offer cards now say Awaiting review. The retained publication cue describes the saved offer, while the dashboard notice states buyers cannot see it yet.

Human documentation was verified against paths, git timestamps and sources rather than synthetic failing prose tests. Cost if wrong: wording mistakes still require human review. The negative old-copy regression assertion is the sole active claims-grep match.

The pre-existing merchant browser cap fixture was updated from 30 to 100 after its named test failed. Cost if wrong: future quota changes must adapt that boundary fixture. Pixel capture cases were added only in the verification clone; application source was unchanged. Build-launcher path assertions were corrected for macOS /var and /private/var aliases before the production build ran.

The local ledger and scratch evidence are retained as requested instead of deleting the plan workspace. Cost: local disk space. Temporary verification clones are disposable. All production uncertainties listed in the review record remain Gate B checks; no second reviewer sign-off is claimed after the TDD fixes.

## Deferred minor

View pooled outcome links to the separate recorded demo, not the sandbox pool. The result shows the actual pooled covers and minimum. The misleading destination remains deferred from the review's Minor list.
