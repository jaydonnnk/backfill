# Proposed second Glimmer load attempt, not yet authorized

The first approved b10353/GGUF load started at normal memory-pressure level 1.
After 15 one-second samples the kernel reported warning level 2. The watchdog
stopped the owned process before readiness and before any inference. This proves
that this load attempt crossed the approved pressure boundary. It does not prove
that Glimmer can never run on a 24 GiB Mac.

The approved plan explicitly says: "Stop on warning/critical pressure or sustained
swap growth; no automatic restart or runtime/model substitution." That boundary
fired. The prior "All is granted" approval is not authority for a second load
attempt with different GPU allocation. No second attempt has occurred.

A reviewable next action is one CPU-only load attempt using the already verified
runtime and exact same 16,756,683,904-byte weight file. No installation, download,
paid call, account change or hardware purchase is needed.

- Exactly one startup, no restart or automatic retry.
- `-ngl 0 --no-op-offload -t 4 -tb 4` instead of full Metal layer offload.
- Keep context 2048, one slot, at most 512 output tokens and 60 seconds per
  request. At most the six original local parsing cases, each dispatched once.
- Bind only to loopback, use a fresh owned output directory and durable local
  attempt slots. Reserve attempts before dispatch and save final JSON only.
- Measure pressure, swap and process RSS before and throughout. Refuse startup
  unless pressure is normal. Stop immediately on warning/critical pressure or
  two samples showing swap growth above the agreed baseline margin. No attempts
  on a replacement runtime, smaller model or altered prompt/output cap.
- CPU speed, fit and successful JSON completion within 60 seconds are unknown.
  A failure remains a failure; it does not authorize increasing the timeout.

The five paid Gateway slots are consumed and remain closed. Any later integrated
proof must use the retained genuine Gateway decisions as explicitly labeled
recorded replay, with identical inputs, or obtain a new separately scoped paid
approval. Never relabel replay as a fresh Gateway decision. Existing original
provider decisions and their actual usage/provenance remain independently verified.

This document is a proposal only. It creates no authority to restart Glimmer.

Exact proposed startup, not executed:

```sh
/Users/jayd0/Desktop/meta-hack/archive/proof-s4-models/runtime-b10353/llama-b10353/llama-server \
  -m /Users/jayd0/Desktop/meta-hack/archive/proof-s4-models/Muse-Glimmer-30B-KQuant-17GB-Q4_K_M.gguf \
  --alias muse-glimmer-s4 -c 2048 -np 1 -ngl 0 --no-op-offload -t 4 -tb 4 \
  --host 127.0.0.1 --port 8088 \
  --chat-template-kwargs '{"reasoning_strength":"low"}'
```

Proposed evidence destination:
`docs/plans/backfill-proof/evidence/s4-buyer-models/glimmer-cpu-authorized-2026-11-03-01/`.
The directory/authority marker must only be created after a fresh approval.
