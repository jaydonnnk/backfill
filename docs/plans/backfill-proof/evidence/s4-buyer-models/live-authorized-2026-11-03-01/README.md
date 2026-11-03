# S4b genuine proof passed; S4a stopped for memory pressure

The user granted all three scoped approvals on 2026-11-03: pinned runtime
installation, pinned Glimmer weight download and up to five Gateway attempts
within US$6.57, without retries. [Authority](authority.json),
[exact approved plan](../next-approvals.md), [prepared inputs](../proposed-inputs.json).
This supersedes the earlier blocked/no-authority notes for these specific actions.

## Genuine Gateway result

Exactly **five** Gateway requests returned HTTP 200. Four distinct synthetic
parties each returned two covers, then separately reviewed/approved exact terms
and submitted through the actual authenticated UI, MCP and local PostgreSQL.
Before settlement, eight covers were pending and zero were filled. A service
clock advanced the synthetic November 5 deadline for this local test; settlement
stored exactly eight filled covers. The test did not wait until November 5.
Repeating an approved submission returned the same commitment without duplication.

The fifth synthetic party used a separate rule/occurrence and budget SGD1 per
person. Its actual model decision was zero covers because the price was SGD5.44.
It recorded no approval and submitted no commitment. It did not replace an
eligible party in the eight-cover case.

[UI/database audit](ui-and-database-audit.json),
[independent acceptance and cost audit](acceptance-and-cost.json),
[five actual recordings with offline replay checks](replay-audit.json).
The replay checks made no network request, rejected another party/occurrence,
and refused to fabricate missing Glimmer output. Original decisions remain
provider evidence; replay is explicitly labeled recorded replay.

Actual SDK usage totals **2447 input tokens and 1558 output tokens**. Routing
metadata supplied `baseten` for every request. Access was through Vercel AI
Gateway, not a direct Baseten integration, and this does not establish bonus
eligibility. No hidden reasoning text is retained. The adapter did not retain
cache-token breakdown, so charging all input at the checked uncached public
rate gives **US$0.00968025**. This is a published-rate estimate, not an invoice.
Actual invoiced cost remains unknown. [Rates checked immediately before dispatch](pricing-at-dispatch.json).

All five paid attempt slots are consumed. Failed or lost-response attempts would
also have consumed a slot. Do not rerun `proof-s4-live.ts --execute`, clear its
markers, enlarge the allowance or make another provider request under this approval.

The menu, parties and offer economics are synthetic. The browser's approvals
are scripted agent actions, not real-person consent or merchant validation.
Constraints were manually entered from the exact approved requests because
Glimmer was unavailable. They were not represented as Glimmer output.
Checkout, savings and settlement are simulated; no payment or attendance is proven.

## Glimmer installation and stopped load

Both downloads match the approved exact sizes and SHA-256 hashes.
[Downloaded weight verification](download-verification.json),
[runtime archive inventory and hash](runtime-inventory.json),
[actual runtime version](runtime-version.txt), [startup arguments](runtime-startup.json).

The runtime reports b10353, commit `f8def7fe1`, Darwin arm64. The verified model
is `Muse-Glimmer-30B-KQuant-17GB-Q4_K_M.gguf` at revision
`b44f1072cf75e918a1b82a3a17b45c4389b076e7`, SHA-256
`4cc57c0f51040a226e5a72cc47b7613f7772950e460a665f7083de89f183f60e`.
The files remain under ignored `archive/proof-s4-models/`; no global PATH,
Homebrew, pip, projector, draft model or additional dependency was installed.

Before the load, pressure was normal and swap use was 3248.38 MiB. After fifteen
one-second samples, pressure became warning level 2 and swap was 3371.44 MiB.
The watchdog sent SIGTERM before readiness. **Zero Glimmer inference requests
were dispatched.** There is no served-model identity or local parser output to
claim. The load was not retried. [Memory samples](memory-samples.json),
[stopped-load status](glimmer-blocked.json), [startup log](glimmer-server.txt).

Process RSS peaked at 11,962,768 KiB in the samples. RSS is not total unified
memory consumption and does not establish a complete GPU/OS working-set size.
This one stopped load does not establish that every possible configuration fails
on 24 GiB RAM. A [separate CPU-only attempt proposal](../glimmer-cpu-next-attempt.md)
is prepared but unapproved. The prior plan explicitly forbids automatic restart.

## Verification and isolation

Before genuine inference, typecheck, lint and **543 tests in 56 files** passed.
[Full suite](full-tests.txt), [typecheck](typecheck.txt), [lint](lint.txt),
[three offline durable dispatch/network-policy tests](guard-tests.txt),
[nonexecuting preflight](preflight.txt), [original production webpack build](production-build.txt).

Review caught the Gateway text prompt omitted its explicit JSON field contract.
The installed-SDK assertion failed first, then passed with exactly `covers` and
`reason` specified. [Red](json-contract-red.txt), [green](json-contract-green.txt).
Independent Gateway recordings now preserve missing parser evidence as null;
replay refuses to invent it. This supports the separately verified S4b role.
[Live source manifest](live-source-manifest.json) declares these two small changes
from the prior offline checkpoint. All 101 copied product/public/simulation files
match the genuine build/root bytes; no model dependency was replaced by a fixture.

Only the owned application process loaded normal runtime configuration, with an
explicit disposable local DATABASE_URL override. The parent used a dummy SDK key
for offline envelope preparation. No credential or real env file was inspected,
printed or copied. Source snapshots excluded env files, Git, archive and builds.
The preload blocked direct Meta API requests before upstream dispatch while
`SELECT 1` proved the shared disposable database reachable. This is a deliberately
restricted network condition, not fully offline booking. [Network receipt](network-condition.json).

Actual 1280/375 captures, with PNG widths and no horizontal overflow asserted:
[unapproved desktop](genuine-unapproved-1280.png),
[unapproved mobile](genuine-unapproved-375.png),
[pending desktop](genuine-pending-1280.png),
[pending mobile](genuine-pending-375.png),
[refusal desktop](genuine-refusal-1280.png),
[refusal mobile](genuine-refusal-375.png),
[settled desktop](genuine-settled-1280.png),
[settled mobile](genuine-settled-375.png).
Desktop unapproved and mobile refusal were visually inspected. Kopi remains intact.

[Cleanup](cleanup.json) confirms the owned app/model processes stopped and zero
owned databases or roles remained. Verified downloaded artifacts are retained.
No production access/write, persistent migration, commit, merge, push, deployment
or S5 work occurred. The S3 allowance was not reused. **Full S4 is not complete.**

## Final regression check

The same current product bytes passed the subsequent isolated original/fixture
webpack builds and **all 22 combined S1/S2/S3/S4/Kopi Chromium checks**.
[Isolation](../post-live-regressions/browser-isolation.json),
[final snapshot hashes](../post-live-regressions/source-manifest.json),
[cleanup](../post-live-regressions/browser-cleanup.json).
After that run, an output-path-only launcher guard was added to refuse the former
default output once genuine receipts exist. Its explicit rejection test passed;
it does not change product bytes or browser behavior. Offline proofs now require
a named fresh S4-owned directory and cannot target this genuine-run directory.
