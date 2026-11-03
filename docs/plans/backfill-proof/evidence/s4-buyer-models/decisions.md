# Revised S4 implementation decisions

Authorized local-only continuation from b1df9ad08dbbcd526c12d42ca3d12090598a797c.
Main, origin/main and remote main matched; the starting index/worktree were clean.
Work is on backfill/proof-s4-buyer-models. No publication is authorized.

- Reuse BuyerDecision and buyerRequest, the actual MCP tools and existing settlement.
- Add one private buyer-session table, local migration only. Bind every action to
  an authenticated existing agent. Lock sessions on mutations and reserve model
  attempts before inference. Persist exact request, reference clock, reviewed
  constraints, public offer, bounded final decision, approval and MCP result.
- Edits increment revision and clear downstream decisions. In-flight responses
  cannot revive prior revisions. Request parsing/review never grants approval.
- Use a small /buyer product form in existing Kopi styles. Each browser holds
  its bearer token in memory only. This is agent authentication, not proof of a
  real person's consent. Scripted tests remain explicitly labeled.
- Glimmer uses HTTP loopback only, redirects refused, bounded context/output.
  Its configured model name is an alias, not artifact provenance. Genuine proof
  separately needs weight/runtime/process/hash receipts.
- Gateway uses installed ai, meta/muse-spark-open, low reasoning, 512 output
  tokens, 45 seconds, maxRetries 0. Request ordinary JSON text and strictly parse
  it; do not assume native structured-output support. Never store reasoning.
- Production model dependencies default disabled pending named run authority.
  Fixtures replace only model dependencies in isolated verification snapshots.
- Keep legacy twenty-buyer recordings unchanged. S4 session receipts are a new,
  narrow format, not a relabeling of those recordings. Unknown cost stays null.
- No S5, production, install/download, paid call, commit, merge, push or deployment.

## Review and verified repairs

The requesting-code-review skill supplied one independent read-only reviewer.
Its pool-starvation finding was reproduced with one database connection before
repair. MCP now runs on the existing transaction, using existing Executor types
and nested savepoints. This required type-only signature widening in commitments,
negotiation and MCP; existing direct paths remain covered by combined regressions.
The one-connection and six-concurrent-submission tests pass after repair.

The buyer UI now binds asynchronous responses to an input/credential generation.
A delayed reply cannot restore another credential's private state or overwrite a
newer local edit. Explicit labels fix the select/textarea locator ambiguity.
Expired sessions expose restart. The final browser regression covers these races,
expiry and a real completed submission whose HTTP response is deliberately lost.
The original race test initially hit an implicit-label selector problem before
its intended assertion; do not cite that initial failure as proof of the race.
Expiry and pool-starvation red runs are genuine defect demonstrations.

The browser manifest now declares both model-boundary replacements and actual
final snapshot hashes, distinct from the initial copy hashes. Every other copied
product/public/simulation file must match the root. Root bytes and verification
inputs must remain stable throughout each successful run.

The first migration attempt referred to the production-only backfill_web role,
which is absent from disposable databases. The migration now revokes PUBLIC and
grants only backfill_app. Its failed provisioning left exactly one owned database,
backfill_t_proof_s4_journey_8b4f684b. It was explicitly dropped locally after audit.

A single documented Gateway upstream is pinned with gateway.only=['baseten'] to
avoid cross-provider fallback under the proposed five-attempt allowance. Actual
upstream provenance remains unknown until supplied by genuine runtime metadata.
No direct Baseten or bonus claim is made. No independent-review finding was
left deferred. No publication, deployment, production, install, download or
paid-inference action has been performed.

The first combined post-fix browser run passed 20/22 checks but selected S3's
leftover named demo merchant when checking S4's pool. All four S4 commitments
were actually stored; the selected snapshot belonged to another rule and showed
zero. The S4 fixture now gives only its fresh synthetic merchant the public demo
name and asserts the selected rule ID. Existing fixture records are retained.
This corrects test isolation, not the production merchant-selection policy.

A boundary-accounting check showed rejected Gateway JSON discarded returned token
usage. The focused assertion failed first. ModelOutputError now carries only the
bounded route/model/usage receipt, and the failed private session retains it with
no decision or approval. Invalid final text and hidden reasoning are not stored.
The fix passed the SDK contract test and real-service no-commitment check.

One subsequent combined attempt still ran a test worker loaded before the corrected
scene identity assertion. Its failure includes the obsolete assertion despite a
newer source snippet in Playwright's error context. It is not passing proof. The
final combined run starts from the corrected, typechecked snapshot and rejects any
source or verification-input change during execution.
