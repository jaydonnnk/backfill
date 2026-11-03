# Revised S2 decisions, 2026-11-03

User authorizes local S2 implementation and verification only. Branch backfill/proof-s1-journey, HEAD a8c224fa9a9249bb8f850237d1011267c62af7dd. Initial typecheck/lint and 471 tests in 46 files passed. Inherited S1 bytes recorded before edits. Status is the only inherited file intended to change.

- Reuse the existing /demo, snapshot transaction, authenticated MCP commitments, settlement and isolated S1 launcher pattern. Preserve Kopi and booking policy.
- Add an append-only, local-demonstrator trail with exact run/party/rule/version/date/covers/price/total identities. Local fixture writer explicitly records synthetic request, bounded covers/reason output, scripted approval and optional submitted commitment. Proposal-only records have no commitment/result. No arbitrary human-approved label or new production consent API.
- Persist accepted price at commitment insertion, under the existing rule lock, so later owner changes cannot rewrite historical committed terms. Historical rows remain unavailable rather than guessed. Match approval to both proposal and actual immutable commitment. Scripted assurance establishes only a local script's explicit authorization of those terms, never a real person's consent.
- Public snapshot filters all merchant plan rationale. Fixture/replay/unknown provenance stays explicit. No historical scene.json import into the four-party proof. No model reasoning beyond the actual short covers/reason output.
- Validate incoming snapshots before replacing the last view or marking the feed live. Interruptions and malformed payloads retain the last saved result with uncertainty; recovery does not celebrate stale events.
- New tests will demonstrate privacy/feed regressions before fixes, cover all approval tuple mismatches, missing evidence, proposal-only state, and stored pending/filled/not-filled results. Repeat the complete inherited S1 service workflow twice with receipts stored here, and run isolated production Chromium S1 plus S2 desktop/mobile journeys.
- No env-file access, providers, installs, production writes, publication, deployment, later slice, merchant validation or video.

## Verification decisions and closure

- The public-rationale leak and unvalidated feed were reproduced before changing code. Full-shaped inconsistent fills and stale-state loss on connection close received additional red/green regressions.
- Actual Chromium offline mode left an existing SSE stream open. Added explicit offline/online handling, preserving the last snapshot and suppressing recovery celebrations.
- Removed the old inference from Wonder replay provenance to buyer provenance. Tests now require per-party evidence or uncertainty.
- Both initial browser failures remain retained as incomplete attempts. Two subsequent product-check passes had an incorrectly named six-cover mobile capture. The final run explicitly sets widths and asserts PNG bytes; all 12 top-level captures match their labels. No earlier mislabeled capture is used as mobile proof.
- Final checks: 496 tests in 49 files, typecheck, lint, production webpack and 11 Chromium checks passed. Complete S1 service proof repeated twice with receipts here, and S1 browser proof passed in all three final product-code runs. Runtime/build sources match all three snapshots. No S1 source/evidence bytes changed; status is updated separately under the user's instruction.
- Approval assurance remains a script-declared attestation of exact terms, not authenticated human consent or independent timestamp proof. The fixture writer stores its record after receiving the commitment ID. No production consent enforcement was added.
- Proof databases, runtime roles and owned servers were removed. S2 only is complete locally and uncommitted. Stop before S3 or publication.
