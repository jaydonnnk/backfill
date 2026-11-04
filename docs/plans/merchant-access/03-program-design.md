# Program design: Merchant website access

Status: APPROVED 2026-11-04 with Gate 4 and the Gate 2 migration amendment.

## Files

Modify:

- `src/app/layout.tsx`: rename merchant navigation to “I'm a merchant”.
- `src/app/page.tsx`: add the same merchant entry action; preserve the current copy deletions.
- `src/app/merchant/page.tsx`: replace the signed-out placeholder with the entry form; add “Save access link” to the signed-in header.
- `src/app/merchant/actions.ts`: create-workspace action; reuse the shared cookie setter in existing link entry.
- `src/app/merchant/session.ts`: share the existing cookie policy between signup and returning access.
- `src/app/merchant/enter/page.tsx`: give failed-link visitors a working route back to merchant entry.
- `src/lib/onboarding/links.ts`: export its random-token generator and reuse the shared token schema; keep CLI minting and authentication behavior.
- `src/lib/log.ts`: redact merchant tokens in unexpected errors and verification output.
- `next.config.ts`: add an explicit private, no-store cache policy for the authenticated access-link page; verify the actual response in browser tests.
- `drizzle/meta/_journal.json`: append migration 0018 without altering earlier entries.

Create:

- `src/domain/onboarding/access.ts`: shared name/token schemas and pure same-origin access-link parsing. No database or Node crypto imports, so browser use is safe.
- `src/lib/onboarding/registration.ts`: generate the token, call the restricted SQL function, and map a capped result.
- `src/app/merchant/access-form.tsx`: new-workspace and returning-workspace forms, short errors, and pending states.
- `src/app/merchant/access/page.tsx`: authenticate before showing the save-link screen; force dynamic rendering.
- `src/app/merchant/access/save-link.tsx`: masked access-link field, local copy/download, and short result messages.
- `drizzle/0018_merchant_self_service.sql`: restricted registration function and execution permissions; no tables.
- `tests/unit/merchant-access.test.ts`: names and access-link parsing.
- `tests/integration/merchant-registration.test.ts`: real local database and restricted-role registration tests.
- `tests/e2e/merchant-access.spec.ts`: real website signup and fresh-session return.
- `config/playwright.merchant-access.config.ts`: select only this feature's browser tests and isolated loopback app URL.
- `scripts/verification/merchant-access-process.ts`: small tested process-group shutdown helper, extracted after review reproduced a signal-exit cleanup bug.
- `tests/unit/merchant-access-process.test.ts`: running and previously signal-terminated process cleanup.
- `tests/unit/merchant-access-report.test.ts`: token redaction in navigation/form error text.
- `scripts/verification/merchant-access.ts`: repeatable local browser-test runner with disposable database, clean app environment, loopback transport, temporary app copy, and cleanup.

Use existing layout tokens and utility classes. No UI library, generic authentication framework, or new dependency. Mockups remain HTML; TSX above is production application code, not a standalone visualization.

## Types and signatures

```ts
// src/domain/onboarding/access.ts
export const MerchantName: z.ZodString; // trimmed, 1–120 characters
export const MerchantToken: z.ZodString; // existing bfm_ + 43 base64url characters
export function merchantTokenFromLink(value: string, origin: string): string | null;

// src/lib/onboarding/links.ts
export function newMerchantToken(): string;
// mintMerchant and authenticateMerchant retain their existing signatures.

// src/lib/onboarding/registration.ts
export type RegistrationResult =
  | { status: "created"; merchantId: string; token: string }
  | { status: "rate_limited" };
export function registerMerchant(db: Db, name: string): Promise<RegistrationResult>;

// src/app/merchant/session.ts
export function setMerchantSession(token: string): Promise<void>;
// currentMerchant retains its existing signature.

// src/app/merchant/actions.ts
export type CreateWorkspaceState = {
  status: "idle" | "invalid_name" | "rate_limited" | "failed";
};
export function createWorkspace(
  previous: CreateWorkspaceState,
  form: FormData,
): Promise<CreateWorkspaceState>;
// Success redirects; it never returns a credential in form state.
// enterWithToken retains its existing signature and authentication checks.
```

```sql
-- drizzle/0018_merchant_self_service.sql
register_merchant(p_name text, p_token_hash text) RETURNS uuid
-- Valid request: return the new merchant ID.
-- Hourly ceiling reached: return NULL without insertion.
-- Invalid name/hash: raise check_violation with a named constraint.
-- SECURITY DEFINER; SET search_path = public, pg_temp.
-- REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO backfill_app.
```

## Call stack

New workspace: entry form → `createWorkspace` → existing-session check → `MerchantName.safeParse` → `registerMerchant` → `newMerchantToken` and SHA-256 → SQL function → existing cookie setter → redirect to `/merchant/access`.

Returning workspace: entry form → `merchantTokenFromLink` → existing `enterWithToken` → token-hash lookup → shared cookie setter → existing workspace. A direct private link retains its current fragment-based flow.

Save access: server reads cookie → authenticates token → save-link component receives only that session's token → browser constructs current-origin fragment link → explicit copy/download. Signed-out access redirects to entry. Do not put token values into logs, HTML attributes on unrelated pages, query strings, browser storage, screenshots, or test reports.

## Decisions to implement exactly

- Link parsing accepts full current-origin links or `/merchant/enter#<token>` paths. Reject foreign origins, userinfo, other paths, query parameters, and malformed fragments. Never navigate to a pasted URL.
- Set the same HttpOnly, SameSite=Lax, `/merchant`-scoped, 30-day cookie used today; Secure in production.
- Registration validates its trimmed 1–120 character name and lowercase 64-hex token hash again in SQL. The browser never supplies the token to the signup action; it is generated server-side.
- Registration uses one fixed advisory-lock namespace, checked for collision with existing lock keys at implementation time. Capture database wall-clock time after acquiring the lock; count merchant timestamps within the rolling hour before inserting. Website callers serialize under the same function. CLI administration remains outside the public signup ceiling enforcement, as documented in Gate 2.
- Use a parameterized SQL function call. Catch only database work in the action; keep Next.js success redirects outside the error catch.
- The 30/hour cap is global. Do not describe it as a per-person limit. A malicious visitor could consume it; this version has no ownership verification or bot challenge.
- Disable pending form submission, and reuse the current workspace when already signed in. Do not promise exactly-once creation after independent requests or a lost HTTP response.
- Cookie-authenticated pages are dynamic. Set explicit private, no-store response caching for the access page using the existing Next headers configuration and assert the final response headers in browser tests.
- If clipboard permission is denied, keep the selectable field and download option usable. Downloads contain the current link, use a generic filename, and revoke temporary object URLs.
- Use short copy from the approved HTML mockups. Error examples: “Enter your café name.”, “Try again later.”, and “That link isn't valid.”

## Test plan

- `validates café names`: trims a normal name; rejects whitespace-only, non-string, and over-120 input.
- `parses only this site's merchant links`: accepts full and relative valid links; rejects foreign-host links, other paths, queries, userinfo, and broken tokens.
- `creates through the restricted role`: web-role function call creates a usable hashed-token account; direct INSERT/UPDATE/DELETE remain denied and public execution is denied.
- `refuses invalid SQL inputs`: empty/overlong names and malformed hashes create no records.
- `enforces the rolling ceiling under concurrency`: seed 29 current merchants; two concurrent website registrations produce exactly one creation and one capped result. Rows older than an hour do not consume slots.
- `same names stay separate`: two same-name signups produce distinct accounts and tokens; neither opens the other's seeded private draft through merchant routes.
- `returns after saving a link`: create through the website; download the link; use it in a fresh browser context; confirm the same merchant account and no additional row.
- `supports returning paste and existing links`: test both paste entry and direct entry with a preexisting CLI-minted account.
- `handles ordinary failures`: invalid input, unknown token, denied clipboard permission, and database failure produce short usable states. A failed creation sets no successful session.
- `handles authenticated entry`: `/merchant` shows the existing workspace; signing out hides it; save-link access without authentication redirects.
- `keeps signup inert otherwise`: row counts for offers, commitments, and model calls stay unchanged during signup and return tests.
- `fits the approved screens`: keyboard operation and no horizontal overflow at 375px and desktop widths, with light and dark themes; mask credentials in screenshots and disable trace/video capture for these tests.

## Least confident decisions

1. Private-link login has no automatic recovery if both the saved link and session are lost. This is the approved first-version tradeoff.
2. The global 30/hour ceiling limits growth but can block legitimate visitors after other visitors consume it.
3. Production self-service requires applying migration 0018 before deploying signup. Local implementation approval does not authorize that production release.
