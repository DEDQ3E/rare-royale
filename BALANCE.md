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

Each pair plays the same seeded round twice for the same Friend: once without the purchase and once with it. For a paid call (Smoke, Pry, Boost), "without" leaves the decision to the tactic, as when a player does not answer. The gain is the average extra prize among rounds where the purchase happened, with a 95% interval. Fairness holds when gain < cost.

| Purchase | Rounds bought | Avg cost | Avg return gain | 95% interval | Gain per 1 RF spent | Top 10: without → with | Bought with 30 or fewer standing: gain / cost |
|---|---:|---:|---:|---:|---:|---:|---:|
| Shield, bought at a random moment | 945 | 1.00 RF | 0.289 RF | 0.181 to 0.397 | 0.289 RF | 28.4% → 33.7% | 0.27 / 1.00 RF (150 rounds) |
| Medkit, bought below 50% HP | 1847 | 1.00 RF | 0.189 RF | 0.128 to 0.249 | 0.189 RF | 7.0% → 10.9% | 0.32 / 1.00 RF (196 rounds) |
| Second life, bought when downed | 1333 | 2.00 RF | 0.205 RF | 0.146 to 0.264 | 0.103 RF | 0.0% → 5.3% | 0.23 / 2.00 RF (220 rounds) |
| Medkit, bought as late as possible (hurt, 30 or fewer standing) | 693 | 1.00 RF | 0.359 RF | 0.198 to 0.520 | 0.359 RF | 22.2% → 26.4% | 0.36 / 1.00 RF (693 rounds) |
| Shield, bought as late as possible (30 or fewer standing) | 1322 | 1.00 RF | 0.382 RF | 0.285 to 0.479 | 0.382 RF | 37.0% → 45.5% | 0.38 / 1.00 RF (1322 rounds) |
| Smoke (1 RF), whenever an enemy is spotted | 2105 | 2.28 RF | 0.417 RF | 0.297 to 0.538 | 0.183 RF | 22.5% → 36.8% | 1.17 / 1.28 RF (36 rounds) |
| Pry (1 RF), whenever a crate is near | 2283 | 1.17 RF | 0.232 RF | 0.137 to 0.328 | 0.199 RF | 19.1% → 23.7% | -1.10 / 1.00 RF (7 rounds) |
| Boost (1 RF), whenever caught in the storm | 769 | 1.25 RF | 0.202 RF | 0.021 to 0.383 | 0.161 RF | 22.1% → 23.9% | 0.24 / 1.11 RF (123 rounds) |
| Every paid call, every time (up to 4 a round) | 2500 | 3.56 RF | 0.567 RF | 0.451 to 0.683 | 0.159 RF | 19.8% → 35.0% | none |
| Everything, every time (max spender: items and calls) | 2500 | 6.63 RF | 1.568 RF | 1.425 to 1.711 | 0.236 RF | 19.1% → 52.6% | none |

## Where the burn comes from

The same 300 rounds (the game's roster, round ids 8000 to 8299, 50 paid entries) at three levels of the simulated other entrants and viewers; 100% is what the game plays. The crowd model: every second while sponsoring is open, each downed Friend gets a second life with 6% chance, a random standing Friend a shield with 12%, a random Friend below 60% HP a medkit with 9%, and a fan buys a shout with 2%. The level scales all four chances.

| Crowd level | Sponsoring and shouts per entrant per round | Spent per round | Burned per round | Share burned | From entries | From the crowd | Storm bounties |
|---|---:|---:|---:|---:|---:|---:|---:|
| 0% | 0.00 RF | 50.0 RF | 5.6 RF | 11% | 5.0 RF | 0.0 RF | 0.64 RF |
| 50% | 0.33 RF | 66.5 RF | 13.9 RF | 21% | 5.0 RF | 8.2 RF | 0.66 RF |
| 100% | 0.74 RF | 87.1 RF | 24.2 RF | 28% | 5.0 RF | 18.6 RF | 0.60 RF |

## One real player

What a single player spends and burns, with no crowd at all: 3,000 rounds per profile, random line-ups, the player's own purchases only. A session of 10 minutes holds about 2.3 rounds (60 s lobby, the battle, 25 s of results). A paid call costs 1 RF (50% burned) and needs a decision the round offers, at most 4 a round.

| Player | Spent per round | Burned per round | Share burned | Paid calls per round | Back per round (average) | 10-minute session: spent / burned |
|---|---:|---:|---:|---:|---:|---:|
| Entry only | 1.00 RF | 0.10 RF | 10% | 0.00 | 0.81 RF | 2.3 / 0.2 RF |
| Careful: entry, one shield, a medkit when below half HP | 2.13 RF | 0.66 RF | 31% | 0.00 | 1.06 RF | 4.9 / 1.5 RF |
| Tactician: entry and every paid call (Smoke, Pry, Boost) | 4.54 RF | 1.87 RF | 41% | 3.54 | 1.39 RF | 10.5 / 4.3 RF |
| All-in: every item and every paid call whenever it helps | 7.77 RF | 3.49 RF | 45% | 4.00 | 2.25 RF | 18.0 / 8.1 RF |

## Where to drop

Each of 2,500 rounds is played three times for the same Friend with the same tactic, changing only the drop: the place the fewest other Friends plan to land at (as the lobby's drop map shows), the tactic's own choice, and the busiest place.

| Drop | Other Friends landing at the same place (average) | Top 10 | Win | Average return |
|---|---:|---:|---:|---:|
| Quietest place | 2.4 | 25.6% | 2.7% | 1.00 RF |
| Tactic's own choice | 4.8 | 20.3% | 2.3% | 0.83 RF |
| Busiest place | 9.9 | 13.7% | 1.5% | 0.59 RF |

## Targets

- No Generation, family or tactic earns more than 1.2x the average prize per entry (0.79 RF): PASS (highest 1.15x, By family: Colossus).
- Every tactic returns within 5% of the average, so the round, not the choice, decides which was right: PASS (0.99x to 1.02x).
- No group earns 1 RF or more per 1 RF entry: PASS (highest 0.904 RF).
- No purchase's average gain reaches its cost, even at the top of the 95% interval, and no late purchase (100+ rounds) pays for itself: PASS.

Simulated in 1035.8 s.
