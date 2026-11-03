# S4 publication checks

Original publication was commit `cdb292d`, with `[skip render]`. Its
[GitHub CI passed](https://github.com/jaydonnnk/backfill/actions/runs/41662695578).
Fresh local 550 tests in 57 files, typecheck, lint and five offline guards passed.
[Suite](full-tests.txt), [guard tests](guard-tests.txt), [independent review](review.json).

[Original production webpack build](production-build.txt) passed in an allowlisted
copy with dummy settings and no env files. [Build hashes](build-manifest.json),
[cleanup](build-cleanup.json). All 101 product files match the final
[22-check browser snapshot](../nvidia-migration-2026-11-03-01/README.md).
No new inference, production rollout or S5 implementation occurred.

The first publication retained too much intermediate evidence. The follow-up
cleanup archives repeated logs, superseded plans and historical snapshots locally;
see the current [retention record](../retention.json). Immutable original receipts
and consumed markers remain. Earlier publication scan/manifests and duplicate
capture maps remain in the ignored local archive and parent `cdb292d`.

[S5 readiness](../../../s5-readiness.md) separates local engineering readiness
from rights-cleared inputs, SAM/Image contract/output proof and new call approval.
Migrations 0015/0016 remain local-only. No production deployment is authorized.
