# S6 offline diagnostic addendum, 2026-11-04

This addendum explains the S6 result. It does not change it.
[S6's genuine evidence](../s6-live-authorized-2026-11-04-01/README.md) stays the result of record and its files are unchanged.
No inference ran, and all S6 authority stays consumed and closed.

Rerun with `node_modules/.bin/tsx scripts/verification/proof-s6-replay.ts --check`.
The replay must reproduce all 24 saved baseline and Spark outcomes before it reports anything.
Spark answers only from a recording with an exactly matching input hash.
[Full numbers](replay.json).

## Findings

The six-seat gap comes entirely from s6-02, s6-06 and s6-11.
Those cases also lost 10 background seats, for a whole-pool gap of SGD 86.04.
Higher Spark prices in s6-03 and s6-12 returned SGD 0.46.

The direct cause is a horizon mismatch.
Seven model cases have one bid and then stop, but Spark is told "round 1 of at most 3" and to concede slowly.
On the same numbers, Spark accepted the 535 bid 0 of 7 times, with an exact 95% upper bound of 41%.
Seven of its eight first-round holds cite remaining rounds, and both final-round rationales mention the final round.
This is correlation only, because removing the prompt text would change the inputs.

The benchmark also treats each bid as a hard budget.
Production separates `bidCents` from `maxPricePerCoverCents` and returns a usable counter for held and countered rounds.

## Budget sensitivity

Here the buyer also takes the last signed counter at or below last bid + δ.
The ladders and recorded inputs do not change, but the buyer's acceptance is an assumption.

| δ (cents) | Spark seats / focal SGD | Fixed seats / focal SGD |
|---|---|---|
| 0-6 | 6 / 32.44 | 12 / 64.08 |
| 7-8 | 8 / 43.28 | 12 / 64.08 |
| 9 | 12 / 65.04 | 12 / 64.08 |
| 10-34 | 12 / 65.04 | 14 / 74.28 |
| 35-44 | 14 / 75.74 | 14 / 74.28 |

At δ=35-37, Spark beats every step policy, by 18 cents over the best one chosen after the fact.
At δ=44, always-hold earns SGD 76.16 and beats Spark.

## Unmeasured

Spark's behavior when a one-bid buyer returns for rounds 2 and 3 is unmeasured in all seven one-bid cases.
The causal effect of the prompt text is unmeasured.
Real buyer reservations and merchant costs are unknown.
