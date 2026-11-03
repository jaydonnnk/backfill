# Final NVIDIA build and browser proof

The NVIDIA adapter checkpoint passed 550 tests in 57 files, typecheck and lint.
Original and fixture production webpack builds passed; only model dependency
factories were replaced in the fixture build. UI, HTTP, services, MCP and local
PostgreSQL ran normally. Fixture outputs are not genuine inference.

[Original build](browser/attempts/2026-11-03T14-15-30-584Z/production-build.txt),
[fixture build](browser/attempts/2026-11-03T14-15-30-584Z/fixture-production-build.txt),
[22 combined Chromium checks](browser/attempts/2026-11-03T14-15-30-584Z/browser-test.txt),
[exact source hashes](browser/source-manifest.json),
[isolation](browser/browser-isolation.json), [cleanup](browser/browser-cleanup.json).

Actual desktop/mobile captures: [unapproved 1280](browser/buyer-unapproved-1280.png),
[375](browser/buyer-unapproved-375.png), [pending 1280](browser/buyer-pending-1280.png),
[375](browser/buyer-pending-375.png), [clarification 1280](browser/buyer-clarification-1280.png),
[375](browser/buyer-clarification-375.png). Width/overflow assertions passed; Kopi
remains with its dismissible speech overlay. No fresh live browser is claimed.

The earlier browser attempt was rejected because source changed during review.
Its logs, duplicate regressions and intermediate red/green logs are archived
locally and in parent `cdb292d`. Final product hashes remain unchanged.
