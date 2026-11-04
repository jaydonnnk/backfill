# S5 publication checks, 2026-11-04

The user authorized committing and pushing Slice 5 only. S6 implementation,
cases, reports and tests remain local. Shared status/continuation documents are
staged with S5-only content while their S6 working versions remain unchanged.

The checkpoint includes the approved photo-asset workflow, official SAM decoder,
local migration 0017, guard/tests and compact proof receipts. The final asset is
approved for local use only. The raw SAM rice-mask miss, explicit local correction,
original-photo pixel proof and both consumed media slots remain inspectable.

Private source photo, raw photo-bearing request/media, approved PNG and full state
remain under ignored archive/. No real image is posted or included in Git.
Fixture captures are labeled. Earlier S1-S4 receipts/markers remain unchanged.

Validation runs against the exact staged S5-only tree in an env-free disposable
source copy with dummy model configuration and explicit loopback PostgreSQL.
It must pass typecheck, lint, the S5-only full test suite, offline guard tests,
both real/fixture production builds and combined desktop/mobile browser checks.
No new inference, production access/write/migration or deployment is permitted.
The commit message contains [skip render]. Production migrations 0015/0016/0017
and public posting remain separate. CI status will be checked after the push.

Publication review found a mask-quota whitespace bypass: the official grammar
accepts `data =`, while the local preflight checked only `data=`. A small safe
regression failed before the fix. Preflight now parses trimmed token fields before
any decoder allocation, and both normal/spaced limit checks and valid spaced
pixel decoding pass. This is an S5 security fix; S6 source and evidence are untouched.

## Results

The exact staged S5-only source passed 578 tests in 62 files, typecheck, lint,
10 offline guard tests, both real/fixture production builds and 24 combined
browser checks. [Checks](checks.json), [code hashes](staged-code-manifest.json),
[browser source hashes](source-manifest.json), [browser results](browser-results.json),
[build results](build-results.json), [desktop capture](review-1280.png),
[mobile capture](review-375.png), [cleanup](cleanup.json).

The source-copy setup initially omitted the tracked blank .env.example required
by one contract test. Only that example template was restored for the full unit
run; real .env/.env.local files remained absent, and neither production build
copied env files. The setup failure and raw logs are preserved in the local archive.

The whitespace-quota fix was additionally checked by offline decoding of the
saved genuine SAM response and deterministic recomposition. The corrected cutout
and final PNG still match the owner's approved hashes, with all 403,621 selected
source pixels unchanged. [Replay proof](saved-output-replay.json). No new model
call, image posting, production change or deployment occurred during validation.
S6 working-file hashes and all original S5 consumption receipts remain unchanged.
