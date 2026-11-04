# S6b offline pricing, 2026-11-04

**No policy passed the frozen decision rule, so no winner is named.**
Choosing a default remains a product decision that needs a merchant cost and buyer mix.
AI was not measured, and no inference ran.
S6's genuine negative result stays the result of record.

[HTML results](run-01/report.html), [all slices](run-01/summary.json), [pinned sources](run-01/source-manifest.json), [case freeze](case-freeze.json), [design](../../s6b-design.md), [S6 replay](../s6-diagnostic-2026-11-04/README.md).

## Result

The run covers 750 frozen synthetic worlds and 7 deterministic policies, for 5,250 outcomes.
The table compares each policy with `fixed_max` across 15 buyer by price-world slices and 60 margin checks.

| Policy | Focal seats behind | Pool seats behind | Margin behind | Margin ahead |
|---|---|---|---|---|
| `always_hold` | 13/15 | 13/15 | 52 | 0 |
| `half_step` | 7/15 | 7/15 | 32 | 16 |
| `quarter_step` | 11/15 | 11/15 | 52 | 4 |
| `hold_first_then_max` | 5/15 | 5/15 | 20 | 8 |
| `accept_in_band_else_hold` | 6/15 | 6/15 | 24 | 4 |
| `pivotal_max_else_hold` | 13/15 | 13/15 | 52 | 0 |

`fixed_max` is not dominant either.
`half_step` beats it on seats in 2 slices and `quarter_step` in 1, all in price world `p2` with its 535 floor.
Those slices are `half_step` on `open_take` and `lowball_take`, and `quarter_step` on `lowball_take`.
Across each buyer style, `fixed_max` has the best or tied-best seats and deal rate.
On pool margin it leads for `walk_one`, `open_take` and `repeat_take` (tied with `hold_first_then_max` on `repeat_take` and with `accept_in_band_else_hold` on `walk_one`).
`hold_first_then_max` leads against `ladder_take`, and `half_step` leads against `lowball_take`, at every declared cost.
The cost of `fixed_max` is price: focal prices average 95.7% to 99.0% of the offer depending on buyer style.

`pivotal_max_else_hold` matched `fixed_max` in pivotal and solo pools.
It lost seats and margin in already-unlocked pools, so pool awareness alone did not help here.

## Post-hoc check, outside the decision rule

This check was not pre-registered, used pivotal pools only, and only compared `fixed_max` with `always_hold`.
`always_hold` would need buyers with reservations at or above the offer to be 79% to 99% of demand before it matched `fixed_max`.
The threshold depends on buyer style and cost.
For `walk_one` and `repeat_take` there is no threshold, because `fixed_max` gives such buyers no discount.
This does not measure the real share of such buyers, and the frozen grid gives them only 2 of 10 reservations.

## Validity and limits

The case and design hashes were frozen before any S6b result existed, but the pre-registration is not blind.
It followed the S6 diagnosis and an exploratory grid.
The simulator reproduced all 24 saved S6 outcomes.
It also matched real `negotiate`, `submitCommitment` and `settleDue` on `fixed_max` and `quarter_step` for a sample of every 31st world.
The other 5 policies were not run through real services.
Worlds, reservations, costs and arrival order are assumptions.
These results are not demand, attendance, revenue or profit.

Rerun with `node_modules/.bin/tsx scripts/verification/proof-s6b.ts --check`.
