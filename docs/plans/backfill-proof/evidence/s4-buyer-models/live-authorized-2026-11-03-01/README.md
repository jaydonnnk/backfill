# Genuine S4b Spark Open proof

Five Gateway calls returned HTTP 200 with supplied Baseten routing metadata.
Four independent synthetic parties each selected two covers, separately approved
exact terms and submitted through authenticated UI/MCP/local PostgreSQL. Eight
covers remained pending until simulated settlement, then eight filled. Duplicate
submission created no extra commitment. A separate fifth party refused its SGD1
budget and submitted nothing. This is not real-person consent or merchant demand.

[Acceptance and usage](acceptance-and-cost.json),
[UI/database outcome](ui-and-database-audit.json),
[original recordings and offline replay](replay-audit.json),
[authority](authority.json), [consumed session](dispatch-session.json),
[source hashes](live-source-manifest.json), [cleanup](cleanup.json).
Per-party `*-final.json`, the refusal decision and all five approved-request,
dispatch and HTTP receipts are retained. Do not reuse or clear these slots.
Parser fields in these recordings remain null; Glimmer was unavailable then.

Usage was 2447 input/1558 output tokens. The US$0.00968025
[published-rate estimate](pricing-at-dispatch.json) is not an invoice.
Actual invoiced cost is unknown. Checkout and deadline advancement were simulated.

Retained 1280/375 captures: [unapproved desktop](genuine-unapproved-1280.png),
[mobile](genuine-unapproved-375.png), [pending desktop](genuine-pending-1280.png),
[mobile](genuine-pending-375.png), [refusal desktop](genuine-refusal-1280.png),
[mobile](genuine-refusal-375.png), [settled desktop](genuine-settled-1280.png),
[mobile](genuine-settled-375.png).

The historical local Glimmer load was stopped before readiness, with no parser
request. [Stop](glimmer-blocked.json), [memory](memory-samples.json),
[startup](runtime-startup.json), [weight verification](download-verification.json).
Verbose logs, duplicate fixture regressions and obsolete setup plans are archived
locally and in parent `cdb292d`. No fresh inference or production rollout is implied.
