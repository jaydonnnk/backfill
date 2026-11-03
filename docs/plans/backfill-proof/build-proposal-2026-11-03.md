# Backfill revised build proposal

Status: Slice 0 audit explicitly authorized and completed on 2026-11-03; S1–S8
remain unstarted. See [S0 evidence](evidence/s0-preflight-2026-11-03.md).
Spark Open access was subsequently verified through Vercel AI Gateway and the
AI SDK; use the updated S4 route below. No direct Baseten account is required
for that route. Bonus-prize partner verification remains separate and unresolved.
This is a scope and acceptance proposal, not approved architecture or executable
program design. No further implementation is authorized by this document.

## Goal and scoring honesty

Deliver one convincing, inspectable café workflow that uses all eight required
Meta tools/models. The user owns merchant evidence and video production.

Treat 70/100 as a final-submission target, not a score the code can guarantee.
Using the review's anchors, Impact 5 / Tooling 8 / Technical 8 / Demo 8 would be
1.50 + 2.00 + 1.60 + 2.00 = 7.10/10 = 71/100. Tooling and Technical 8 require
strong observed evidence. Demo 8 requires the user's strong video as well as a
reliable product. Impact 5 is conditional on the final evidence. These are
targets, not a revised forecast awarded before the work exists.

With Impact 4 and Demo capped at 3, even Tooling 10 and Technical 10 total only
64.5/100. There is no honest code-only promise of 70 on that evidence.

## Decisions carried forward

- The user explicitly reaffirmed all eight tools/models on 2026-11-03.
- Keep the café vertical, independent parties, conditional offer and existing
  Kopi design. Keep the current app and transaction rules.
- Make decisions visible, prove a complete journey, and distinguish pooling
  value from AI value. Do not restore the deleted OpenRouter/DeepSeek work.
- No video production, merchant recruitment, payments, deployment, production
  writes, publication, or new paid inference is included.
- All new UI mockups are standalone HTML. Existing product TSX may be changed
  only after implementation is authorized; no TSX visualization artifacts.
- Preserve the current dirty files and unrelated untracked material. They are
  not a clean baseline and are not authorization to publish them.

## The experience to build

An owner photographs the menu and an actual dish, then gives a short spoken
instruction to edit an existing offer. The app shows the extracted offer and exact
proposed rule changes for review. The owner confirms the terms and may approve
an optional promotional image.

Separate buyer agents assess the same offer for separate parties. The interface
shows the instruction, bounded decision, approval evidence, commitment, and
eventual stored result. Parties remain distinct and do not share a table or
authorize each other. Negotiation can help one party find valid terms, but no
model can override price, deadline, capacity, or approval checks.

The group either qualifies at settlement or receives no discounted booking.
After a sellout, Wonder proposes next terms; the existing owner approval flow
controls whether they apply. No payment or attendance is implied.

The main demonstration needs four two-person parties, not twenty animations.
Four is an illustrative test size, not evidence of four real customers. Keep
the existing twenty-agent recording as separately labeled historical replay.

See [workflow mockup](mockups/workflow.html). It shows proposed information
order, not working integrations or measured results. The existing
[outcome mockup](mockups/demo.html) remains the core result-state reference.

## Eight bounded roles

1. **Muse Spark 1.3:** existing menu vision and bounded merchant negotiation.
   Reuse them. Show their actual inputs, proposals and resulting validated state.
2. **Muse Wonder:** interpret a transcribed owner instruction and propose a
   rule change; reuse sellout replanning and explicit owner approval. Explain
   that Backfill stores and retrieves the history, not that the model owns
   persistent memory. Existing PlanMemory already supplies database history.
3. **Muse Voice Transcribe:** owner audio to a reviewable transcript. Voice is
   the principal new convenience feature. Transcript alone never changes terms.
   First support an audio upload in the existing owner workflow; WhatsApp audio
   is optional transport work, not a new critical dependency.
   Initial voice edits cover only discount, capacity, minimum pool and per-agent
   cap. Offer window and private floor remain manual, as in the existing service.
4. **Muse Glimmer, local:** turn one buyer's natural-language request into
   proposed constraints for that buyer to review. Demonstrate useful local
   inference without claiming the hosted shared pool works offline. Do not
   create a fallback orchestration system or promise twenty concurrent agents.
5. **Muse Spark Open through Vercel AI Gateway:** assess offers for independent buyer
   agents using the existing simulation/MCP path. Four distinct test identities
   are sufficient for the main case. Include a refusal, not only agreements.
   Use `meta/muse-spark-open` through the installed AI SDK and the existing
   `AI_GATEWAY_API_KEY`. Basic text inference is verified; buyer integration,
   structured-output behavior and upstream partner verification are not.
6. **SAM 3.1:** isolate an owner-supplied dish from its real photo. Show the
   source and cutout for owner review. No food or price inference from its mask.
7. **Muse Image:** generate an optional decorative poster background. Compose
   the approved real dish cutout and exact offer text deterministically. The
   generator is not responsible for prices, food appearance, logos or rules.
   SAM and Image can produce independently reviewable assets; booking never
   depends on either. If their asset formats cannot compose as assumed, resolve
   that contract before committing to this flow. Do not call a text prompt an
   image/mask-conditioned generation request.
8. **Muse Code:** development use, evidenced as a development tool. Do not
   invent a runtime model ID or require a product call-log row for it.

SAM and Image remain a small publishing convenience. They are not the principal
argument for Tooling 8. That argument must come from useful coordination,
language/voice interpretation and constrained decisions demonstrated together.

## What is already present and must be reused

Read-only inspection on 2026-11-03 found these existing owners:

- `src/lib/onboarding/service.ts` and `models.ts`: menu draft, publication,
  database-backed plan history, sellout replanning and owner application.
- `src/domain/whatsapp/owner-change.ts` and `src/lib/whatsapp/service.ts`:
  proposed owner changes and YES/NO confirmation semantics.
- `src/lib/negotiation/service.ts` and `merchant-agent.ts`: bounded rounds,
  signed prices and the existing model proposal boundary.
- `src/lib/commitments/service.ts` and `src/domain/clearing/clear.ts`:
  idempotent submissions, settlement, capacity and per-commitment pricing.
- `src/lib/demo/snapshot.ts`, `src/app/demo/live-board.tsx`, `sim/buyers/`:
  stored outcomes, decision recording, isolated identities and replay.
- Existing S5/S6 integration tests cover model failure, unsafe prices, races,
  stale terms and unapproved plans. Extend gaps; do not rebuild these features.
- The historical real-Muse account result in `00-status.md:268-272` is separate
  evidence. It does not establish several real users or general availability.

These are current ownership references, not a finalized file-change list.
Choose signatures, storage changes and exact edits only after scope approval.
Do not force image/audio receipts into token-only accounting or expand one
chat interface into a general provider framework as a prerequisite.

## Proposed work packages and timeboxes

The target is 23 productive hours plus 2 hours contingency. These are allocation
limits, not established estimates. They assume usable access, a fitting local
model, supported media formats and reusable local test infrastructure. Missing
those prerequisites makes the schedule incomplete; it does not relax proof.
Downloads, partner responses and approvals add wall-clock time.
This is a stretch build allocation after feasibility is established, not a total
project estimate. S0 can identify missing prerequisites but cannot prove unknown
media contracts or Glimmer memory fit from documentation alone. Establishing
those empirically may require additional time or actions outside current scope.
If they remain unresolved, there is no credible all-eight 25-hour commitment.

### S0: availability and baseline, 1 hour

- Read existing access evidence, exact model identifiers, non-chat contracts,
  artifact format requirements and eligible partner status. Identify the local
  model's runtime/context requirements; downloaded weight size is not total RAM.
- Mark every tool separately: access unknown / offline contract verified /
  integration verified / genuine usage evidenced. One does not imply the next.
- Confirm a disposable local database and hermetic test path. Inventory existing
  recordings and their source scenario before using them as evidence.
- Acceptance: a truthful dependency sheet. Unknown endpoints, missing access or
  unproven memory fit remain visible blockers. No paid probes, applications,
  installations or downloads are authorized by this planning step.

### S1: one complete transaction journey, 3 hours

- Reuse menu review, owner publication, distinct MCP identities, settlement and
  Wonder application. A deterministic local fixture wires the path first.
- Use a frozen illustrative case: minimum 8, capacity 8, four parties of 2.
  A second case has only three parties and must produce no discounted booking.
- Acceptance: successful case stores exactly 8 filled covers after the deadline;
  insufficient case stores zero; retries do not duplicate commitments or ledger
  entries. A Wonder proposal leaves current terms unchanged before owner action.
- Offline model substitutions are explicitly labeled fixtures, never evidence
  that Spark or Wonder made these specific decisions.

### S2: decision and approval trail, 3 hours

- Add the smallest addition to the existing demo needed to inspect each party's
  request, actual bounded output, approval source, committed terms and result.
- Link each displayed event to its actual run, party and offer version. Do not
  connect unrelated historical negotiations to this pool.
- Acceptance: a changed price/version cannot inherit old approval; missing
  approval cannot acquire a human-approved label; scripted authorization remains
  labeled scripted. The workflow must distinguish proposal from commitment.
- Expose only an actual short output summary, not fabricated reasoning or chain
  of thought. Merchant-only negotiation rationale and private guards do not enter
  buyer/public views. A feed interruption preserves uncertainty.
- No OAuth overhaul or new production consent service is proposed. The evidence
  must describe the approval assurance this demonstrator actually supplies.

### S3: voice instruction with safe review, 3 hours

- Add audio upload, transcript review and proposed owner rule diff to the
  existing owner experience. Reuse Wonder's existing change-validation and
  confirmation behavior. Do not require new WhatsApp transport for acceptance.
- Limit edits to discount, capacity, minimum pool and per-agent cap. Requests
  to alter the visit window or private floor must explain the manual route and
  change nothing. Initial offer creation remains the existing review flow.
- Acceptance: an intelligible instruction proposes the intended values; an
  ambiguous instruction requires clarification; a wrong transcript can be
  corrected or discarded; no proposal applies without an affirmative owner
  action; failed transcription changes nothing.
- Every audio example records whether it is genuine model output or a fixture.
  Genuine end-to-end model evidence is required to call integration verified.

### S4: two open-weight roles, 4 hours

- Add the smallest local intent-parsing path for Glimmer and partner-backed
  buyer decision path for Spark Open. Reuse buyer validators and MCP execution.
- Split this package into S4a, local Glimmer setup/intent parsing, and S4b,
  Spark Open buyer integration through the verified Vercel AI SDK path. Keep
  the combined four-hour allocation conditional; Glimmer feasibility is open.
- S4b reuses installed `ai` 7.0.162 and the SDK configuration proven in
  `index.ts`: `meta/muse-spark-open`, explicit low reasoning and bounded
  output/timeout, with automatic client retries disabled. Adapt it to the
  existing buyer decision schema and revalidate output before MCP submission.
  Do not replace the working direct Meta provider for Spark/Wonder/media.
- Record Gateway as the access route and capture actual upstream metadata when
  supplied. Do not label the call direct Baseten, use the Baseten-only `-1026`
  identifier on Gateway, or claim bonus eligibility without supporting proof.
- A successful holiday-generation smoke test is access evidence only. S4b must
  still prove valid buyer decisions, refusals, recording/replay and cost receipts.
- Acceptance: the local output captures the stated party/time/budget or asks
  for clarification; Spark Open's parties retain distinct credentials and
  records; an unsuitable request declines; invalid output submits nothing.
- Keep the refusal in a separate test occurrence. The main eight-cover success
  still has four eligible two-person parties; it does not depend on the party
  that declines in the separate case.
- Any approval uses the final valid terms and belongs to the same party. An
  earlier parser result is not itself permission to spend or commit.
- Demonstrate local inference with the Meta API unavailable only if the database
  remains reachable; label that condition exactly. No offline shared-state claim.
- Runtime identity receipts and genuine outputs must exist for both models.
  Offline stubs and replay alone cannot pass this acceptance.

### S5: optional owner-approved creative asset, 3 hours

- Produce a reviewed SAM cutout and a reviewed Muse Image background from
  rights-cleared inputs. Compose exact approved public terms outside the model.
- Acceptance: source/cutout/background remain inspectable; the food pixels come
  from the source photograph; any generated background is labeled; hidden
  floors never appear; changed terms invalidate the old promotional version.
- An unavailable image service does not prevent publishing or booking an offer.
  Use one approved composition, not an editor or a suite of variants.

### S6: prove AI contribution and failure behavior, 3 hours

- Keep two separate comparisons: identical valid commitments alone versus pooled
  for pooling value; a documented fixed policy versus AI proposals for AI value.
- Freeze twelve small synthetic cases and expected admissible behavior before
  looking at new model results. Include straightforward matches, refusals,
  insufficient demand and changed terms. Use identical initial state, public
  information, permitted actions, rules and retry budgets for both policies.
- No straw-man competitor or floor information given only to the baseline.
  Keep ties, losses, invalid outputs and failures. Do not claim a general model
  ranking from twelve cases or from a single fixed policy.
- An existing recording is admissible only for its matching original inputs;
  unmatched cases stay unmeasured. Fixture results prove evaluator behavior only.
- Reuse real service/integration tests for timeout, duplicates, stale terms,
  unsafe prices and capacity races. The evidence artifact records actual state
  transitions and database outcomes, not a UI with canned success responses.
- Acceptance: case-level records reproduce aggregates; all prices/covers are
  reconciled; no unsafe result reaches a confirmed booking; reports make no AI
  superiority claim when the results do not support one.
- Report sample count, costs with their source, failures and task-specific
  latency. Do not advertise a small-sample p95 or combine provider-wide costs
  into an allegedly measured cost per paying attendee.

### S7: fresh verification, 2 hours

- Run lint, typecheck, unit/integration suites, production build and relevant
  Playwright journeys in a hermetic disposable environment. Test new behavior
  through the actual service boundaries; add only missing regression coverage.
- Check the main flow twice, including an insufficient pool, changed approval,
  optional-media failure and owner refusal. Verify desktop/mobile usability.
- Acceptance: exact revision, commands and results recorded; all required checks
  pass; no live key or production database is used. Missing model evidence
  remains missing even if every offline test is green.
- A failure consumes contingency or requires a revised schedule; do not skip
  required checks to claim the timebox succeeded.

### S8: submission story and evidence handoff, 1 hour, last

- Prepare the compact story and evidence links for the user's video/submission.
  Identify event-built work and carryovers; distinguish current runtime, partner
  inference, local inference, historical evaluation, fixtures and replay.
- Summarize eight roles with actual evidence status, not eight checkmarks.
  Muse Code uses development evidence. Media receipts use the appropriate
  image/audio units; unknown cost is not recorded as verified zero.
- Acceptance: every final claim has a source and caveat; no attendance, revenue,
  general Muse availability, open-weight bonus eligibility or AI advantage is
  implied beyond the evidence. No new claims are added after verification.
- Deliver a copy-paste handoff with completed packages, blockers, exact revision,
  proof locations and instructions to reproduce the local demonstration.

## External dependencies and stop rules

The hard part of all-eight completion is access and genuine usage, not writing
five adapter stubs. The current scope excludes new paid inference. No fresh
billable calls, retries, hosted inference deployments or production writes are
authorized. Do not assume old allowances or unknown credits grant authorization.
Calls to priced endpoints count as billable operations here even if credits
would cover the charge. Existing credits are not separate authorization to use
them. A local implementation green light alone does not authorize those calls.

Update, 2026-11-03: the user separately authorized the Vercel setup and live
diagnostics. Those bounded diagnostic runs are complete and do not authorize
an unbounded buyer/evaluation batch. Future billable/credit-funded runs require
a concrete run scope and limit. Load the key through the runtime/SDK; do not
inspect, display, log or commit its value. No replacement key is needed for S1.

If genuine additional usage cannot be obtained within the existing restrictions,
report that model's runtime evidence as blocked. Continue independent local
work, but do not call all-eight integration complete. A future scope change
would be needed to permit excluded operations. Do not apply for partner credits
or contact organizers on the user's behalf under this plan.

If access or implementation exceeds its timebox, preserve the complete core
journey, report the missing role and revise the remaining schedule. Do not
silently replace a required model with another model or remove its acceptance.
First cut repeated simulations, extra poster variations, WhatsApp audio
transport, new dashboards and a failure-panel UI. No safety or proof cuts.

## What changes from the old 34-hour proposal

- Model use is grouped around one owner/buyer journey, with explicit receipts.
- Generic provider generalization is not a standalone prerequisite.
- Voice upload ships before optional WhatsApp audio integration.
- Four independent parties replace a new twenty-agent batch requirement.
- Glimmer's useful local role replaces the offline-clearing feature.
- SAM and Image support optional publishing, not a manufactured booking dependency.
- Existing failure coverage supplies proof instead of a five-hour fault panel.
- Accurate cohort evidence replaces a new comparison page and broad p95 claims.
- All-eight scope, access uncertainty and the user's green-light boundary remain.

## Approval and handoff

Current authorization is to prepare and review this proposal only. Merchant
validation and video remain the user's work. No code, dependencies, model calls,
production data, deployment or publication have been changed by this revision.

After scope approval, finalize the architecture and program design against the
actual baseline and unresolved external contracts. Keep those decisions reviewable;
this high-level timebox proposal is not permission to invent missing contracts
during implementation. Obtain the user's implementation green light before
starting the build.
