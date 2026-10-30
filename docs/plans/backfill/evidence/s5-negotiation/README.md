# S5 negotiation mutation evidence

Mutation testing for S5 on 2026-10-30, at `7a5382b`, with the runner [../s1-review/mutate.mjs](../s1-review/mutate.mjs).
Each mutation changes one guard, runs the full unit and integration suite, and counts as killed only if a test fails on an AssertionError.
The runner then restores every file it changed, checks each is byte-identical, and reruns the suite green.

| File | Holds |
|---|---|
| `mutations.json` | 68 mutations: the round limit, the concession step and its rounding, every proposal bound, the hold on a refused or missing proposal, the strict signed counter-offer and its HMAC checks, every `negotiate_offer` refusal and race, the model failure turned into a hold, the conditional tool, every counter-offer check at submit, the per-agent cap at each commitment's own price, the per-commitment clearing price as cleared, stored and reported, and the migration `0006` constraints and `0007` triggers and grants |
| `results.json` | The run at `7a5382b`, baseline 194: all 68 killed on an AssertionError, each restored byte-identical, each rerun green |
| `results-first-run.json` | The first run, at `2b2e58c`, baseline 190: 58 killed and 10 survived, and 2 reruns not green |

The runner now accepts a mutation as a list of `edits`, applied together.
Four mutations use it to remove an app check together with the trigger or mapping behind it, since removing either alone changes no reply: the agent and covers checks at submit, the latest-round price check, and the `commitments_negotiated_match` mapping.

## First run

The 10 survivors were test gaps, all closed in `7a5382b` before the rerun:
- `submit-counter-agent` and `submit-counter-covers`: the test's other-agent and other-covers cases used round 1's token, so the latest-round check refused them whatever the agent or covers; they now use the latest token.
- `neg-unavailable`: nothing negotiated on a rule whose offer price is below its floor; the mutant answered `negotiation_closed`, which hints at the floor.
- `neg-closed-terms`: nothing bid again after a terms change.
- `neg-busy-mapping`: only the first round was raced; a second-round race is now tested.
- `submit-idempotency-negotiation`: nothing replayed a key without its counter-offer.
- `db-match-rule`, `db-match-terms`, `db-match-visit` and `db-commitment-fixed-negotiation`: no direct insert or update reached these trigger clauses; one test now inserts as the runtime role with each field changed, then updates the price of a negotiated commitment.

The 2 reruns that were not green, on unmutated files, were most likely chance collisions in two leak checks; the runner does not record which test failed in a rerun.
One check grepped a reply for `899` and `903` while the reply held a random UUID and a base64 token, which can contain those digits; 1 of 40 plain runs failed on it.
The other grepped the model prompt for `903` while the merchant name had a random hex suffix.
The first now strips the random values and decodes the token's price; merchant names are now numbered.
The 68 reruns of the second run were all green.

`neg-busy-first-round` and `neg-busy-mapping` depend on two requests racing, but the test holds both model calls at a barrier until both have read the round, so these kills are certain rather than likely.

## Rerun

Run from a copy of the tree, never the working checkout, because the runner edits files:

```bash
git archive HEAD | tar -x -C /path/to/copy
```

```bash
cp -cR node_modules /path/to/copy/node_modules
```

```bash
env -u DATABASE_URL TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres node docs/plans/backfill/evidence/s1-review/mutate.mjs /path/to/copy docs/plans/backfill/evidence/s5-negotiation/mutations.json /path/to/results.json
```

`TEST_DATABASE_URL` must point at a disposable local PostgreSQL, never Neon.
