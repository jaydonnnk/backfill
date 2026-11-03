# NVIDIA Glimmer migration, 2026-11-03

The user reports saving NVIDIA_API_KEY and supplied the official sample. Scope
is adapter/documentation changes and offline verification. No real key/env file
was inspected, printed, copied or used. No inference, new installation/download,
production, S5 or Git publication occurred.

## Current contract

Glimmer uses native fetch, runtime NVIDIA_API_KEY and the fixed endpoint
`https://integrate.api.nvidia.com/v1/chat/completions`, model
`meta/muse-glimmer-30b`. No dependency was added. Spark Open's installed Gateway
SDK adapter is unchanged. Receipt route is `nvidia_nim`; historical local/Gateway
recordings remain readable. Supplied model and usage are retained, upstream and
invoiced cost stay null when unknown. Reported model is not independently verified
weights. Hidden reasoning and credential/error bodies are never saved.

The seven-field intent contract, reference clock, unknown values, corrections,
review/discard and independent exact approvals remain. Limit is 1024 total output
tokens including reasoning, 45 seconds, low template reasoning, temperature
1/top_p 0.95 as in NVIDIA's model-page sample. The API reference recommends a
different sampling pair; actual behavior still needs genuine validation.
NVIDIA documents reasoning budget consumption, so 1024 replaces the old Gateway
512 cap for answer headroom. It is not the sample's 8192 cap. One HTTP attempt,
no retries, redirects or 202 polling. Only one stopped text choice with valid
final JSON succeeds. Tool calls, malformed/empty/truncated output fail closed;
usage survives rejected final output. Null/omitted/empty tool_calls means no tools.

The new `BACKFILL_S4_NVIDIA_GLIMMER_APPROVED` switch defaults disabled. Prior local
and Gateway flags cannot enable NVIDIA. Test setup clears keys/approval flags;
synthetic transports use only dummy credentials. A saved key is not run approval.

## Access status

[NVIDIA's model page](https://build.nvidia.com/meta/muse-glimmer-30b) advertises
Free Endpoint: Available. [Developer FAQ](https://docs.api.nvidia.com/nim/docs/product)
describes free prototyping. Account quota/access, actual output and permanent
hosting are not established. Genuine S4a and full S4 acceptance remain pending.
No Vercel top-up is required for this NVIDIA route. Prior allowances stay closed.

Read-only references: [API contract](https://docs.api.nvidia.com/nim/reference/meta-muse-glimmer-30b-infer),
[reasoning budget](https://docs.nvidia.com/nim/large-language-models/latest/get-started/advanced/model-specific-deployment-considerations.html#muse-glimmer).

## Verification

Fresh logs/manifests/captures are retained here. Synthetic NVIDIA transport
responses and authored fixtures are not genuine output. Actual services, MCP,
UI and disposable PostgreSQL run normally. Prior genuine S4b receipts remain
historical evidence with null Glimmer fields.

Independent review found one compatibility defect: null tool_calls was rejected.
The regression failed first, then the schema was corrected to accept absent,
null or empty tool calls while rejecting actual calls. Red/green logs are kept.

Final unit/integration verification: **550 tests in 57 files passed**.
[Full log](full-tests.txt), [typecheck](typecheck.txt), [lint](lint.txt),
[three offline guard tests](guard-tests.txt), [review](review.json),
[null-tools red](null-tools-red.txt) and [green](null-tools-green.txt).
The two initial NVIDIA parser tests failed against the old Gateway adapter,
then passed after migration. [Initial red](parser-red.txt).

[Preservation](preservation-after.json) verifies 600 inherited evidence files:
599 match byte for byte; only the evidence index has a new current-status prepend,
and its entire prior body still hashes identically. All genuine outputs and
consumed markers are unchanged. Spark Open adapter bytes match their historical
source exactly. The local Glimmer installation is still absent.
[Five genuine S4b recordings replayed offline](s4b-replays.json) with network
forbidden, missing parser evidence left null and wrong-party replay rejected.

Verification environment removes NVIDIA_API_KEY, AI_GATEWAY_API_KEY,
META_API_KEY and DATABASE_URL before running tests/browser with the explicit
local TEST_DATABASE_URL. No env file is loaded. The isolated browser launcher
copies allowlisted source and uses dummy configuration. Source/build snapshots,
servers and databases/roles are owned and disposable.

The first browser attempt completed its checks but was rejected by source-stability
validation because the review fix landed during the run. It is not final passing
proof. Its logs and failure receipt remain under browser/attempts; redundant
captures are in ignored archive. A fresh final run verifies the corrected bytes.

Final corrected snapshot passed both [original](browser/attempts/2026-11-03T14-15-30-584Z/production-build.txt)
and [fixture](browser/attempts/2026-11-03T14-15-30-584Z/fixture-production-build.txt) production
builds and all **22 combined Chromium checks**, with no retries.
[Browser log](browser/attempts/2026-11-03T14-15-30-584Z/browser-test.txt),
[source manifest](browser/source-manifest.json), [isolation](browser/browser-isolation.json),
[cleanup](browser/browser-cleanup.json).
Actual 1280/375 captures: [unapproved desktop](browser/buyer-unapproved-1280.png),
[unapproved mobile](browser/buyer-unapproved-375.png),
[pending desktop](browser/buyer-pending-1280.png),
[pending mobile](browser/buyer-pending-375.png),
[clarification desktop](browser/buyer-clarification-1280.png),
[clarification mobile](browser/buyer-clarification-375.png).
The desktop unapproved and mobile pending captures were visually inspected.
All capture widths and absence of horizontal overflow are asserted. Kopi remains
with its dismissible speech overlay. The main four-party journey ran twice;
fixtures prove product guards, not genuine NVIDIA inference or real-person consent.
Owned server/database/role/build copy are removed. No commit/push/deployment.
