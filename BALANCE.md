# Rare Royale balance report

6,000 simulated rounds of 50 random Friends (uniform families and Generations, random tactics), plus 2,500 paired rounds per purchase. Entry 1 RF: ladder pool 30 RF (8 / 5 / 4 / 3 / 2.5 / 1.5 / 1.5 / 1.5 / 1.5 / 1.5 RF for places 1–10) and a 0.2 RF bounty on every head. Sponsoring closes at 25 standing.

Battle length in seconds: p10 157, median 176, p90 191, max 291. Knockouts in fights 289465, by the storm 4535. Bounties burned by the storm: 0.553 RF per round.

## What a player can expect from one 1 RF entry

| Tactic | Any RF back | Back at least 1 RF | Top 10 | Win | Average return |
|---|---:|---:|---:|---:|---:|
| All | 45.5% | 20.1% | 20.0% | 2.0% | 0.789 RF |
| fight | 51.8% | 15.6% | 15.5% | 2.1% | 0.779 RF |
| hide | 41.5% | 27.0% | 27.0% | 1.3% | 0.784 RF |
| loot | 43.1% | 17.5% | 17.5% | 2.6% | 0.804 RF |

## By Generation

| Group | Entries | Any RF back | Top 10 | Win rate | Return per 1 RF entry | vs average |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 49537 | 46.8% | 20.7% | 2.2% | 0.836 RF | 1.06x |
| 2 | 50069 | 46.5% | 20.6% | 2.1% | 0.820 RF | 1.04x |
| 3 | 50329 | 45.6% | 20.0% | 2.1% | 0.799 RF | 1.01x |
| 4 | 49996 | 45.2% | 19.7% | 2.0% | 0.788 RF | 1.00x |
| 5 | 49967 | 44.7% | 19.7% | 1.8% | 0.756 RF | 0.96x |
| 6 | 50102 | 44.0% | 19.3% | 1.7% | 0.735 RF | 0.93x |

## By family

| Group | Entries | Any RF back | Top 10 | Win rate | Return per 1 RF entry | vs average |
|---|---:|---:|---:|---:|---:|---:|
| Skeleton | 33195 | 49.4% | 20.8% | 2.4% | 0.861 RF | 1.09x |
| Mask | 33465 | 42.9% | 19.1% | 1.8% | 0.733 RF | 0.93x |
| Family | 33551 | 43.4% | 19.0% | 2.4% | 0.826 RF | 1.05x |
| Cellular | 33430 | 47.4% | 21.8% | 1.9% | 0.808 RF | 1.02x |
| Asymmetry | 33362 | 44.3% | 21.3% | 1.9% | 0.811 RF | 1.03x |
| Hoverer | 33262 | 44.0% | 18.9% | 1.5% | 0.698 RF | 0.89x |
| Colossus | 33401 | 50.8% | 20.4% | 2.9% | 0.904 RF | 1.15x |
| Sparkling | 33159 | 43.8% | 18.5% | 1.8% | 0.731 RF | 0.93x |
| Hollow | 33175 | 43.3% | 20.3% | 1.3% | 0.727 RF | 0.92x |

## By tactic

| Group | Entries | Any RF back | Top 10 | Win rate | Return per 1 RF entry | vs average |
|---|---:|---:|---:|---:|---:|---:|
| fight | 100074 | 51.8% | 15.5% | 2.1% | 0.779 RF | 0.99x |
| hide | 100184 | 41.5% | 27.0% | 1.3% | 0.784 RF | 0.99x |
| loot | 99742 | 43.1% | 17.5% | 2.6% | 0.804 RF | 1.02x |

## Does any purchase pay for itself?

Each pair plays the same seeded round twice for the same Friend: once without the purchase and once with it. The gain is the average extra prize among rounds where the purchase happened, with a 95% interval. Fairness holds when gain < cost.

| Purchase | Rounds bought | Avg cost | Avg return gain | 95% interval | Gain per 1 RF spent | Top 10: without → with | Bought with 30 or fewer standing: gain / cost |
|---|---:|---:|---:|---:|---:|---:|---:|
| Shield, bought at a random moment | 945 | 1.00 RF | 0.289 RF | 0.181 to 0.397 | 0.289 RF | 28.4% → 33.7% | 0.27 / 1.00 RF (150 rounds) |
| Medkit, bought below 50% HP | 1847 | 1.00 RF | 0.189 RF | 0.128 to 0.249 | 0.189 RF | 7.0% → 10.9% | 0.32 / 1.00 RF (196 rounds) |
| Second life, bought when downed | 1333 | 2.00 RF | 0.205 RF | 0.146 to 0.264 | 0.103 RF | 0.0% → 5.3% | 0.23 / 2.00 RF (220 rounds) |
| Medkit, bought as late as possible (hurt, 30 or fewer standing) | 693 | 1.00 RF | 0.359 RF | 0.198 to 0.520 | 0.359 RF | 22.2% → 26.4% | 0.36 / 1.00 RF (693 rounds) |
| Shield, bought as late as possible (30 or fewer standing) | 1322 | 1.00 RF | 0.382 RF | 0.285 to 0.479 | 0.382 RF | 37.0% → 45.5% | 0.38 / 1.00 RF (1322 rounds) |
| Everything, every time (max spender) | 2500 | 6.02 RF | 0.908 RF | 0.807 to 1.008 | 0.151 RF | 20.6% → 39.6% | none |

## Targets

- No Generation, family or tactic earns more than 1.2x the average prize per entry (0.79 RF): PASS (highest 1.15x, By family: Colossus).
- Every tactic returns within 5% of the average, so the round, not the choice, decides which was right: PASS (0.99x to 1.02x).
- No group earns 1 RF or more per 1 RF entry: PASS (highest 0.904 RF).
- No purchase's average gain reaches its cost, even at the top of the 95% interval, and no late purchase (100+ rounds) pays for itself: PASS.

Simulated in 478.8 s.
