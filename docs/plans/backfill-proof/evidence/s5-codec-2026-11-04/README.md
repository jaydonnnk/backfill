# S5 official decoder and offline verification

The user authorized @meta-sam/parser@0.1.0 installation and a bounded two-call
media run. [Installation receipt](install.json) verifies the exact integrity,
one added package, disabled lifecycle scripts and unchanged earlier package
versions. No model weights or other packages were installed.

The official parser replaces the earlier injected binary fixture decoder.
Independent literal expectations come from Meta's public one-bit and lossless
conformance vectors. Tests cover fragmentary SSE, missing components, geometry,
malformed payloads, incomplete responses and quotas before decoder allocations.
An explicit local bowl-interior correction has its own synthetic tests and is
kept distinct from the provider's raw mask.

Final local checks passed 576 tests in 62 files, typecheck, lint and 10 offline
consumption/transport guard tests. The genuine run and correction were completed
without any additional inference. The updated real and fixture production builds and all 24 combined desktop/mobile
browser checks passed. Final source hashes stayed stable; the owned server,
database, role and source snapshot were removed. [Checks](checks.json),
[source manifest](../s5-local-2026-11-04/browser-codec-accepted/source-manifest.json),
[cleanup](../s5-local-2026-11-04/browser-codec-accepted/browser-cleanup.json).

- Full suite: `archive/proof-s5-codec-full-final.log`.
- Typecheck: `archive/proof-s5-codec-typecheck-accepted.log`.
- Lint: `archive/proof-s5-codec-lint-final.log`.
- Offline guards: `archive/proof-s5-codec-guards.log`.
- Repeated combined service receipts are archived locally; see
  [publication retention](../s5-publication-2026-11-04/retention.json).
- [Genuine model results and original review state](../s5-live-authorized-2026-11-04-01/README.md).

A pre-dispatch type annotation was corrected before any call. The earlier
prepared inputs were archived with a zero-call receipt, then re-pinned. The
allocation-quota regression was observed failing before its fix and passing after.
An earlier malformed setup/source-change refusal remains in the separate original
S5 local proof. Historical S1-S4 evidence and all consumed markers remain unchanged.

The user later approved the exact composition for local use.
[Final approval](../s5-final-approval-2026-11-04-01/README.md). The original raw
SAM rice-interior miss is preserved and was corrected only from source pixels.
No public posting, new inference or production rollout is authorized.
