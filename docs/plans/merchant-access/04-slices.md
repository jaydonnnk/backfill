# Merchant website access implementation plan

> **For agentic workers:** Use `executing-plans` to implement this plan task by task in the current session. Use checkbox steps to record evidence. Do not delegate unless separately requested or required by an applicable review skill.

**Goal:** Let merchants create a private workspace from the website, save access, and return without administrator help.

**Architecture:** Keep the existing merchant table and private-link authentication. Add a restricted registration function so the web role can create an account without gaining direct table-write permissions. Use the current UI styles and short approved copy.

**Tech stack:** Existing Next.js, React, TypeScript, Zod, Drizzle, PostgreSQL, Vitest, and Playwright. No new package.

**Spec:** `01-product.md`, amended `02-architecture.md`, and `03-program-design.md` in this folder.

Status: APPROVED 2026-11-04. All three implementation slices are authorized; record execution results in `00-status.md`.

## Global constraints

- Names are trimmed, required, and at most 120 characters. Registration is limited to 30 creations per rolling hour globally.
- Preserve existing merchant links, authenticated features, and homepage copy edits. Do not claim real bookings, customers, or payments from tests.
- No new tables, providers, passwords, or dependencies. One function-and-permission migration is needed.
- Tokens stay out of logs, query strings, browser storage, screenshots, and test reports.
- Test writes use disposable local PostgreSQL. Do not point tests at the current preview's database or alter its credentials.
- No paid calls, production migration, or deployment is included in this implementation plan. The user separately authorized code publication to main after accepting the completed local preview.

## Review focus

- A copied local link must use the current browser origin, not `.env.local`'s possibly different hostname.
- A name matching another café must never grant access to its existing workspace.
- Simultaneous registrations at the hourly boundary must not bypass the ceiling.
- Clipboard denial must leave another usable way to save access.
- The implementation must work as `backfill_app`, not merely as a privileged test database owner.

## Slice 1 — Website entry and returning access

**Files:** shared access schemas; merchant entry form; signed-out merchant page; navigation and homepage links; existing failed-link page; unit tests. See Gate 3 for exact paths.

**Interfaces:** establish `MerchantName`, `MerchantToken`, and `merchantTokenFromLink`; use existing `enterWithToken`. New-account creation is visibly unfinished until Slice 2, with no fake success state or credential.

- [x] Write unit cases for accepted/invalid names and same-origin full/relative merchant links; verify they fail before implementation.
- [x] Add the small shared schema/parser module; import its authoritative token schema into existing token authentication without changing accepted tokens.
- [x] Replace the signed-out placeholder with the approved two-column entry design, using existing style tokens and responsive utilities. Wire returning-link access to existing authentication.
- [x] Rename the navigation entry and add the homepage merchant action, preserving existing copy changes.
- [x] Make failed direct links offer a route back to entry. Keep copy short and status messages accessible.
- [x] Run `npm run test:unit -- tests/unit/merchant-access.test.ts` and `npm run typecheck`. Confirm the public route renders the entry form without a session or any write.

Deliverable: a working website entry and returning merchant flow. Local new-account creation remains unfinished at this internal checkpoint; do not deploy this partial slice.

## Slice 2 — New workspace and saved access

**Files:** registration SQL and journal; registration service; shared token generator; merchant actions/session helper; access page and save-link component; authenticated workspace save-link action; integration tests.

**Interfaces:** implement `registerMerchant`, `setMerchantSession`, and `createWorkspace` exactly as Gate 3 specifies. Success redirects to `/merchant/access`; capped registration returns no merchant ID or token.

- [x] Write real-database tests for function execution by `backfill_app`, rejection of direct table writes, valid hashed-token accounts, invalid SQL inputs, separate same-name workspaces, and the rolling cap. Verify the pre-change failure.
- [x] Add migration 0018 and append its journal entry. Keep the function's public execution revoked and runtime table permissions unchanged. Apply only to the disposable test database.
- [x] Extract the shared token generator, add the registration service, and share the existing cookie setter. Preserve CLI minting and existing token entry.
- [x] Implement the validated create-workspace server action, pending/error UI, existing-session guard, and success redirect. Keep credential values out of action state and logging.
- [x] Implement authenticated save-link access, current-origin link construction, copy/download, and the signed-in workspace's save-link action. Ensure private response caching.
- [x] Run `npm run test:integration -- tests/integration/merchant-registration.test.ts` with explicit loopback `TEST_DATABASE_URL`, then the existing onboarding integration suite. Run typecheck and lint.

Deliverable: website creation and saved-link return work against a disposable database using the intended restricted role. Existing token links still authenticate.

## Slice 3 — Browser proof and completion

**Files:** feature Playwright spec/config and local verification runner; final corrections only within the feature's owning files.

**Interfaces:** the runner creates an isolated temporary app and disposable database, supplies dummy model configuration, starts a loopback server on an unused port, runs only the feature's browser tests, and cleans up server and database in `finally`. Reuse existing local-database helpers and loopback guard; use the existing cached font fixtures if a production build is included. Do not reuse the legacy merchant browser test's hardcoded preview directory or modify the current browser-pane preview.

- [x] Add the browser test and runner. Explicitly reject non-loopback database/server targets; isolate environment values from `.env.local`. Serve from a temporary app copy so Next's dev/build lock does not interrupt the active preview.
- [x] Prove the full path: homepage entry → create workspace → save/download link → sign out → fresh-context return to the same account. Verify no duplicate account is created by returning.
- [x] Cover returning paste, existing direct links, authenticated entry, unknown/foreign links, denied clipboard, and service failure with the expected short messages.
- [x] Prove same-name isolation through an owned test draft, and verify signup/return create no offers, commitments, or model calls.
- [x] Exercise the 29-plus-two concurrent signup boundary in the database tests. Verify the cap counts current rows and excludes old rows under the real runtime role.
- [x] Inspect keyboard access, mobile/desktop widths, light/dark themes, and overflow. Capture only masked, disposable-fixture screenshots.
- [x] Run the feature runner with `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres node --import tsx scripts/verification/merchant-access.ts`; require passing browser assertions, no external calls, no uncaught page errors, and successful cleanup. If local PostgreSQL is unavailable, report that blocker instead of using Neon.
- [x] Run `npm run typecheck`, `npm run lint`, focused feature unit/integration tests, and `git diff --check`. Review the final diff for auth boundaries, stale scaffolding, and preserved homepage changes.
- [x] Update `00-status.md` with observed results, commands, and remaining limitations. Remove Slice 1's temporary unfinished behavior. Show the local completed flow when an isolated preview is available; no production signup records are needed for proof.

Deliverable: tested local feature, reviewable diff, and a recorded production migration prerequisite. No production release is implied.

## Release boundary

A future production release must review and apply migration 0018 before deploying the signup UI. Turning signup off later must not delete merchants, offers, tokens, or their existing direct-link access. Revoke the registration function's execution permission to disable new registrations at the database boundary if needed; retain existing accounts.

## Self-review

Product coverage: entry, self-service creation, save/copy/download, returning paste/direct links, short copy, and authenticated bypass all map to Slices 1–3. Gate 3 names the function contracts, limits, ownership checks, and exact test files. All five review-focus cases have an owning slice and a concrete verification step. Database and browser proof run locally; production permissions and deployment remain explicit release prerequisites.

## Completion

All local slices completed on 2026-11-04. See `00-status.md` for observed test counts, review fixes, the running isolated preview, and the production release prerequisite. See `00-status.md` for the subsequent code-publication authorization; production migration and deployment remain pending.
