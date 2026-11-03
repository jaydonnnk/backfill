# S3 local implementation decisions

Recorded before implementation, 2026-11-03. Clean main at
`96a3cb76ba757fc252e398757ce55ceebb895a66`; work continues on
`backfill/proof-s3-owner-voice`. User authorizes local S3 only. No env-file
access, billable inference, persistent migration, publication or deployment.

- Add one voice-edit panel per existing offer in the authenticated merchant
  workspace. Upload supported WAV, correct/review transcript, request proposal,
  inspect exact four-field before/after diff, then separately approve its ID.
  Editing text immediately removes the approval UI and server-side review
  invalidates the previous proposal. Discard is a server action too.
- Accept only byte-validated RIFF PCM WAV: mono signed 16-bit, 16/24 kHz,
  at most 60 seconds and 3 MB. No platform-dependent converter or new dependency.
- Keep web voice identity separate from WhatsApp. Add owner-bound edit storage
  with audio hash/format/duration, raw transcript provenance, reviewed revision,
  proposal link and explicit approval outcome. Do not retain audio bytes.
  Extend owner_changes to distinguish real WhatsApp source from web voice,
  reuse OwnerChange/judgeOwnerChange and authoritative apply_owner_change
  validation. Never route audio text through handleMessage/readIntent confirm.
- Reserve each upload/proposal before contacting a model. A retry reads its
  saved state, never automatically requests inference again. Cancel/review
  racing with an in-flight request prevents its result from becoming actionable.
  Rule/version/revision/owner/proposal matching is checked again under locks.
- Unsupported window/private-floor requests, including mixed requests, refuse
  all edits and explain the existing menu-review/manual route. Ambiguity asks
  for a corrected explicit instruction. Bound all returned text and parse model
  output again. A transcribed yes/okay can never approve anything.
- Voice adapter uses documented ASR endpoint and one request, with a timeout.
  Wonder uses existing adapter with maxAttempts 1. Audio cost/usage is recorded
  separately from tokens; unavailable cost stays null. No adapter is executed
  against a real provider in this task.
- Substitute labeled fixtures only at Voice/Wonder boundaries, through real
  UI/service/database transitions. Isolated source copies exclude archive,
  .env*, Git, builds and unrelated material. S3 evidence paths never overwrite
  S1/S2. Repeat the fresh owner journey twice and run combined regressions.

Full acceptance requires genuine Voice -> reviewed transcript -> Wonder ->
separate approval evidence. Offline results cannot satisfy that requirement.
