# Redesign proposal: Backfill UI before S9 and S10

Status: approved by the user, 2026-11-01. Start S8.5 directly on its own slice branch.
Pet decision: Kopi, an original coffee-cup character; implementation belongs to S9.5.
Scope: the web UI only.
No domain, clearing, ledger or MCP behaviour changes.

## Answer first

S9 and S10 as planned do not change the design.
S9 adds "one chart in `evals/results`, also shown on the demo screen".
S10 adds Playwright, rehearsals and "fix every visual flaw seen", which polishes what exists but does not redesign it.
So without a redesign slice, the judges see today's UI with one chart added.

## What a judge sees today

- `/` is still the S1 tracer page: "Latest Muse Spark reply" and an "Ask Muse Spark" button.
It is the first page a judge opens, and it says nothing about restaurants, cafes, pools or Muse.
- `/demo` is correct but reads like a test report.
Two long lists of 11 truncated intents, the same buyers twice, and provenance paragraphs in grey.
The one visual is a 4px progress bar.
The savings ledger, the core "everyone wins" proof, is not on the demo at all; it lives on the merchant page.
- `/merchant` is one 2xl column of seven stacked cards with sentences like "Unlocks at 8 covers · up to 4 per agent · 20 covers available · your floor S$4.76 (never shown to buyers) · terms v3".
- There is no navigation between the three pages, and no page explains the product in under 10 seconds.
- Colour carries no meaning: every state is blue or grey, so "filled", "below minimum" and "refused by floor" look alike.

The engineering is strong and the UI hides it.
The redesign's job is to make every guarantee the code enforces visible as a picture, not a paragraph.

## Design principles

1. **Numbers and pictures over sentences.**
Every card gets a copy budget of one headline (max 8 words) and one subtitle (max 12 words).
Long explanations move into an info popover.
2. **Honesty stays, but small.**
The provenance rules (recorded replay, simulated buyers, real Muse user) are a strength.
They become chips ("Replay", "Simulated", "Real Muse user") with a popover holding today's full sentence, so nothing true is deleted.
3. **Colour has meaning.**
Filled or unlocked is green, waiting is amber, refused or below minimum is muted red, the hidden floor is a lock-icon slate, Meta models keep the Muse blue, DeepSeek gets one neutral contrast colour.
4. **One shell.**
Top bar with the Backfill mark, nav (Live, Evals, Merchants, How it works), live-feed dot, and the pet.
5. **Built for a 3-minute video.**
Every page has one hero visual that reads at 1280x720 in a screen recording.

## Information architecture

| Route | Today | Proposed |
|---|---|---|
| `/` | S1 tracer | Pitch landing: one hero line, live stats from the DB, 3-step picture, CTA "Watch it clear live" |
| `/demo` | Two lists | Live dashboard (below) |
| `/evals` | None | S9 head-to-head (below) |
| `/merchant` | Single column | Merchant dashboard (below) |
| `/system` | None | The tracer moves here, plus `llm_calls` cost totals; keeps S1's exit visible without being the front door |

## `/` landing

- Hero: "Your restaurant isn't on Muse. Now it is." with a short subline about pooled agent commitments.
- Live stat strip, read from the ledger and clearings: covers filled, buyer savings in S$, agents that committed, pools unlocked.
- Three-step picture, icons not paragraphs: menu photo, agent terms, pool clears.
- "Why now" as three logo-free facts (Muse launched 2026-10-28, small merchants not on it, retailers abroad block agents).
- Two CTAs: "Watch it clear live" to `/demo`, "See Muse Spark vs DeepSeek" to `/evals`.

## `/demo` live dashboard

Layout at 1280: KPI strip on top, the pool visual in the centre, an event timeline on the right, the ledger split and Wonder plan below.

- **KPI strip:** countdown to commit-by, covers committed vs minimum, discount and price ("S$6.80 to S$5.44"), buyer savings so far.
- **Pool visual (the hero):** each buyer agent is a small avatar token.
A mode switch "Alone / Pooled" animates between two states:
alone, each token sits under its own mini gauge that stops short of the minimum line and turns red;
pooled, the tokens fly into one ring gauge that crosses the minimum line and turns green.
This replaces the two duplicated lists and makes the thesis visible in two seconds.
- **Buyer detail:** hover or tap a token to see its intent ("Kopi and kaya toast after 2pm for me and my mum") and its outcome chip.
The full list stays available as a collapsible table for accessibility and E2E selectors.
- **Event timeline:** commitment arrived, pool unlocked, cleared, sold out, Wonder re-planned, each with a time in `Asia/Singapore`.
- **Ledger split:** one stacked bar per cleared pool, buyer share, agent share, network share, with "Totals reconcile" as a green check chip.
Data already exists in `merchantLedger`; it needs a public, floor-free read for the demo merchant.
- **Wonder re-plan:** a diff card, old terms to new terms as chips ("20% to 15%", "16 to 24 covers", "min 8 to 12"), rationale behind a "Why" popover, and a "Checked against merchant limits" chip.
- **Real Muse user:** a spotlight card with a distinct badge and its own small ring gauge.
- **Replay button:** "Replay this scene" re-animates the stored commitments in `committedAt` order on the client.
No model calls and no writes, so it is safe in front of judges and gives a clean take for the video.

## `/evals` (S9 shown through design)

S9's numbers are the strongest technical-depth and Meta-tooling proof, so they get their own page, not a chart pasted under the demo.

- **Scoreboard header:** Muse Spark vs DeepSeek, head to head, with episode count and date of the run.
- **Three paired metric cards:** deal rate, average buyer savings, cost per deal (cost from `llm_calls`, never estimates).
Each card shows both bars, the delta, and which model wins that metric.
No single "winner" banner unless one model wins all three.
- **Guardrail card:** proposals each model made outside the limits, and how many the domain refused before they could count.
This is the "limits live in code, not prompts" story in one number per model.
- **Cost vs deal-rate scatter:** one dot per model (or per run), so the trade-off reads at a glance.
- **Episode grid:** one cell per scenario per model, green deal, grey no deal, red refused proposal.
Clicking a cell opens the episode.
- **Episode replay drawer:** a price ladder between the buyer's max and the hidden floor band, with each round's signed counter-offer as a marker climbing or falling, and the final clear or refusal.
This shows the 3-round bounded negotiation visually.

What this changes in S9 itself:
- S9's output must be machine-readable: `evals/results/<run-id>.json` with per-episode rows (scenario, model, rounds, proposals, refusals, outcome, savings, `llm_calls` ids, cost), plus a summary block.
The Next app reads that file at build time or from a table; the PNG chart becomes a by-product, not the deliverable.
- Both models run the same scenarios with the same seeds, so the grid lines up cell for cell.
- The exit becomes: "`/evals` renders the run JSON, and every number on it traces to `llm_calls` rows."

## `/merchant` dashboard

- **KPI tiles:** dead-hour covers filled this week, revenue recovered, buyer savings, pools unlocked vs missed.
- **Off-peak heatmap:** weekday by hour; offer windows outlined, cells shaded by fill.
It shows "we sell your dead hours" without a sentence.
- **Offers as cards:** terms as chips (window, discount, min pool, per-agent cap, capacity), the floor behind a lock icon with "Only you see this".
- **Onboarding as a 3-step stepper:** photo, check what Muse Spark read (menu items with the cover items highlighted, already built), set terms.
Terms get sliders with a live preview line: "S$6.80 becomes S$5.10; your floor S$4.76 is safe."
- **Wonder plans:** the same diff card as the demo, with "Apply plan" as the primary button.
- **WhatsApp:** a "Connected channel" card with the linked phone ending.

## The pet

The idea is good if the pet is truthful: it reacts only to real events, so it narrates the system instead of decorating it.
That also solves "less wordy": a short speech bubble replaces a paragraph.

**Name and brand.**
I recommend our own mascot rather than "Muse Pet".
Muse and its Jolly mascot are Meta's brand; a look-alike risks reading as impersonation to Meta judges.
Chosen under the user's delegated choice: Kopi, an original coffee-cup character, labelled "powered by Muse Spark" where relevant.

**Behaviour.**
It lives bottom-right in the shell, about 72px, draggable, dismissable, and remembers "hidden" in `localStorage`.

| Trigger | Where it comes from | Animation | Bubble (max ~6 words) |
|---|---|---|---|
| Page idle | Timer | Breathing, blinking, sleeps after 60 s | "Zzz" |
| Buyer commitment arrives | SSE snapshot gains a buyer | Looks toward the pool, nods | "+3 covers" |
| Pool crosses minimum | `pooled.unlocked` flips true | Jumps, confetti | "Unlocked!" |
| Clearing done | `phase` becomes `cleared` | Stamps a receipt | "S$12.40 saved" |
| Sold out | `pooled.soldOut` | Flips the "Sold out" sign | "Sold out!" |
| Wonder re-plans | `plan` appears | Puts on glasses, thinks | "New plan ready" |
| Floor refusal / guardrail | Eval refusal or merchant `plan_refused` | Raises a shield | "Below floor. Nope." |
| Menu read starts / done | Merchant upload pending / `published` | Reads a menu / thumbs up | "Reading menu..." |
| Eval page reveal | `/evals` load | Holds up both scorecards | "Spark vs DeepSeek" |
| Feed stale | `stale` event | Worried look | "Reconnecting" |

**How to build it.**
- Events: a tiny client event bus (`pet.emit("unlock")`).
`LiveBoard` diffs consecutive SSE snapshots and emits; merchant pages emit from the existing `?status=` values; `/evals` emits on load.
No server change and no new endpoint.
- Rendering: one inline SVG with named parts (body, eyes, arms, prop slot), animated by a small state machine plus CSS keyframes or the `motion` library.
No Lottie or Rive asset pipeline, so changes stay in code and review.
- Rules: one animation at a time with a queue capped at 3, `prefers-reduced-motion` swaps animations for a static pose plus bubble, bubbles are `aria-live="polite"`, never covers a button, hidden in Playwright by a query flag so E2E stays deterministic.
- Cut line: v1 ships idle, nod, unlock, sold out and shield.
Glasses, receipt stamp and eval pose are v2.

## Visual system

- Keep the cream, ink and Muse blue base and the wash bar; add semantic tokens: `--good`, `--wait`, `--bad`, `--floor`, `--spark`, `--deepseek`, each with a dark-mode value.
- Headings in Gloock (high-contrast display serif, italic for the accent phrase); text, numbers and UI in Manrope with `tabular-nums` so counters do not jitter.
Gloock is display only: never below 20px, never for numbers.
- Cards: fewer borders, more whitespace, one elevated hero card per page.
- Charts hand-rolled in SVG (ring gauge, paired bars, stacked bar, scatter, heatmap, price ladder).
Six small charts do not justify a chart library, and hand-rolled SVG stays pixel-exact in both themes.
- Every page checked at 375 and 1280, light and dark.

## How this lands in the slices

Deadline is 2026-11-04, so the redesign has to slot in, not add a week.

| Day | Slice | Work |
|---|---|---|
| Nov 2 AM | **S8.5 Design shell (new)** | Tokens, shell and nav, `/` landing, `/system` move, `/demo` dashboard with pool visual, ledger split, Wonder diff, replay button |
| Nov 2 PM | **S9 Evals (changed)** | Harness writes the per-episode JSON; `/evals` scoreboard, paired metrics, guardrail card, episode grid; drawer if time |
| Nov 3 AM | **S9.5 Pet + merchant (new)** | Pet v1 (5 states) wired to demo, merchant and evals; merchant KPI tiles, offer chips, onboarding stepper |
| Nov 3 PM | **S10 Harden (changed)** | Playwright over the new routes with the pet hidden; visual checks at 375 and 1280, light and dark; reduced-motion check |
| Nov 4 | **S10 Record and submit** | 5 replay rehearsals, final live run, video, submission |

S9's harness (Python, `evals/agenticpay`) and S8.5's UI touch different files, so they can run in parallel.

Cut order, first cut first:
1. Pet v2 states.
2. Episode replay drawer on `/evals`.
3. Merchant heatmap.
4. `/` live stat strip (keep a static hero).
5. Pet v1 (only if the demo dashboard or `/evals` is at risk).

Never cut: the `/demo` pool visual, the `/evals` paired metrics, the shell and nav, the landing that replaces the tracer.

## Video storyboard (3 minutes)

1. 0:00 `/` landing: the problem in one line, the stats strip.
2. 0:20 `/merchant`: photo to published offer in the stepper; the pet reads the menu.
3. 0:55 `/demo`: "Alone" mode, every token red; switch to "Pooled", the ring crosses the line, the pet cheers; sellout, Wonder diff card.
4. 1:50 Ledger split and the real Muse user card.
5. 2:10 `/evals`: Spark vs DeepSeek paired metrics, the guardrail number, one episode's price ladder.
6. 2:45 Close on the landing CTA.

## Decisions recorded, 2026-11-01

1. S8.5, S9.5 and S9's exit change to per-episode JSON plus `/evals` are approved.
2. Kopi, an original coffee-cup character, is selected under the user's delegated choice.
3. Start S8.5 directly on its own slice branch, following the user's final instruction.
