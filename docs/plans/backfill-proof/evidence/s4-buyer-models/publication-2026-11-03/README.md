# S4 publication checkpoint, 2026-11-03

The user authorized cleaning the working tree, committing necessary S4 work and
pushing to main. This checkpoint includes the completed buyer UI/API/session
services, transaction-safe MCP reuse, migration 0016, tests and guarded proof
runners, current docs and auditable evidence. Parent is `b1df9ad`.
No S5 implementation, new inference, credit purchase, production access/write,
installation/download or deployment is included. Every publication commit uses
`[skip render]`. Migrations 0015/0016 remain local-only.

## Checks

Fresh **550 tests in 57 files**, typecheck, lint and **five offline guard tests**
passed. Whitespace checking excludes immutable raw `.txt` receipts, which retain
provider/test-tool formatting such as carriage returns and trailing spaces.
Source, Markdown and other artifacts pass the staged whitespace check. [Full suite](full-tests.txt), [typecheck](typecheck.txt), [lint](lint.txt),
[guard tests](guard-tests.txt). An allowlisted original production webpack build
passed with dummy configuration and no env files. [Build](production-build.txt),
[exact build-source hashes](build-manifest.json), [cleanup](build-cleanup.json).
The temporary source/build copy is removed; no app server/database was created.

All 101 product files match the prior NVIDIA browser snapshot with two production
builds and **22 combined desktop/mobile Chromium checks**. No product source
changed during publication cleanup. The genuine model outputs remain the two
separately authorized NVIDIA outputs and the five original Spark Open decisions;
publication checks make no new provider call or fresh-live-browser claim.

Independent read-only whole-change review found no actionable P0/P1/P2 defect.
[Review](review.json). Local Markdown links resolve. [Link audit](link-check.json).
Candidate credential scan found no matching token/private-key patterns or real
env-file candidates. It does not replace normal ignored configuration handling.
[Scan](credential-scan.json). Real env files were never opened or copied.

The no-mistakes CLI is absent, and installation is outside scope. Repository
checks and the independent review above form the publication gate. No unavailable
pipeline result is claimed. GitHub CI runs on push; its eventual status must be
reported separately from these local results.

## Evidence cleanup

114 duplicate fixture/combined-regression screenshots, 39,462,019 bytes, are
preserved locally under ignored `archive/proof-s4-publication-2026-11-03/`.
[Every moved path/hash](archived-captures.json). They are not included in Git.
All eight genuine S4b captures and six final NVIDIA buyer captures remain in this
checkpoint. All actual outputs, consumed markers, usage/failure/memory receipts,
source hashes and useful red/green/build/test logs remain. Old evidence hashes
can be reconstructed using the archive manifest; moved bytes were not deleted.
Historical docs affected by archive notices have exact prior text snapshots here.
[Preservation audit](preservation-after.json).

S4a and S4b bounded synthetic acceptance are complete. [S5 readiness](../../../s5-readiness.md)
separates local engineering readiness from missing rights-cleared photo/terms,
SAM mask decoding and genuine media-access/output proof. S5 calls need new scope;
old allowances remain consumed. Merchant validation and video stay user-owned.
