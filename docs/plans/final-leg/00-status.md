# Final-leg release status

Branch `final-leg`. Nothing from this branch has been pushed, merged or deployed.

## Completed local work

- Tasks 1-2: migration 0019, visibility, agent scope, rate limits, merchant review and prompt hardening.
- Task 3 (`1c0f743`): client caps, menu model calls outside transactions, bounded bodies, capped hosted negotiation. 674 tests passed.
- Task 4 (`ceda57d`): scoped sandbox credential, mint/session/action caps and synthetic seed. 679 tests passed.
- Task 5 (`526c6d8`): first-visitor buyer flow and three browser journeys over HTTP fixtures. 679 tests passed.
- Task 6 (`ac2cc81`): recorded replay trail and overdue Muse status. 681 tests passed.
- Task 7 (`11156f5`): public claims, recent diagnostic metadata, collapsed guide, singular cover and pending merchant browser proof. 682 tests passed.
- Task 8: documentation, MIT default, source disclosure, local-only guide and logos. Verification recorded in the local ledger.

Task 9 and its independent whole-branch review remain pending. Gate B requires the operator's specific approvals before production actions.

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
