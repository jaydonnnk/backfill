# Product: Merchant website access

## Problem

A café owner clicks “Merchants” and reaches a page requiring a private link they cannot obtain through the website. The existing workspace features are inaccessible to a new visitor.

## Proposed experience

1. The main navigation and homepage offer “I'm a merchant”.
2. A visitor enters their café or restaurant name and chooses “Create my workspace”.
3. A successful submission signs them into their own empty workspace, where they can upload their menu and review their offer terms.
4. A prominent first-use message asks them to save their private access link, with copy and download options. Explain that anyone with this link can access the workspace and that it is needed when returning from another browser.
5. Returning merchants can paste their existing access link into the entry page. Existing private links continue to work directly.
6. Already signed-in merchants go to their workspace without another signup step.

Names identify workspaces for display. A matching name does not grant access to someone else's workspace. This signup does not verify ownership of a restaurant. Creating a workspace does not publish an offer or trigger a paid AI call.

## Success metric

Acceptance target: one visitor can create one workspace through the website, save its private link, and reopen the same workspace in a fresh browser session without administrator help. This is a target, not an observed conversion or customer metric.

## Announcement

Merchants can now start from the Backfill website. Choose “I'm a merchant”, enter your café name, and open your own workspace. Save your private link so you can return later. Upload your menu, check the prices, and choose your quiet-hour terms before publishing an offer.

## Constraints and choices

- Approved on 2026-11-04: use the existing private-link approach for the first version, without introducing an email provider or passwords.
- Approval correction: shorten descriptions and explanations. Keep essential access and recovery information in brief sentences.
- A lost private link cannot be recovered automatically in this version. Explain this before creation and when saving the link.
- Never expose an existing merchant's access by searching for their café name.
- Handle empty names, invalid access links, pending submissions, and service failures with clear inline messages.
- Keep the signed-in workspace features and existing homepage copy edits.

## Screens

- `mockups/access.html`: public entry with new workspace and returning merchant forms.
- `mockups/save-access.html`: first-use link saving and continuation to the existing workspace.

These are static visual proposals. Their buttons do not create accounts or copy credentials.
