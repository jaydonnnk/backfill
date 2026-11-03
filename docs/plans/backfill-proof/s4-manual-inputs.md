# Current S4 manual inputs: NVIDIA Glimmer

The user reports saving `NVIDIA_API_KEY` in ignored local configuration. Do not
inspect, print, copy or commit it. Runtime loading is sufficient. The parser
reads the variable value, not the literal string "NVIDIA_API_KEY". Glimmer now
uses NVIDIA directly; Spark Open remains on Vercel Gateway.

No Vercel top-up, VPS or installation/download is needed for the advertised free
prototype endpoint. One actual NVIDIA request now returned HTTP 200 and valid explicit output.
The separately approved clarification call also passed. S4a synthetic acceptance
is complete; future quota/availability and production suitability remain unverified.
The service is for limited prototyping/evaluation, not permanent free production.

The product's `BACKFILL_S4_NVIDIA_GLIMMER_APPROVED` switch defaults disabled.
The user has now approved the bounded two-request live test in the
[current contract](s4a-nvidia.md). It uses a fixed NVIDIA endpoint/model,
1024 total output tokens, 45 seconds, low reasoning and no retries/polling or
paid fallback. The runner has exclusive durable run/call slots. Do not rerun it
under the same allowance. Prior S3, S4b and local-load allowances remain consumed.

Genuine acceptance still needs stated party/date/time/budget extraction,
clarification of unknowns, review/correction/discard and actual provenance.
Parsing never commits; all exact approval, privacy and ownership guards remain.
Merchant validation, video, payments and attendance remain separate.

Sources: [NVIDIA Glimmer](https://build.nvidia.com/meta/muse-glimmer-30b),
[API contract](https://docs.api.nvidia.com/nim/reference/meta-muse-glimmer-30b-infer),
[prototype scope](https://docs.api.nvidia.com/nim/docs/product).
