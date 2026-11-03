# S4: what only the user needs to decide

Local S4 coding and fixture verification can start without new values. The agent
can inspect the Mac, choose a narrow implementation, prepare tests and propose
the actual model setup. Do not make the user perform technical setup that the
agent can do after authorization.

## Required before full genuine verification

1. **Approve a concrete Glimmer setup plan.** The next agent names the exact
   compatible runtime/version, source, model file/hash, total download size,
   destination and memory/context limits first. Then approve or decline that
   plan. Current candidate is one roughly 17 GB Q4 text model, not a guarantee
   of fit on 24 GiB shared memory. No optional vision/draft files are needed.
   No Glimmer account/key is documented for these public artifacts.
2. **Choose a paid-test budget.** The next agent first prepares the Spark Open
   buyer cases, exact endpoint/model, maximum calls, no-retry guard and verified
   cost ceiling. Approve that specific run with a maximum spend you accept.
   Previous Gateway smoke approvals and S3's consumed four-call allowance are
   not reusable. Installation permission does not authorize hosted inference.
3. **Handle an account gate only if it appears.** The designed route reuses the
   existing `AI_GATEWAY_API_KEY`. Direct Baseten credentials are not required
   for this route. If billing/account access blocks the approved run, only the
   user handles the provider's account/card screen. Do not paste keys into chat
   or buy credit based on an unverified diagnosis.

The agent can do the remaining technical work after these approvals, including
installation/download, model startup, synthetic buyer review/approval clicks,
bounded inference, verification and evidence. Scripted approvals remain labeled.

## Optional values for a real buyer example

Synthetic fixtures are enough for engineering verification. For a case based
on the user's own preferences, supply the following in plain text:

```text
Example status: my real preference / synthetic example
Party size:
Visit date (YYYY-MM-DD, Singapore time):
Earliest arrival and latest departure:
Maximum SGD per person (or total, explicitly labeled):
Area / venue preference, if any:
Hard requirements, if any (diet, access, timing):
Approval for a real booking: none; review only
```

The model's interpretation is a proposal. The user reviews uncertain fields
and separately approves exact booking terms if a real booking is ever in scope.
This S4 plan does not authorize a real booking or money collection.

Merchant demand evidence, actual quiet-hour economics/private floor, source
photo rights and the final video remain separate user-owned work. They do not
block starting S4 locally. Do not ask the user for invented testimonials or
present synthetic buyer/merchant values as real validation.

Sources checked 2026-11-03: [Meta artifacts](https://dev.meta.ai/docs/muse-glimmer/get-the-model),
[runtime options](https://dev.meta.ai/docs/muse-glimmer/deploy),
[Gateway models API](https://ai-gateway.vercel.sh/v1/models).
The 17 GB number is a vendor artifact estimate; total working memory is unknown.
