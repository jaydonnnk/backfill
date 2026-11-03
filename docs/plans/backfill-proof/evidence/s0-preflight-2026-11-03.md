# Slice 0: access and baseline audit

Completed 2026-11-03 SGT. Audit complete; all-eight runtime readiness is not.
User authorization: "start with slice 0 first" and report required `.env.local`
settings. S1 and later slices remain unstarted.

Baseline: main at `9b6819cfb43de2f45a07ca65e3a186d99cfebeb4`, with pre-existing
dirty application/docs files. Those changes were preserved. No inference,
installation, weight download, production write, deployment or publication ran.

## Credentials and configuration

- `.env.local` exists and is git-ignored. Its contents were parsed without
  printing secret values. The existing app configuration passes `webEnv`.
- `META_API_KEY` is populated. `META_BASE_URL` is `https://api.meta.ai/v1`.
  Spark and Wonder IDs match the current application configuration.
- One authenticated, read-only `GET https://api.meta.ai/v1/models` returned
  HTTP 200 with the expected catalog envelope. The configured key lists all
  five required Meta-hosted model IDs below. No generation request was made.
- `BASETEN_API_KEY` is absent. No alternative partner credential was found in
  `.env.local` or the task process's relevant exported settings. Account-level
  partner approval/credits outside those locations were not inspected.
- Existing WhatsApp settings and negotiation signing secret are populated and
  schema-valid; service authentication was not tested. No new WhatsApp key is
  needed for the proposed audio-upload-first scope.
- Both existing application database settings target remote PostgreSQL. Neither
  was used for this audit's database checks or tests.
- `TEST_DATABASE_URL` is absent from `.env.local` and the task environment.
  Tests passed with an explicitly scoped local value; the file was not edited.
- Historical OpenRouter settings remain in `.env.local`. They were not used,
  removed or restored to application code.

The catalog endpoint is documented for checking a team's enabled API models:
[Meta model catalog](https://dev.meta.ai/docs/models#list-models-via-the-api).
Catalog visibility is not a successful inference or a billing/credit check.

## Model evidence and readiness

1. **Spark `muse-spark-1.3`:** listed in the authenticated catalog. Existing
   integration and historical buyer recording present; fresh inference not run.
2. **Wonder `muse-wonder-1.0`:** listed. Existing owner/replan integration and
   a historical recording present; fresh inference not run.
3. **Image `muse-image-1.0`:** listed. Current docs identify its request and
   response formats; new integration, offline contract tests and genuine usage
   remain outstanding.
4. **Voice `muse-voice-transcribe-1.0`:** listed. Same outstanding stages as
   Image; audio conversion is an additional contract requirement.
5. **SAM `sam-3.1`:** listed. The spelling `sam-3-1` is not listed, despite
   appearing on the model marketing page. Use the catalog/API-guide spelling
   for later work. Integration, decoder verification and usage remain open.
6. **Glimmer:** no Ollama, LM Studio, llama-server or inspected Python inference
   modules found. Standard model-cache directories are absent. No weights or
   working local server were evidenced. No API key is required for the public
   local weights; actual fit, runtime and latency are unverified.
7. **Spark Open:** no partner credential or usage receipt found in this scope.
   The saved participant guide pins Baseten's hackathon ID to
   `meta-models/muse-spark-open-1026`. Do not substitute the unsuffixed docs ID
   without resolving the event-specific instruction. Partner access and actual
   model availability remain unverified.
8. **Muse Code:** existing stack documentation names it as the development
   tool. No runtime endpoint or application key is needed. This audit did not
   independently verify an IDE/account usage receipt.

## Non-chat contracts: documented, not empirically verified

These are current official-doc candidates. The earlier contradictory paths
were not resolved by executing inference. They must not be labeled live-verified
or offline-contract-tested merely because their documentation was read.

### Image

Candidate: `POST /v1/images/generations`, JSON containing `model`, `prompt`,
and `n`. The documented response contains `data` entries carrying `b64_json`
or temporary image URLs. Select PNG explicitly for a deterministic composition
path. The Responses API is also documented; one-off generation avoids needing
conversation persistence. No mask-conditioned generation is needed for this
plan's separate background plus real-photo composition.

Source: [Meta Image generation](https://dev.meta.ai/docs/image-generation).

### Voice

Candidate: `POST /v1/asr/transcribe`, bearer authentication, multipart `request`
JSON settings and `audio` file. The documented file format is mono PCM WAV,
16-bit, 16 kHz or 24 kHz. Default JSON includes transcript and audio duration;
turn records depend on mode. An arbitrary M4A/OGG/WebM upload is not the same
contract. `ffmpeg` is absent from PATH; macOS `afconvert` is present, but no
conversion was performed. Later design must choose supported WAV upload or
explicit conversion, not silently pass browser/WhatsApp containers through.

Source: [Meta speech-to-text file interface](https://dev.meta.ai/docs/speech-to-text#transcribe-a-file).

### SAM

Candidate: `POST /v1/responses`, `model: sam-3.1`, text concept plus image input,
streamed response. Output includes special-token geometry/mask data in the text
stream. It is not documented as a ready-made transparent PNG. A decoder and
source-image composition path are needed. Empty matches are valid, not proof of
a broken endpoint. This adds real work to S5's conditional timebox.

Sources: [Meta media segmentation](https://dev.meta.ai/docs/media-segmentation),
[mask output format](https://dev.meta.ai/docs/sam/reading-segmentation).

### Spark Open / Baseten

Documented base: `https://inference.baseten.co/v1`, chat-completions format with
a Baseten key. Authentication and endpoint shape are documented; neither was
tested. Event-specific model selection comes from the saved guide, not from
generic examples for unrelated models. Credit approval is not model usage.

Sources: [Baseten chat API](https://docs.baseten.co/reference/inference-api/chat-completions),
[saved guide](../../../../metahackathon.rtfd/TXT.rtf) section 6.

## Local hardware and test environment

- Apple M4 Pro, arm64, 24 GiB unified RAM confirmed by system queries.
- About 232 GiB available disk space at audit time. Available disk is not RAM.
- Node `v24.21.0` is installed. No brew/docker installation is needed for this
  audit or the existing local PostgreSQL test path.
- Postgres.app PostgreSQL 18.6 is running on `127.0.0.1:5432`. `pg_isready`
  succeeded. A read-only connection confirmed the local test administrator
  can create databases; the focused integration suite then created, migrated
  and dropped its own disposable database through the existing helper.
- Verified local test setting:
  `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres`.
- Keep the existing remote `DATABASE_URL` unchanged. Future local app rehearsals
  must use a disposable fixture, rather than launch against that remote URL.
- Official Glimmer docs list a roughly 17 GB Q4 GGUF text build and optional
  additional vision/draft artifacts. The proposed text-only task does not need
  those optional artifacts. This is a candidate, not proof of total runtime
  memory fit. Do not allocate the default large context without measurement.

Source: [Glimmer artifact options](https://dev.meta.ai/docs/muse-glimmer/get-the-model).

## Existing recording

`sim/buyers/recordings/scene.json` passed the current `Recording` schema and
legacy semantic hash check. It is V1, recorded `2026-11-01T06:07:27.248Z`, names
Spark 1.3 / Wonder 1.0 and has 20 non-null buyer replies. Its recorded total
cost is 87,823,600 nano-USD. No fresh usage or invoice reconciliation is implied.

Semantic SHA-256:
`1d7055a98e5335bef6c3561322894083b78c2eb37de3d7e46689755488361d33`.

Its verified legacy source is the synthetic café's S$6.80 list / S$5.44 offer,
20% discount, minimum 8, per-agent cap 4, for 2026-11-01. Do not present it as
new decisions for the revised four-party scenario or changed public economics.
Replay transport and clearing can be tested separately without fresh model calls.

## Focused baseline actually run

- `npm run typecheck`: passed.
- `npm run test:unit -- tests/unit/env.test.ts tests/unit/test-db-guard.test.ts tests/unit/s7-recording.test.ts tests/unit/pricing.test.ts`:
  41 tests passed in 4 files.
- `env -u DATABASE_URL -u META_API_KEY TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres npm run test:integration -- tests/integration/s5-negotiation.test.ts`:
  26 tests passed in 1 file, using only disposable local PostgreSQL.
- Existing environment schema validated without emitting secret values.
- Read-only catalog check returned HTTP 200 and all five required API model IDs.

This is a focused Slice 0 baseline, not a fresh full suite, build or browser
verification. No tests were added for this audit-only slice.

## What the user needs to supply

For the planned Baseten route, add a genuine `BASETEN_API_KEY` to `.env.local`
after obtaining the account/model access. This is the conventional credential
name; current application code will consume it only when S4 is implemented.
Do not replace `META_API_KEY` with a partner key.

No new Meta key is needed based on the successful catalog check. No Glimmer
API key is needed. Local test PostgreSQL is already available. Additional model
IDs and local service URLs can be wired during the owning slices; guessed env
names need not be added now.

Still required later: a local Glimmer runtime/weights and a genuine fit check;
rights-cleared dish photo and suitable owner audio; any permission needed for
new billable inference. None was performed or requested as a new paid action
under this slice. No balance/credit validity or successful inference was checked.
