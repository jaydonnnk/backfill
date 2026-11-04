# Backfill SG

Singapore cafés publish off-peak offers that buyer agents can unlock together, within limits set by the merchant.

## Why now

Meta announced Muse's Singapore launch with commerce and travel connectors including Grab and Shopee. Connector availability rolls out progressively. [Meta's announcement](https://about.fb.com/news/2026/10/muse-is-now-available-in-singapore-the-worlds-first-personal-ai-agent-built-for-everyone/) is dated Oct 27; Singapore coverage appeared Oct 28.

Amazon blocked Muse shopping access, according to [Axios on Sept 21](https://www.axios.com/2026/09/21/amazon-meta-muse-ai-agentic-shopping).

Backfill explores a merchant-controlled route into agent commerce. Demand from independent cafés remains an assumption until merchant conversations provide evidence.

## Product

The owner uploads a menu, reviews Spark's extraction, and sets an offer window, minimum group size, per-agent cap and private price floor. Buyer agents submit conditional commitments through MCP. Code checks exact terms, scope, prices and capacity. Wonder proposes changes after a sellout, and the owner approves them.

A visitor can use the synthetic buyer sandbox: Glimmer proposes constraints, Spark Open recommends a decision, and the visitor separately approves exact terms before submitting. Requests go to NVIDIA and Vercel AI Gateway. The hosted flow completed a synthetic smoke round on Nov 4.

The recorded scene had 11 of 20 simulated buyers commit, filling 16 covers. Those are replayed decisions against a synthetic merchant. No payment, identity or attendance is enforced. The MCP connector claim is limited to one test by the author's own Muse account on Oct 29.

The frozen comparison did not show AI superiority: Spark filled 6 focal seats in 3 of 12 worlds, compared with 12 in 6 of 12 for the fixed policy. Whole-pool seats were 32 versus 48. Guardrails enforce the merchant's limits independently of the model.

## Evidence limits

`llm_calls` covers supported Meta menu, negotiation and planning attempts. Diagnostics show metadata and the tracer reply; voice, media, sandbox models and the US$0.0878 scene recording are excluded from its totals. SAM 3.1 and Muse Image each have one recorded run and are not enabled in the hosted product. Real merchant demand, attendance and recovered revenue remain unverified.
