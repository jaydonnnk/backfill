# CPU-only Glimmer attempt stopped; S4a remains blocked

The user explicitly approved one CPU-only attempt against the
[prepared proposal](../glimmer-cpu-next-attempt.md). That proposal was pending
when written; this run is the subsequent authorized attempt.
[Authority and exact arguments](authority-and-load-attempt.json).

## Actual result

One startup on 2026-11-03 at about 20:56 Singapore time used the already verified
b10353 executable and exact pinned GGUF. Arguments kept 2048 context, one slot,
zero GPU layers, no operation offload and four CPU/batch threads. No runtime or
model substitution, download, package installation, paid call or restart occurred.

Pressure was normal at startup. At the 21st one-second sample, the kernel
reported warning level 2. The watchdog sent SIGTERM before readiness. **Zero
parser HTTP requests were dispatched**, so there are no genuine Glimmer parser
outputs, served-model identity or successful S4a acceptance claim.
[Failure](run-failure.json), [memory samples](memory-samples.json),
[startup log](model-server.txt), [baseline](memory-before.json).

Swap use stayed at 3035.38 MiB throughout these samples. The stop was caused by
pressure level 2, not the swap-growth condition. Peak sampled process RSS was
11,540,960 KiB; that is not total system or unified-memory consumption. It does
not prove a complete working-set size or that the kernel killed the process.
The runner intentionally stopped it under the approved policy.

The approved startup has been used. It must not be automatically repeated or
replaced with another configuration. Both the original full-offload and this
CPU-only load crossed the same memory guard. Approval removed the permission
block, but did not establish that the current setup can load safely.

## Read-only diagnosis after the stop

[Static memory census](static-memory-census.json) is reproduced with:

```sh
python3 scripts/verification/proof-s4-memory-census.py
```

This reads the GGUF header/tensor inventory and a post-stop OS process snapshot.
It never executes a model. The artifact contains 731 tensors and a
16,743,567,360-byte aligned tensor-data region. Its architecture is
`muse-glimmer`; metadata declares 52 blocks and training context 131072. The
attempt requested 2048, not the training default. File size is not runtime RAM.

The tested premise was that changing GPU placement alone would make this same
artifact load below the agreed pressure boundary. Both attempts failed that
boundary. Post-stop process RSS cannot identify allocation ownership at the
failure peak, and current logs do not contain per-buffer allocation detail.
The exact loader working-set cause remains **unknown**. These observations do
not prove that all 24 GiB configurations fail or justify buying hardware.

The installed help says repacking is enabled by default and mmap is the default
load mode. The pinned upstream [CPU repack implementation](https://raw.githubusercontent.com/ggml-org/llama.cpp/f8def7fe168bab245fbf15d3f18b26dbb1ef73c8/ggml/src/ggml-cpu/repack.cpp)
allocates CPU buffers; the [loader](https://raw.githubusercontent.com/ggml-org/llama.cpp/f8def7fe168bab245fbf15d3f18b26dbb1ef73c8/src/llama-model-loader.cpp)
can use mapped data or copy tensors into other buffers. These are possible
allocation paths, **not proof that repacking or duplicate buffers caused either
stop**. No third load, flag change or relaxed pressure threshold was tested.

The remaining prerequisite is an evidenced memory-feasible Glimmer load,
followed by the bounded parsing and review tests. Further runtime attempts need
a new concrete plan; repeating the same load would not resolve the unknown cause.

## Scope and preservation

Typecheck, lint, offline preflight and an independent read-only harness review
passed before startup. [Typecheck](typecheck.txt), [lint](lint.txt),
[preflight](preflight.txt). The runner pins the prior 101-file product manifest,
original six inputs and artifact hashes, reserves its startup with exclusive
creation, and reserves each request before dispatch. No request slot was used.

The local parser transport rejects Meta and Gateway addresses before upstream
network access. `SELECT 1` succeeded on the owned disposable PostgreSQL database.
[Network/database condition](network-condition.json). This is not a claim of
fully offline pooled booking.

[Cleanup](cleanup.json) confirms the model stopped, no owned database remained,
no new role was created and no restart occurred. The previously verified S4b
five-call evidence and closed allowance remain unchanged. No production, S5,
commit, merge, push, deployment, real env-file inspection or credentials were used.
Product source did not change. **Full S4 remains incomplete.**
