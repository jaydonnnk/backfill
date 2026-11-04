# S5 read-only media contract check, 2026-11-04

No inference, authenticated account lookup, credential read, package installation,
model download, production access or media upload was performed for this check.
The implementation's default media dependency is disabled, without env loading.

## SAM 3.1

Candidate endpoint: `POST https://api.meta.ai/v1/responses`, `model: sam-3.1`.
Request one text target and one inline photo, `stream: true`, `store: false`, and
`metadata.mask_encoding: one_bit`. Read SSE delta text until `response.completed`.
Incomplete, empty, malformed and ambiguous multiple-object output yields no asset.
The constrained local parser accepts one frame-zero object with an inclusive box,
converts box-local binary pixels to source coordinates, and refuses bad geometry.

The encoded mask is arithmetic-coded base85 with an envelope, not base64 or a PNG.
The official parser also validates coder finalization and canonical encodings.
`@meta-sam/parser` is absent locally. Installing or downloading it needs separate
authorization; no guessed codec is supplied. The injected decoder in offline tests
returns an authored binary mask. It does not prove genuine payload decoding.

Sources: [segmentation](https://dev.meta.ai/docs/media-segmentation),
[request options](https://dev.meta.ai/docs/sam/segmenting),
[wire output](https://dev.meta.ai/docs/sam/reading-segmentation),
[client parser](https://dev.meta.ai/docs/sam/client-libraries),
[official protocol](https://github.com/meta-models/meta-sam/blob/main/protocol/sam3.md).

## Muse Image

Candidate endpoint: `POST https://api.meta.ai/v1/images/generations`,
`model: muse-image-1.0`. One fixed decorative prompt, `n: 1`, PNG,
`response_format: b64_json`, `stream: false`. Disable web/image search and shell
through `tool_enablement`; set `reasoning_strength: low`. Size requests the square
aspect ratio, not guaranteed exact dimensions. The adapter verifies decoded image
bytes/dimensions and refuses URL output, multiple images and malformed responses.
No photo, offer terms, floor, voice or owner rationale enters this request.

Source: [official Image contract](https://dev.meta.ai/docs/image-generation).

## Bounds and future approval

The adapters make one POST, reject redirects, bound SAM response text to 2 MiB,
Image JSON to 6.1 MB, decoded images to 4 MiB/8 million pixels and 4096 per side.
Network/read timeout is 30 seconds, outer service wait 31 seconds. No retry,
polling, URL follow-up, paid fallback or second dispatch for the same asset stage.
A durable database phase/timestamp reserves each stage before provider work.
Failure or interruption consumes that stage; restarting cannot repeat it.

Published list prices observed on this date are US$0.0025 per SAM still image and
US$0.01 per returned Muse Image. One of each therefore has a US$0.0125 API list-price
ceiling, excluding any taxes/account adjustments. Actual invoiced cost is unknown;
no call was made. Source: [official pricing](https://dev.meta.ai/docs/pricing-rate-limits).

This is a preparation recipe, not an approval-ready or authorized run. Before
requesting a call approval, receive the actual photo/object, verify the decoder,
pin the exact request/photo/normalized-source hashes and approved public text,
retain input/output limits and a durable one-use run reservation, and recheck the
price and access. Photo-use permission is not spending or public-posting approval.
No existing S3/S4 allowance or consumed marker may be reused.

## Concrete decoder installation proposal after photo receipt

Read-only public npm metadata on 2026-11-04 reports `@meta-sam/parser@0.1.0`,
128,572 unpacked bytes, no runtime dependencies, Node `^20.17.0 || >=22.9.0`.
Its repository is `meta-models/meta-sam`, directory `typescript/packages/parser`.
License metadata is `SEE LICENSE IN LICENSE`; no license entitlement is assumed.
Source: [public registry metadata](https://registry.npmjs.org/%40meta-sam%2Fparser/latest).
Integrity reported by that metadata:
`sha512-099xq4EhULxm7gV+kEllQ9WTaNgwYumGRvCX5WAT2bny/SEh+U9tVT9bAzN1mISOC7TO6mgOt3MJmZ2Mv2RTmw==`.

Proposed local action, NOT executed:

```sh
npm install --save-exact --ignore-scripts --no-audit --no-fund @meta-sam/parser@0.1.0
```

This would download/install only the named decoder with lifecycle scripts disabled,
update the local manifest/lockfile and enable offline codec verification/integration.
Review the actual lockfile delta and package license before using it. This proposal
includes no inference, photo upload, production change, publication or model download.
The user's explicit no-install boundary requires separate authorization first.

## Completed authorized installation and calls

The user subsequently authorized both installation and model calls. The pinned
parser is installed and verified. The earlier missing-decoder and no-call status
above describes the initial read-only check, not the current result. The one SAM
and one Image allowance is now consumed/closed; both returned HTTP 200. Actual
invoice is unknown. See evidence/s5-live-authorized-2026-11-04-01/README.md for the
raw rice-mask miss, explicit local correction and pending human cutout approval.
The later cutout and final composition were separately approved for local use.
The final image hash and approvals are in the S5 final-approval evidence. No
public posting, new inference or production rollout is authorized.
