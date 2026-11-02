# Backfill three-minute video storyboard

Preparation only. No recording, new model call or upload is authorized by this document. The user records or approves the final video. Production merchant pages can trigger Wonder, so the merchant segment uses the isolated local preview or an approved existing recording.

## 0:00 to 0:20: the problem

Screen: landing page, then the merchant workspace. Keep the site name visible.

Narration: "An empty table at three in the afternoon cannot be sold tomorrow. Backfill lets Singapore restaurants and cafés offer that quiet-hour capacity to buyer agents, on the merchant's own terms."

## 0:20 to 0:55: merchant control

Screen: local menu review, terms form, then a confirmed offer with chips and summary. A caption says "Synthetic merchant. Recorded or offline menu-extraction fixture" if that is the source used. Do not present a fixture as a fresh Spark response.

Narration: "Muse Spark reads the menu. The owner checks it and chooses the discount, time window, minimum group size and per-agent cap. A hidden floor protects the merchant's price. Nothing is published until the owner confirms. These limits are enforced in code, including when Spark proposes a counter-offer."

## 0:55 to 1:45: alone versus pooled

Screen: demo in Alone mode, then Pooled. Show the provenance label throughout. Use an already completed replay, not a fresh paid run, unless a new capped authorization is granted.

Narration: "Here are recorded decisions from simulated buyers. Each agent stays below the group minimum. Alone, none unlocks the offer. Through the MCP connector, their commitments join the same pool. At the deadline, the clearing engine checks the terms and capacity. In this replay, sixteen covers fill. This is a synthetic merchant and a replay of recorded decisions, not sixteen new restaurant bookings."

## 1:45 to 2:10: ledger and next offer

Screen: ledger split, recorded Wonder plan, approval status. If showing the real Muse commitment, keep its separate-pool label visible and do not change it.

Narration: "The ledger reconciles the accepted fills. Buyers receive all the savings; agents and the network receive zero. The replayed sellout produces a recorded Wonder proposal for the next offer. It still needs merchant approval. A real Muse account has also submitted through this connector, shown separately from the simulated pool."

## 2:10 to 2:40: why Spark

Screen: the Why Spark page for the four model roles, then the diagnostics page at `/system` showing the stored call log. Both read live from the database, so nothing on screen can drift from what actually ran.

Narration: "Spark reads the menu, proposes every merchant counter-offer, and decides for each simulated buyer. Wonder re-plans after a sellout. Every call goes to the Meta Model API and is stored with its model, token counts, latency and cost — here they are. And a price is never taken on the model's word. Each proposal is checked in code against the merchant's private minimum. One below it is refused and never signed, and that refusal looks exactly like a merchant choosing to hold, so a buyer cannot probe the floor."

## 2:40 to 3:00: close

Screen: landing page and public URL.

Narration: "Backfill gives small merchants a way to work with agents without surrendering their terms. The connector, clearing engine and ledger make the agreement explicit. The next step is testing demand with real merchants. Try the recorded demo at the link."

## Recording readiness

- Local visual acceptance and publication are still separate decisions.
- A fresh model run requires the user to name a budget cap and confirm provider key limits. Paid S7 record mode currently remains disabled in code pending an enforced allowance.
- No secrets, secret-link fragments, cookies, environment files or provider dashboards appear in the recording.
- The user approves or records the video, uploads it, and submits the final form. This session has not performed those actions.
