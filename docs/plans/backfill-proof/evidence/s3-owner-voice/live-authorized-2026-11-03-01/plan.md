# Approved S3 genuine-model run

User authority: "Approved" after the step-by-step proposal for at most two
Voice calls and two Wonder calls, no retries, US$8.44 ceiling, prepared synthetic
speech, scripted owner review/approval, disposable local database only.
No commit, push, deployment, production access/write or later slice is authorized.

Date: 2026-11-03. Product source remains identical to the verified offline S3
snapshot. Git HEAD is `96a3cb76ba757fc252e398757ce55ceebb895a66`; existing S3
changes remain uncommitted on `backfill/proof-s3-owner-voice`.

The input files and hashes are pinned in `../voice-contract.md`. ASR endpoint:
`https://api.meta.ai/v1/asr/transcribe`, model `muse-voice-transcribe-1.0`,
JSON multipart settings, supported WAV. Wonder endpoint:
`https://api.meta.ai/v1/chat/completions`, model `muse-wonder-1.0`, low reasoning,
1024 maximum completion tokens, strict existing OwnerChange schema, no tools.

Official pricing/context checked again before dispatch:
[rates](https://dev.meta.ai/docs/pricing-rate-limits),
[context](https://dev.meta.ai/docs/models),
[ASR contract](https://dev.meta.ai/docs/api-reference/voice/transcribe).
Voice remains $0.18/hour; Wonder remains $4/M uncached input and $20/M output.
Maximum context 1,048,576 tokens. The conservative four-call reserve is
`2 * $4.214784 + 2 * $0.00075 = $8.431068`, below the approved $8.44.
Actual invoice cost remains unknown; no account billing mutation/read is needed.

Verification-only guard preloads the unchanged application. Only those two Meta
endpoints are allowed. Durable exclusive dispatch slots permit one request per
model/case, including failures and lost responses. Exact WAV hashes, model,
completion bound, schema and reviewed-text linkage are checked before dispatch.
No redirects, retries, repair calls or other network providers. Outputs retain
bounded actual transcript/decision/usage, never credentials or hidden reasoning.

Only the normal application process loads its existing runtime configuration.
The agent does not open/inspect/print/copy `.env.local` or credential contents.
The parent never loads credentials. Explicit child environment pins the
disposable local DATABASE_URL and disables other transports. Source snapshot
excludes env files/archive/Git/build output; build uses dummy credentials.

The browser uploads real synthetic speech bytes, reviews actual ASR text without
automatic replacement, requests actual Wonder output, and separately approves
only exactly 25%/10/6/3. The ambiguous case must clarify and apply nothing.
All owner actions are scripted test actions, not real-person merchant evidence.
A failed case stops the run without retries. All database/server/login/snapshot
resources are owned and removed in finally; evidence remains for review.

Preflight commands:

```sh
node --test scripts/verification/proof-s3-live-guard.test.mjs
npm run typecheck
npx --no-install eslint scripts/verification/proof-s3-live.ts scripts/verification/proof-s3-live-ui.ts scripts/verification/proof-s3-live-guard.mjs scripts/verification/proof-s3-live-guard.test.mjs
env -u DATABASE_URL -u META_API_KEY -u AI_GATEWAY_API_KEY \
  TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres \
  S3_LIVE_APPROVED=2026-11-03-4-calls-usd8.44 \
  node --import tsx scripts/verification/proof-s3-live.ts
```

Live command adds `--execute`. A durable one-shot session marker prevents
accidental re-execution. No live request is made by preflight or ordinary tests.
