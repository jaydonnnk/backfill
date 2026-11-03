# S3 genuine integration passed

Completed 2026-11-03 at 14:24 Singapore time. The user approved at most two
Voice calls and two Wonder calls, no retries, maximum US$8.44. Exactly four
requests returned HTTP 200. **S3's remaining genuine integration gate is met**
for these prepared synthetic speech inputs and scripted owner actions.

## Actual results

- Clear ASR returned: "Set the discount to 25%. Capacity to 10. Minimum pool
  to 6. And per agent cap to 3." The authenticated browser saved that actual
  transcript unchanged at review revision 1. Wonder returned 25%/10/6/3.
  The database remained at v1, 20%/8/8/2 before approval. A distinct browser
  approval action then applied the exact proposal at v2. Window and private
  floor were preserved. [ASR](voice-clear-result.json),
  [Wonder](wonder-clear-result.json), [review](review-clear.json),
  [state before approval](clear-proposed-state.json).
- Ambiguous ASR returned "Make the offer a bit better." Its unchanged reviewed
  text produced `understood: false`, the current four values and a clarification
  request from Wonder. The separate offer stayed at v1 with zero own approvals.
  [ASR](voice-ambiguous-result.json), [Wonder](wonder-ambiguous-result.json),
  [review](review-ambiguous.json), [unchanged state](ambiguous-proposed-state.json).
- [Acceptance audit](acceptance-audit.json) links each owner, rule, audio hash,
  ASR/review revision, proposal and approval. Its outcome counts filter by that
  case's proposal IDs. Raw UI receipts also include the disposable database's
  complete outcome table, which contains the earlier clear case's approval.
  That row is not attributed to the ambiguous owner.

## Provenance and limits

Both WAV files contain actual locally synthesized speech, generated with macOS
Samantha. Their exact bytes/hashes are in [input provenance](../inputs/audio-provenance.json).
They are not human recordings or merchant-validation evidence. Unlike the
earlier silent fixtures, these files were genuinely sent to the approved ASR
endpoint. Voice and Wonder outputs are actual provider results, not fixtures.
Only bounded transcript/decision/usage fields are retained; hidden reasoning
and credentials are excluded.

The owner identities and existing offers are synthetic local test data, seeded
in a disposable database. New offer creation/menu vision is outside this S3
proof. The browser performed review and approval as explicit scripted actions
using the actual authenticated UI. This is not real-person merchant consent.
No transcript correction was needed in these two examples. The earlier offline
proof covers corrections, cancellation, ownership, stale state and failures.

Wonder's clear reply used the word "Confirmed" before application. That is its
actual bounded wording, retained unchanged. The UI explicitly states that the
offer is unchanged and requires separate approval; stored v1/v2 states prove
the separation. The ambiguous reply is bounded to 300 characters and ends
mid-phrase, but its clarification/refusal and unchanged values are explicit.
These copy limitations were not repaired with extra model calls.

## Calls and cost

The [one-shot authority](dispatch-session.json) and four `*-dispatch.json`
records reserve each attempt before HTTP. A failed request would consume its
slot too. Only the two exact Meta endpoints, pinned WAVs, Wonder model, strict
OwnerChange schema, low reasoning and 1024 output-token bound are allowed.
Redirects, other hosts, other generation fields and duplicate dispatches are
blocked. [Guard tests](guard-tests.txt), [plan and commands](plan.md).

ASR response duration was 6480 ms and 1360 ms. Wonder reported 353 input/370
completion tokens for clear, and 334 input/365 completion tokens for ambiguous,
with zero cached input. Completion counts include any billable reasoning;
reasoning text is not retained. At the checked
[published rates](https://dev.meta.ai/docs/pricing-rate-limits), Wonder estimates
US$0.017448 and seven whole audio seconds estimate US$0.000350, totaling
**US$0.017798**. This is a calculated rate estimate, not an invoice or an
account-credit measurement. Actual billed cost remains unknown. The approved
US$8.44 ceiling was conservatively bounded by model context, not a charge.

All four slots are consumed. **Do not rerun `--execute`.** No additional call
or retry is authorized. The durable one-shot marker and per-case slots remain.

## Verification and captures

[Production webpack build](production-build.txt), [launcher](launcher.txt),
[actual UI/database receipt](ui-receipt.json), [run result](run-result.json),
[typecheck](typecheck.txt), [harness lint](harness-lint.txt),
[guard tests](guard-tests.txt). No product file changed for this live proof;
all 90 product files match the prior offline source manifest. Its 522 tests and
17 Chromium checks remain current for the same product bytes. This run adds
two genuine browser journeys with the real adapters and no fixture substitution.

Actual captures at 1280/375, with PNG widths and no horizontal overflow checked:

- [Clear transcript desktop](clear-transcript-1280.png) and
  [mobile](clear-transcript-375.png).
- [Exact proposal desktop](clear-unapproved-1280.png) and
  [mobile](clear-unapproved-375.png).
- [Applied terms desktop](clear-applied-1280.png) and
  [mobile](clear-applied-375.png).
- [Ambiguous transcript desktop](ambiguous-transcript-1280.png) and
  [mobile](ambiguous-transcript-375.png).
- [Clarification desktop](ambiguous-clarification-1280.png) and
  [mobile](ambiguous-clarification-375.png).

Desktop proposal, mobile applied and mobile clarification were visually
inspected. The existing Kopi assistant can overlap text while its message is
open; its close control remains available. No design change was made.

The parent checked explicit loopback configuration before any app startup and
never loaded credentials. Only normal Node application startup loaded the
existing env configuration; its contents/key were not inspected, printed or
copied. Explicit child settings overrode the hosted DATABASE_URL and disabled
other transports. The isolated source copy excluded env files, Git, archive
and build output. Database migrations ran only on the owned disposable database.
The final audit independently confirmed zero owned databases/roles and a stopped
server. No production access/write, commit, merge, push, deployment or S4 work.

The original offline result remains in `../offline-result.json`. Its final
manifest describes that earlier checkpoint; documentation and current-result
updates are bound by this run's [SHA256SUMS](SHA256SUMS). Original checkpoint
docs/manifests are also retained in the ignored local archive.
