# S6b offline pricing design

S6b asks how deterministic pricing policies behave once the buyer model is explicit.
It does not change, replace or re-score S6.
[S6's genuine result](evidence/s6-live-authorized-2026-11-04-01/README.md) stays negative for the tested AI advantage.

## Authority

S6b uses no inference, provider credentials, production access, migration, deployment or publication.
All S6 inference authority stays consumed and closed.
Spark has no S6b measurement.
Its S6 recordings apply only to exactly matching inputs, and S6b's merchant names guarantee that none match.
A later Spark arm would need a new signal, a new pre-registration and a new explicit approval.

## What S6 left open

S6 had no reservation price, so each bid acted as a hard budget.
Production separates `bidCents`, which the user asks for, from `maxPricePerCoverCents`, the most the user will pay.
Production also returns a usable signed `counterOffer` for held and countered rounds.
S6b therefore gives every synthetic buyer an explicit reservation and commit rule.

## Frozen inputs

[s6b-cases.json](s6b-cases.json) is frozen by SHA-256 before any S6b result exists.
It expands to 3 price worlds, 5 pool states, 5 buyer styles and 10 reservations, which gives 750 worlds.
Each of the 7 policies runs in every world, which gives 5,250 outcomes.

The buyer styles are:

- `walk_one`: one bid at the reservation, then commit only if accepted, which is S6's one-bid buyer.
- `open_take`: one bid below the reservation, then take the signed counter if it is at or below the reservation.
- `repeat_take`: repeat the reservation for up to three rounds, then take the last counter if it fits.
- `ladder_take`: rise toward the reservation over three rounds, then take the last counter if it fits.
- `lowball_take`: bid far below the offer for up to three rounds, then take the last counter if it fits.

`fixed_max` is the comparator and calls the existing `fixedConcession` unchanged.
`pivotal_max_else_hold` is the only policy that reads server pool state.
Today's `ProposalInput` cannot supply that state, so this policy is diagnostic only and would need a product change.

## Measures and decision rule

Each outcome records focal seats, whole-pool seats, focal and whole-pool cents, and margin at each declared cost.
Costs are synthetic percentages of the offer price, not merchant data.
Results are reported by buyer, price world and pool state.
No buyer mix is assumed, so no weighted overall score is produced.

The decision rule is stored in the frozen file and is applied mechanically.
A policy becomes a default candidate only if it matches or beats `fixed_max` in every buyer by price-world slice.
It must do so on focal seats, whole-pool seats and whole-pool margin at every declared cost.
If no policy passes, no winner is named and the choice remains a product decision.

## Known limits

This pre-registration is not blind.
It was written after the S6 diagnosis and after an exploratory grid on similar buyer styles.
Step sizes are set as fractions of the allowed concession so they avoid the 9-cent coincidence with S6's 535 bids.
Reservations are a fixed grid, not a demand estimate, and background parties always arrive first.
Buyers are scripted and do not react to a merchant's pricing history across visits.
S6b therefore measures policy behavior under stated assumptions, not real demand, attendance, revenue or profit.

## Execution order

1. Freeze the case file hash before the simulator exists.
2. Build the simulator from the real `settleRound` and `clear` functions.
3. Require the simulator to reproduce all 24 saved S6 outcomes.
4. Require sampled S6b worlds to match real `negotiate`, `submitCommitment` and `settleDue` on a disposable local database.
5. Run S6b once, with write-once output, and keep the result whatever it shows.
