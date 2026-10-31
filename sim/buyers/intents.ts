// The 20 simulated Singapore buyers. Each is a buyer agent minted as sim-buyer-NN, whose label is
// its intent, so the demo screen can show what each one wanted. Some intents fit an afternoon kopi
// and kaya toast set; a few do not, so a model that reads them should decline those.
export type BuyerIntent = { agentId: string; intent: string };

const INTENTS = [
  "Kopi and kaya toast after 2pm for me and my mum, near Tiong Bahru",
  "A quiet desk near an MRT station to work from for the afternoon, with kopi",
  "Afternoon tea break for four colleagues from the Tanjong Pagar office",
  "Teh tarik and half-boiled eggs, just for myself, any time after lunch",
  "Somewhere to sit with my two kids after school pick-up, before 5pm",
  "Kaya toast set for three of us after a Chinatown walking tour",
  "A cheap kopi stop between client meetings near Outram Park MRT",
  "Book club of four wants a table and kopi on a weekday afternoon",
  "Dinner for six at 8pm with beer, somewhere lively",
  "Iced kopi-o kosong and a quiet corner to study for two hours",
  "Brunch for two at 10am on Sunday only",
  "Two retirees who meet every week for kopi and a chat after 3pm",
  "A late-night supper spot after midnight, nothing in the daytime",
  "Kopi and toast for a team of four after a site visit near the MRT",
  "My partner and I want kaya toast and a slow afternoon coffee",
  "Vegan lunch for one at noon, no eggs or dairy",
  "Three nurses coming off a morning shift want kopi and toast after 2pm",
  "A desk and kopi for one freelancer, near Maxwell, mid-afternoon",
  "Grandparents and grandchild, three people, want a kaya toast treat",
  "Four students want a cheap afternoon snack and a place to revise",
] as const;

export const BUYERS: readonly BuyerIntent[] = INTENTS.map((intent, i) => ({ agentId: `sim-buyer-${String(i + 1).padStart(2, "0")}`, intent }));

// The .env.local name that holds a buyer's bearer token.
export const tokenEnvName = (agentId: string) => `SIM_BUYER_TOKEN_${agentId.slice(-2)}`;
