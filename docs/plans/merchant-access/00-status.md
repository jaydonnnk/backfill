# Status: Merchant website access

- Gate 1 — Product: APPROVED 2026-11-04, with shorter descriptions and explanations
- Gate 2 — Architecture: APPROVED 2026-11-04, including permission migration amendment
- Gate 3 — Program design: APPROVED 2026-11-04
- Gate 4 — Slice plan: APPROVED 2026-11-04

## Slices

- [x] Slice 1 — Website entry and returning-merchant access.
- [x] Slice 2 — New workspace creation and private-link saving.
- [x] Slice 3 — Isolation, concurrent signup limits, and browser verification.

## Notes for a fresh session

- Requested on 2026-11-04: give merchants access through the website, including an “I'm a merchant” entry point.
- The current signed-out `/merchant` page only tells visitors to open a secret link. Authenticated menu, voice, photo, and ledger controls already exist.
- Approved product: reuse private access links for self-service workspaces. Email login was not requested or approved.
- User correction at Gate 1 approval: the preview looked good, but descriptions and explanations were too wordy. Use concise copy in the mockups and implementation.
- Gate 2 initially proposed no migration. Source review then found that `backfill_app` only has SELECT on merchants. The amendment adds a restricted registration function through migration 0018; no new tables or external provider. Original approval is recorded, and the amendment was approved with Gates 3 and 4.
- User explicitly requested Gates 3 and 4 and the proposed buildout together. This overrides the workflow's separate-gate presentation rule. The combined package was approved. Execute all slices without intermediate permission requests.
- `03-program-design.md` and `04-slices.md` are the combined review package. Implementation is in progress; migration 0018 is written and has only been applied to disposable local test databases.
- Mockups are plain HTML. They create no real accounts and make no requests.
- Preserve the existing uncommitted homepage copy changes in `src/app/page.tsx`.
- No deployment, production migration, live model calls, or manual creation of production merchant records is part of preparing this proposal.


## Execution log

- Implementation authorized by user approval of the combined package. Work continues on `codex/merchant-access` in the existing preview checkout; no new worktree, commits, or production writes.
- Preflight: local PostgreSQL accepts loopback connections. Shared schemas feed token authentication and both entry forms; registration service feeds the server action. No interface conflicts found.
- Unit RED: access module absent. GREEN: 11 schema/link cases pass. Registration RED: service absent.
- Browser entry RED: Create my workspace was absent. GREEN: browser entry test passed. Restricted-role integration RED: registration function absent; GREEN: 10 registration tests and 27 existing onboarding tests passed.
- Shared source was retained on a feature branch for the requested live preview; browser mutation tests use a temporary copy with a disposable database and restricted login. No production migration was applied.
- Typecheck caught widened React action-state inference; fixed by specifying its real state type. Lint caught effect-derived URL state; replaced with an SSR-safe browser-origin snapshot.

- Completed all three slices locally. Final full suite: 76 files, 631 tests passed. Isolated browser suite: 7 passed, including real restricted-role signup, downloaded-link return in a fresh context, clipboard fallback, invalid/foreign links, same-name draft isolation, full-cap refusal, failure handling, and mobile/desktop light/dark layouts.
- Final typecheck, ESLint, and git diff whitespace checks passed. Browser assertions also verify loaded fonts and private/no-store access-page caching.
- Independent reviewer found two P2 verification-tool issues: cleanup after a signal-terminated preview and credential-bearing Playwright failure reports. Both received reproducing RED tests, fixes, and GREEN tests. Process stop now handles signal exits/ESRCH, cleanup steps run independently, credential redaction covers test errors and logs, and returning navigation uses a token-free URL with fragment initialization.
- Additional forced-preview-crash experiment passed: controller failed as expected, cleaned its database/role/temp files, and left no extra disposable browser database.
- Offline webpack font verification initially decoded HTTP URL text as WOFF2 under Next's mocked loader. Reproduced with a font-error browser assertion, then fixed the runner to use existing cached font files directly. Final 7-case browser suite passed with actual typography; screenshots were visually inspected.
- Small implementation ruling: the verification runner supports `--preview` to leave a disposable local workspace open for review. It cleans up on SIGTERM/SIGINT; no production database is changed. If this preview process is lost, its local-only accounts are not production records.
- Current review preview: http://127.0.0.1:57563/merchant ; controller PID 62677; log /tmp/backfill-merchant-access-preview.log. Existing original port-3000 app remains separate and has NOT received migration 0018.
- No commit, push, production migration, deployment, paid model call, or production merchant record was made. To release, review/apply migration 0018 before deploying the UI. This working copy is on `codex/merchant-access` with the earlier homepage copy changes preserved.

## Code publication

- On 2026-11-04 the user accepted the working preview and explicitly requested pushing to main. This supersedes the earlier local-only restriction for Git publication.
- Pre-publication checks were rerun: 631 tests passed, typecheck passed, ESLint passed, and git diff whitespace checks passed. origin/main matched the feature branch's base at aab5c76.
- Publish with `[skip render]` so the new UI is not automatically deployed before production migration 0018. Production migration and deployment remain pending; no database change is included in this push.

## Production release completed 2026-11-04

- User explicitly approved applying the production migration and deploying after seeing the old live page. This supersedes the prior deployment hold.
- Production was at migration 0014. Reviewed and applied prerequisite migrations 0015–0017 and signup migration 0018 with the existing Drizzle runner, using the direct owner connection. Existing merchants, rules, commitments, ledger, and owner-change row counts were unchanged.
- Verified runtime register_merchant execution with a deliberately rolled-back transaction. Runtime still lacks direct merchant INSERT; no persistent smoke-test account was created.
- Manually deployed b31262666444067293885856a88c39bd0a3021eb to Render service srv-dbfvsq2vcj2c73anqvqg. Deployment dep-dbligejncjis73dv3sqg reports Deploy succeeded|Live. Auto-deploy settings were preserved.
- Verified https://backfill-9d0x.onrender.com/merchant shows the new signup and returning-link forms. Whitespace-only signup returns the expected validation message from the live server. Restored the blank form for the user.
- Production evidence is saved locally in evidence/production-migration-2026-11-04.json and evidence/live-merchant-2026-11-04.jpg. Deployed application code at this release was b312626. No paid model calls or persistent test merchants were created.
