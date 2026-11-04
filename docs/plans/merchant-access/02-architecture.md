# Architecture: Merchant website access

Status: APPROVED 2026-11-04, including the database permission amendment.

## Amendment after permission review

The original no-migration claim was incorrect. `drizzle/0005_s4_triggers_runtime_role.sql` grants `backfill_app` SELECT on merchants, while the CLI minting helper inserts directly. Reusing that helper from a website action would fail under the intended runtime role.

Add migration `0018_merchant_self_service.sql` with a restricted `register_merchant` SECURITY DEFINER function. It validates the name and token hash, enforces the signup ceiling, inserts one merchant, and returns its ID. Revoke public execution and grant execution to `backfill_app`; retain the role's lack of direct INSERT, UPDATE, and DELETE access to merchants. This follows the existing publication-function pattern in migration 0009. No new table is needed. Production application of this migration remains a separate release step.

## Fit

Keep `/merchant` as both the public entry and authenticated workspace. Replace only its signed-out placeholder with the approved entry form. Rename the merchant navigation link and add a homepage entry link without undoing the existing copy edits.

Reuse the existing token generator, `authenticateMerchant`, the merchant cookie, and the current workspace. Preserve the CLI's `mintMerchant` behavior. Website creation calls the restricted registration function through the onboarding service layer; request validation and cookies belong in merchant server actions. Extract the existing cookie setter so signup and link entry share its policy.

## Endpoints

- `GET /merchant`: show the entry form when signed out and the existing workspace when signed in.
- Next.js server action on `/merchant`: validate the café name, create a workspace, set its cookie, and navigate to `/merchant/access`.
- `GET /merchant/access`: authenticated page for copying or downloading the current workspace access link. Redirect signed-out visitors to `/merchant`.
- Existing `GET /merchant/enter#<token>`: preserve direct private-link entry. Improve its failure message to link back to the public entry form.
- Existing `enterWithToken` server action: also handles the returning-merchant form after the browser extracts and validates the token from a same-origin access link.

No standalone API endpoint is needed. A signup GET must never create a merchant.

## Data

Use the existing `merchants` table. One function-and-permission migration is needed; no new table is needed.

- New signup inserts one merchant with a generated random token's SHA-256 hash, using the existing token format.
- Authentication continues to look up the token hash, never the café name.
- Duplicate café names are allowed as separate workspaces; they never transfer ownership or reuse an existing merchant's link.
- Keep the existing CLI minting behavior.

Signup write protection: the registration function serializes website creation using a transaction-scoped advisory lock and applies a global ceiling of 30 merchant creations in a rolling hour, counted from existing merchant timestamps. This is a proposed operating limit, not a measured demand figure. It needs no IP collection or external limiter. CLI-created merchants count toward the ceiling, although the CLI itself remains available. A rejected attempt gets a short retry-later message. The cap limits row growth but is not bot or ownership verification.

Disable the create button while submitting. An already authenticated signup request returns to its workspace rather than creating another. Independent unauthenticated attempts can still create separate workspaces; do not claim exactly-once creation across browser or network failures.

## Flow

### New merchant

Homepage or navigation → `/merchant` → café name form → server validation → existing-session check → transactional creation ceiling and mint → existing merchant cookie → `/merchant/access` → copy or download link → existing workspace.

The café name is trimmed, required, and limited to 120 characters. Server actions validate submitted input even if browser validation is bypassed. Creation failures keep the visitor on the entry form with a brief message; log only safe error metadata.

### Returning merchant

Paste the saved link → browser checks its origin and `/merchant/enter` path and extracts the fragment → existing token authentication → existing cookie → `/merchant`.

Do not navigate to arbitrary pasted URLs, log pasted links, or put a token in a query string. The link belongs to its current host, so localhost and deployment links are separate.

### Save access

Authenticate the server-side cookie before exposing its current token to the save-link component. Construct the URL from the browser's current origin and `/merchant/enter#<token>`, avoiding mismatched localhost settings or untrusted forwarded host values. Keep the token only in the component memory and existing HttpOnly cookie; do not add browser storage. Copy and download happen locally on an explicit click. Dynamic authenticated pages must not be publicly cached. The token never enters a server redirect URL or an application log.

The save-access page remains reachable from the authenticated workspace, so a merchant who still has a valid cookie can save their link again. Losing both the saved link and the session has no automatic recovery.

## Existing authentication policy

Keep the HttpOnly, SameSite=Lax, `/merchant`-scoped, 30-day cookie and Secure flag in production. Preserve per-action merchant authentication for menu, offer, voice, and photo mutations. Knowing a café name never grants access. Workspace creation does not verify restaurant ownership.

## External

No new provider, secret, environment variable, email, password system, AI call, or payment is required. This uses the application's existing database configuration. Verify mutations against disposable local PostgreSQL, never the configured production database.

## Scope and verification boundary

The local implementation is complete; observed results are recorded in `00-status.md`. Its verification covers workspace creation using the restricted runtime role, saved-link re-entry in a fresh browser context, same-name workspace isolation, invalid-link rejection, capped concurrent signup, and preservation of existing private links. Existing merchant menu and AI features are retained; signup tests must not invoke them.

No production deployment or production migration is included.
