# Voice contract and unexecuted integration proposal

Update, 2026-11-03: the user subsequently approved this bounded run. It executed
once with exactly four successful requests and no retries. See the
[genuine run result](live-authorized-2026-11-03-01/README.md). The allowance is
consumed. The proposal and unknowns below record the pre-run checkpoint;
runtime contract compatibility is now evidenced for these two prepared inputs.
This document does not authorize another run.

Checked official documentation on 2026-11-03. No credential, model request or runtime verification was used.

## Documented contract

`POST https://api.meta.ai/v1/asr/transcribe` accepts bearer authentication and multipart `request` JSON plus an `audio` file. Use `model: muse-voice-transcribe-1.0`, `audioEncoding: WAV`, `mode: PUSH_TO_TALK`, and `Accept: application/json`. An optional `sessionId` query parameter correlates the request. The vendor caps requests at 32 MB and clips at 10 minutes; the application should impose tighter bounds. [Endpoint reference](https://dev.meta.ai/docs/api-reference/voice/transcribe).

The required audio is RIFF/WAVE, mono, signed 16-bit integer PCM at 16 or 24 kHz. Renaming another container is invalid. Buffered JSON contains `sessionId`, `transcript`, `audioDurationMs` and `turns`; turns are empty in PUSH_TO_TALK. Recognition confidence scores and word timestamps are unavailable. These are documentation claims, not empirical verification. [Voice guide](https://dev.meta.ai/docs/speech-to-text), [schemas](https://dev.meta.ai/docs/api-reference/voice/schemas).

Voice is billed at US$0.18/hour processed, rounded down to whole seconds. Wonder is US$4/M uncached input and US$20/M output tokens. Audio duration must not be recorded as token usage. Missing usage evidence leaves actual cost unknown. [Pricing](https://dev.meta.ai/docs/pricing-rate-limits).

## Bounded genuine run, requires separate approval

- Prepared inputs: [clear.wav](inputs/clear.wav), 6.4474375 seconds, SHA-256 `8c4759bcd5643bb15248c523ad707edef90a4916752009ef4d4d13afda96c90c`; [ambiguous.wav](inputs/ambiguous.wav), 1.3060625 seconds, SHA-256 `d327a817bc757a8308c5ec1e4e65fc79157d4b63e578e7e355b68931dfeedbf0`. Both are authored synthetic speech generated locally with macOS Samantha, then converted to mono 16-bit PCM at 16 kHz. Their actual bytes pass the app validator. [Audio provenance and literal texts](inputs/audio-provenance.json). They are engineering inputs, not human merchant evidence. Do not replace their bytes without repinning the approved run.
- Maximum calls: two `muse-voice-transcribe-1.0` file requests and two `muse-wonder-1.0` requests to `POST https://api.meta.ai/v1/chat/completions`. No other model, tool, retry or automatic transcript repair call.
- Wonder uses the existing owner-change schema, low reasoning and `max_completion_tokens: 1024`. Configure `maxAttempts: 1`; raw ASR fetch runs once. A timeout, malformed result or refusal stops that case. Do not inherit the text provider's default retries.
- Use an isolated local disposable database and a fresh synthetic offer: list S$6.80, discount 20%, capacity/minimum pool 8, per-agent cap 2, private floor S$5.03. The clear input asks for 25%, capacity 10, minimum pool 6 and cap 3. Review the actual transcript, correct it if necessary, then separately approve only that exact valid diff. The ambiguous input says "Make the offer a bit better" and must ask for clarification and preserve terms. Scripted owner actions remain labeled scripted; a real owner action needs its own evidence.
- Retain audio hash/format/duration, actual ASR session/result, reviewed-text revision, Wonder request/result, separate approval and database receipt. Never retain credentials or chain of thought.
- Verify no request escaped the call counter and no automatic retry occurred before reporting the result.

The conservative documented cost ceiling is **US$8.44 total**: even allowing 30 seconds of Voice costs at most US$0.0015; two Wonder requests are at most `2 × ((1,048,576 × $4 + 1,024 × $20) / 1,000,000) = $8.429568`. This deliberately uses the entire documented context maximum as an input upper bound, so it is much larger than expected cost. Cached pricing is ignored. Completion limits include reasoning tokens. This is a bound from published rates, not an invoice or expected charge. Recheck those rates before execution. [Model context](https://dev.meta.ai/docs/models), [completion token bound](https://dev.meta.ai/docs/api-reference/chat-completions/schemas).

A smaller ceiling needs an independently defensible input-token bound. Characters are not exact tokens. Official counting endpoints cover Responses and Messages requests; their results should not be claimed as exact counts for the existing Chat Completions request. [Token counting](https://dev.meta.ai/docs/token-counting).

## Remaining unknowns

Account/model access, empirical multipart acceptance, response compatibility, latency, recognition quality and billed usage remain unverified. Offline fixtures cannot satisfy genuine Voice-to-reviewed-transcript-to-Wonder-to-owner-approval acceptance. No part of this proposal authorizes execution.
