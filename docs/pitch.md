# Pitch: Backfill SG

Track: Indie Developer.
Theme: Build for Your World.
Steer: Singapore, from 2026-10-28, the day Muse launched in Singapore.

## One-liner

Backfill plugs Singapore's small merchants into Muse: agents pool binding commitments, and restaurants and cafés sell their dead off-peak hours on terms the merchant sets.

## Why now

- On 2026-10-28, Meta launched Muse, its consumer AI agent, in Singapore with Grab, Shopee, Lazada, Klook, Agoda, ShopBack, Singapore Airlines and Trip.com.
- The independent restaurant and café are not on that list.
They have no API, no partnerships team, and no way into the agent economy.
- Abroad, retailers are pushing back on agents.
Amazon blocks Muse, and Coupang, Kohl's and Delta restrict agent purchases.
Their fear is that agents squeeze margins and take control of the customer.
- Muse reportedly accepts custom connectors over MCP.
Backfill is an MCP server, so a Muse user's own agent can be the buyer.

## Short pitch (about 100 words)

Muse launched in Singapore with Grab and Shopee.
Your restaurant isn't on it.
Backfill is how small merchants plug into Muse without giving up control.
The owner snaps a menu photo, and Muse Spark turns it into an offer.
The owner sets terms agents must accept: "25% off Tue 2-5pm, only if 8 people commit by noon, never below my hidden floor."
Muse users' agents send binding promises through our MCP connector.
One agent can't unlock the deal.
Twenty pooled together can.
In the recorded demo the slot fills, buyers save, and the merchant never had to block an agent or publicly cut a price.

## Full pitch (about 250 words)

Agents are now buying for people in Singapore.
Muse can fill a Grab basket or compare prices on Shopee, but the long tail of local food and drink is invisible to it.

Small merchants do discount, but only capacity that spoils.
An empty table at 3pm on a Tuesday is worth nothing at 6pm.
They can't cut public prices without training customers to wait.
Priceline showed the fix: the buyer commits first, the price stays private, and the deal clears only above the merchant's hidden floor.
People disliked committing blind.
Agents don't mind.

Overseas, retailers answer agents by blocking them.
Backfill gives merchants a better answer: publish terms, and let only agents who accept them in.

1. **Merchant onboarding:** a menu photo becomes a structured offer with Muse Spark vision. The owner confirms it and sets the agent terms: window, discount, minimum pool, per-agent cap, hidden floor.
2. **Buyer side:** a Muse user adds Backfill as a custom connector. Their agent submits a conditional, binding commitment over MCP. Claude or any MCP client works too.
3. **Clearing:** Backfill pools commitments, negotiates in at most 3 rounds with signed counter-offers, and clears only inside both sides' limits. The limits live in code, not in prompts. Every savings split goes to an append-only ledger.
4. **Merchant agent:** Muse Wonder remembers each merchant's rules and fill history and re-plans when a slot sells out.

The demo runs a synthetic Singapore café against 20 simulated Muse Spark buyer agents on a recorded replay; no real payments move.
Solo, no agent unlocks the deal.
Pooled, the off-peak slot fills.

## Stretch: merchant agent on WhatsApp

Heartland merchants already run their business on WhatsApp.
If time allows, the owner sets or changes a rule with a WhatsApp message, and Muse Wonder updates the offer.
This uses the WhatsApp Cloud API test number and is cut first if behind.

## Meta tooling

- **Muse (consumer agent):** the real buyer, through a custom MCP connector. **[unknown]** until the Day 0 check passes.
- **Muse Spark:** menu photo onboarding, negotiation, and the 20 simulated buyer agents.
- **Muse Wonder:** the merchant agent, with memory of rules and fill history.
- **WhatsApp (stretch):** the merchant's own channel.
