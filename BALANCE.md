# Rare Royale balance report

6,000 simulated rounds of 50 random Friends (uniform families and Generations, random tactics), plus 2,500 paired rounds per purchase. Entry 1 RF: ladder pool 30 RF (8 / 5 / 4 / 3 / 2.5 / 1.5 / 1.5 / 1.5 / 1.5 / 1.5 RF for places 1–10) and a 0.2 RF bounty on every head. Sponsoring closes at 25 standing.

Battle length in seconds: p10 154, median 174, p90 190, max 291. Knockouts in fights 289772, by the storm 4228. Bounties burned by the storm: 0.141 RF per round.

## What a player can expect from one 1 RF entry

| Tactic | Any RF back | Back at least 1 RF | Top 10 | Win | Average return |
|---|---:|---:|---:|---:|---:|
| All | 45.2% | 20.6% | 20.0% | 2.0% | 0.797 RF |
| fight | 53.5% | 18.2% | 16.6% | 2.8% | 0.909 RF |
| hide | 39.8% | 26.6% | 26.6% | 0.9% | 0.740 RF |
| loot | 42.2% | 17.0% | 16.7% | 2.3% | 0.743 RF |

## By Generation

| Group | Entries | Any RF back | Top 10 | Win rate | Return per 1 RF entry | vs average |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 49537 | 46.0% | 20.7% | 2.2% | 0.840 RF | 1.05x |
| 2 | 50069 | 46.1% | 20.5% | 2.1% | 0.827 RF | 1.04x |
| 3 | 50329 | 45.4% | 19.9% | 1.9% | 0.794 RF | 1.00x |
| 4 | 49996 | 45.6% | 20.1% | 2.1% | 0.801 RF | 1.01x |
| 5 | 49967 | 43.8% | 19.3% | 1.8% | 0.754 RF | 0.95x |
| 6 | 50102 | 44.2% | 19.5% | 1.8% | 0.767 RF | 0.96x |

## By family

| Group | Entries | Any RF back | Top 10 | Win rate | Return per 1 RF entry | vs average |
|---|---:|---:|---:|---:|---:|---:|
| Skeleton | 33195 | 49.2% | 20.5% | 2.3% | 0.856 RF | 1.07x |
| Mask | 33465 | 42.2% | 19.0% | 1.7% | 0.743 RF | 0.93x |
| Family | 33551 | 43.1% | 18.5% | 2.4% | 0.805 RF | 1.01x |
| Cellular | 33430 | 46.6% | 21.4% | 1.7% | 0.806 RF | 1.01x |
| Asymmetry | 33362 | 44.3% | 21.4% | 2.0% | 0.821 RF | 1.03x |
| Hoverer | 33262 | 43.5% | 18.7% | 1.6% | 0.716 RF | 0.90x |
| Colossus | 33401 | 50.6% | 20.8% | 3.0% | 0.909 RF | 1.14x |
| Sparkling | 33159 | 43.7% | 19.1% | 1.9% | 0.762 RF | 0.96x |
| Hollow | 33175 | 43.2% | 20.6% | 1.3% | 0.756 RF | 0.95x |

## By tactic

| Group | Entries | Any RF back | Top 10 | Win rate | Return per 1 RF entry | vs average |
|---|---:|---:|---:|---:|---:|---:|
| fight | 100074 | 53.5% | 16.6% | 2.8% | 0.909 RF | 1.14x |
| hide | 100184 | 39.8% | 26.6% | 0.9% | 0.740 RF | 0.93x |
| loot | 99742 | 42.2% | 16.7% | 2.3% | 0.743 RF | 0.93x |

## Does any purchase pay for itself?

Each pair plays the same seeded round twice for the same Friend: once without the purchase and once with it. The gain is the average extra prize among rounds where the purchase happened, with a 95% interval. Fairness holds when gain < cost.

| Purchase | Rounds bought | Avg cost | Avg return gain | 95% interval | Gain per 1 RF spent | Bought with 30 or fewer standing: gain / cost |
|---|---:|---:|---:|---:|---:|---:|
| Shield, bought at a random moment | 936 | 1.00 RF | 0.296 RF | 0.201 to 0.391 | 0.296 RF | 0.37 / 1.00 RF (155 rounds) |
| Medkit, bought below 50% HP | 1860 | 1.00 RF | 0.176 RF | 0.127 to 0.226 | 0.176 RF | 0.34 / 1.00 RF (188 rounds) |
| Second life, bought when downed | 1313 | 2.00 RF | 0.164 RF | 0.122 to 0.206 | 0.082 RF | 0.42 / 2.00 RF (211 rounds) |
| Medkit, bought as late as possible (hurt, 30 or fewer standing) | 676 | 1.00 RF | 0.422 RF | 0.297 to 0.548 | 0.422 RF | 0.42 / 1.00 RF (676 rounds) |
| Shield, bought as late as possible (30 or fewer standing) | 1342 | 1.00 RF | 0.376 RF | 0.295 to 0.457 | 0.376 RF | 0.38 / 1.00 RF (1342 rounds) |
| Everything, every time (max spender) | 2500 | 6.10 RF | 0.759 RF | 0.679 to 0.839 | 0.124 RF | none |

## Targets

- No Generation, family or tactic earns more than 1.2x the average prize per entry (0.80 RF): PASS (highest 1.14x, By family: Colossus).
- No group earns 1 RF or more per 1 RF entry: PASS (highest 0.909 RF).
- No purchase's average gain reaches its cost, even at the top of the 95% interval, and no late purchase (100+ rounds) pays for itself: PASS.

Simulated in 491.0 s.
