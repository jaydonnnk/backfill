# Separate S4 authorities still needed

No approval below has been granted. Local implementation and fixture proof do
not satisfy either genuine model gate. These approvals do not authorize S5,
production, publication, account changes or credit purchases.

## A. Install one pinned local runtime

Approve downloading and extracting only:

- Source: [llama.cpp release b10353](https://github.com/ggml-org/llama.cpp/releases/tag/b10353).
- Source commit: `f8def7fe168bab245fbf15d3f18b26dbb1ef73c8`.
- File: `llama-b10353-bin-macos-arm64.tar.gz`, exactly **11,039,814 bytes**.
- SHA-256: `de1337374968675e57cb3c7782b91775213464c38b054e280f92b1ff2f36bed8`.
- Download destination: `/Users/jayd0/Desktop/meta-hack/archive/proof-s4-models/downloads/llama-b10353-bin-macos-arm64.tar.gz`.
- Extraction destination: `/Users/jayd0/Desktop/meta-hack/archive/proof-s4-models/runtime-b10353/`.

Verify the downloaded digest, inspect the archive paths before extraction and
record the actual executable path/version/hash. Do not use an installer shell,
Homebrew, pip, global PATH changes or optional dependencies. Official Meta
[runtime documentation](https://dev.meta.ai/docs/muse-glimmer/deploy) requires
b10353 or newer for Muse Glimmer. Compatibility is documented, not tested here.
The archive's internal executable layout is not yet inspected.

## B. Download one pinned weight file

This is separate from runtime installation permission.

- Repository: [meta-models/Muse-Glimmer-30B-GGUF](https://huggingface.co/meta-models/Muse-Glimmer-30B-GGUF).
- Revision: `b44f1072cf75e918a1b82a3a17b45c4389b076e7`.
- File: `Muse-Glimmer-30B-KQuant-17GB-Q4_K_M.gguf`.
- Size: exactly **16,756,683,904 bytes**, from public artifact metadata.
- SHA-256: `4cc57c0f51040a226e5a72cc47b7613f7772950e460a665f7083de89f183f60e`.
- Destination: `/Users/jayd0/Desktop/meta-hack/archive/proof-s4-models/Muse-Glimmer-30B-KQuant-17GB-Q4_K_M.gguf`.
- Pinned download URL: `https://huggingface.co/meta-models/Muse-Glimmer-30B-GGUF/resolve/b44f1072cf75e918a1b82a3a17b45c4389b076e7/Muse-Glimmer-30B-KQuant-17GB-Q4_K_M.gguf`.

Combined runtime archive plus weights: **16,767,723,718 bytes**. No projector,
draft model, bf16 checkpoint, new hardware or additional model is included.
No account/key is documented for these public artifacts.

After both A and B, serve text only on `127.0.0.1:8088`, alias
`muse-glimmer-s4`, one slot, **2048 context tokens**, **512 output tokens**,
low reasoning and 60-second request timeout. The planned llama-server arguments:

```sh
-m /Users/jayd0/Desktop/meta-hack/archive/proof-s4-models/Muse-Glimmer-30B-KQuant-17GB-Q4_K_M.gguf \
--alias muse-glimmer-s4 -c 2048 -np 1 -ngl 99 \
--host 127.0.0.1 --port 8088 \
--chat-template-kwargs '{"reasoning_strength":"low"}'
```

Record actual runtime startup arguments, loaded weight path/hash, process
identity, server-reported model metadata and context allocation. The alias is
not weight identity. Keep final JSON only, never reasoning. Recheck argument
support with the pinned binary before startup; do not silently switch runtime.

This Mac reports **25,769,803,776 bytes RAM, 24 GiB**. No llama-server, llama,
Ollama, lms or cmake executable was found on PATH. This is not an exhaustive
installation audit. Weight size is not total working memory. Measure
`memory_pressure -Q`, `vm_stat`, process RSS and swap before startup and during
one request. Stop on warning/critical pressure or sustained swap growth; no
automatic restart or runtime/model substitution. Fit and latency remain unknown.

Use six bounded local parser requests: four independent eligible requests,
one incompatible-budget request and one ambiguous request. Explicit date/time
cases use the disposable offer's Singapore occurrence; record its reference
clock. An example eligible input is "Two for kopi on YYYY-MM-DD from 14:00 to
17:00, SGD6 each." The refusal uses SGD1 each. The ambiguous request is
"Tomorrow afternoon for two; I haven't decided my budget." Unknown time bounds
and budget must remain unknown. Keep Meta API unreachable and the disposable
PostgreSQL reachable; prove both conditions, without claiming offline booking.

## C. One paid Gateway test, at most five attempts, US$6.57 ceiling

Approve only four distinct synthetic eligible parties of two and one fifth
incompatible party in a separate rule/occurrence. Each has an independent
credential, request, reviewed constraints, decision and exact approval. No
holiday smoke, retries, extra sample, account change or top-up is included.

- Installed SDK `ai` 7.0.162.
- Route `https://ai-gateway.vercel.sh/v4/ai/language-model`.
- Model `meta/muse-spark-open`; ordinary JSON final text, strictly parsed.
- Low reasoning, **512 maximum output tokens**, **45 seconds**, `maxRetries: 0`.
- `providerOptions.gateway.only = ['baseten']` limits provider fallback. This
  remains Gateway access; it does not establish a direct Baseten integration or
  bonus eligibility. The actual supplied routing metadata must be retained.
- Use existing `AI_GATEWAY_API_KEY` via normal approved runtime loading. Never
  inspect, print, copy or commit the key or real env files. Explicit local
  database configuration must be checked before any env loader runs.
- Freeze each actual public prompt before dispatch. No floor, merchant rationale,
  owner transcript, owner audio or credentials enter it. No native structured
  output capability is assumed. If the model truncates JSON, retain the failure
  and stop that case; do not increase output limits or retry without approval.
- Each `eligible-1` through `eligible-4` and `refusal-1` durable slot is reserved
  before network dispatch, including failed/lost-response attempts. Use
  `scripts/verification/proof-s4-live-guard.mjs`; its offline tests cover changed
  prompts, settings, extra cases, redirects/other hosts, restarts and failures.

The public [Gateway endpoint catalog](https://ai-gateway.vercel.sh/v1/models/meta/muse-spark-open/endpoints)
was retrieved 2026-11-03. The Baseten route lists input US$0.00000125/token,
output US$0.00000425/token, context 1,048,576, request charge zero and internal
reasoning surcharge zero. The ceiling deliberately allows a full context of
input per attempt, despite the much smaller 16,384-byte request guard:

`5 * (1,048,576 * 0.00000125 + 512 * 0.00000425) = US$6.564480`.

Round the authorized ceiling up to **US$6.57**. This is a conservative
published-rate limit, not an expected charge, invoice or observed credit
balance. Recheck public rates before dispatch; if they rise, stop for a revised
approval. Capture actual usage and rate estimates separately from invoiced cost,
which remains unknown unless independently supplied. There is no permission to
buy credit if the existing account balance is insufficient.

After approval, retain genuine outputs and runtime receipts in a fresh S4-owned
run directory, feed them through the existing reviewed buyer/MCP workflow, and
verify exact pending/settled database state. Use explicit scripted buyer actions
and label them as such. Keep all earlier fixture/failure evidence distinct.

[Prepared exact synthetic requests](proposed-inputs.json) pin Thursday
2026-11-05, 14:00–17:00 Singapore time, commitment deadline noon. The two-person
SGD12-total case must resolve to SGD6 per cover. The refusal's SGD1 budget is
incompatible with SGD5.44. The sixth local-only ambiguity case never dispatches
Gateway. If that fixed deadline has passed before approvals arrive, prepare a
new dated run proposal; do not relabel these inputs or silently shift a replay.
Actual public prompts, rule IDs and session reference clocks must be frozen
from the disposable run before each approved dispatch.
