# Rare Royale balance report

6,000 simulated rounds of 50 random Friends (uniform families and Generations, random tactics), plus 2,500 paired rounds per purchase. Entry 1 RF: ladder pool 30 RF (8 / 5 / 4 / 3 / 2.5 / 1.5 / 1.5 / 1.5 / 1.5 / 1.5 RF for places 1–10) and a 0.2 RF bounty on every head. Sponsoring closes at 25 standing.

Battle length in seconds: p10 137, median 154, p90 164, max 231. Knockouts in fights 289631, by the storm 4369. Bounties burned by the storm: 0.146 RF per round.

## What a player can expect from one 1 RF entry

| Tactic | Any RF back | Back at least 1 RF | Top 10 | Win | Average return |
|---|---:|---:|---:|---:|---:|
| All | 45.5% | 20.5% | 20.0% | 2.0% | 0.797 RF |
| fight | 52.0% | 18.2% | 17.1% | 2.6% | 0.876 RF |
| hide | 39.9% | 25.0% | 25.0% | 0.9% | 0.707 RF |
| loot | 44.8% | 18.3% | 17.9% | 2.5% | 0.809 RF |

## By Generation

| Group | Entries | Any RF back | Top 10 | Win rate | Return per 1 RF entry | vs average |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 49537 | 46.8% | 20.9% | 2.3% | 0.847 RF | 1.06x |
| 2 | 50069 | 46.7% | 20.4% | 2.2% | 0.832 RF | 1.04x |
| 3 | 50329 | 45.7% | 20.0% | 2.0% | 0.796 RF | 1.00x |
| 4 | 49996 | 45.4% | 19.9% | 2.0% | 0.792 RF | 0.99x |
| 5 | 49967 | 44.4% | 19.5% | 1.7% | 0.757 RF | 0.95x |
| 6 | 50102 | 44.2% | 19.4% | 1.8% | 0.759 RF | 0.95x |

## By family

| Group | Entries | Any RF back | Top 10 | Win rate | Return per 1 RF entry | vs average |
|---|---:|---:|---:|---:|---:|---:|
| Skeleton | 33195 | 48.9% | 20.2% | 2.4% | 0.850 RF | 1.07x |
| Mask | 33465 | 44.3% | 19.7% | 1.8% | 0.767 RF | 0.96x |
| Family | 33551 | 43.8% | 19.1% | 2.3% | 0.824 RF | 1.03x |
| Cellular | 33430 | 49.4% | 22.4% | 2.0% | 0.850 RF | 1.07x |
| Asymmetry | 33362 | 45.1% | 21.7% | 2.1% | 0.838 RF | 1.05x |
| Hoverer | 33262 | 44.7% | 19.8% | 1.8% | 0.765 RF | 0.96x |
| Colossus | 33401 | 46.5% | 18.4% | 2.4% | 0.785 RF | 0.98x |
| Sparkling | 33159 | 43.9% | 18.8% | 1.9% | 0.760 RF | 0.95x |
| Hollow | 33175 | 43.1% | 19.8% | 1.4% | 0.734 RF | 0.92x |

## By tactic

| Group | Entries | Any RF back | Top 10 | Win rate | Return per 1 RF entry | vs average |
|---|---:|---:|---:|---:|---:|---:|
| fight | 100074 | 52.0% | 17.1% | 2.6% | 0.876 RF | 1.10x |
| hide | 100184 | 39.9% | 25.0% | 0.9% | 0.707 RF | 0.89x |
| loot | 99742 | 44.8% | 17.9% | 2.5% | 0.809 RF | 1.01x |

## Does any purchase pay for itself?

Each pair plays the same seeded round twice for the same Friend: once without the purchase and once with it. The gain is the average extra prize among rounds where the purchase happened, with a 95% interval. Fairness holds when gain < cost.

| Purchase | Rounds bought | Avg cost | Avg return gain | 95% interval | Gain per 1 RF spent | Bought with 30 or fewer standing: gain / cost |
|---|---:|---:|---:|---:|---:|---:|
| Shield, bought at a random moment | 964 | 1.00 RF | 0.312 RF | 0.226 to 0.399 | 0.312 RF | 0.73 / 1.00 RF (158 rounds) |
| Medkit, bought below 50% HP | 1886 | 1.00 RF | 0.202 RF | 0.145 to 0.258 | 0.202 RF | 0.53 / 1.00 RF (158 rounds) |
| Second life, bought when downed | 1352 | 2.00 RF | 0.168 RF | 0.135 to 0.202 | 0.084 RF | 0.25 / 2.00 RF (205 rounds) |
| Medkit, bought as late as possible (hurt, 30 or fewer standing) | 746 | 1.00 RF | 0.287 RF | 0.153 to 0.421 | 0.287 RF | 0.29 / 1.00 RF (746 rounds) |
| Shield, bought as late as possible (30 or fewer standing) | 1337 | 1.00 RF | 0.308 RF | 0.230 to 0.386 | 0.308 RF | 0.31 / 1.00 RF (1337 rounds) |
| Everything, every time (max spender) | 2500 | 6.95 RF | 0.856 RF | 0.781 to 0.931 | 0.123 RF | none |

## Targets

- No Generation, family or tactic earns more than 1.2x the average prize per entry (0.80 RF): PASS (highest 1.10x, By tactic: fight).
- No group earns 1 RF or more per 1 RF entry: PASS (highest 0.876 RF).
- No purchase's average gain reaches its cost, even at the top of the 95% interval, and no late purchase (100+ rounds) pays for itself: PASS.

Simulated in 444.0 s.
