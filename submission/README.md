# Rare Royale

![A live round: Friends fight inside the storm circle, the kill feed runs and the crowd can sponsor](https://raw.githubusercontent.com/DEDQ3E/rare-royale/main/media/battle.png)

🕹️ **Play: https://dedq3e.github.io/rare-royale/**

**Project name**
Rare Royale

**Builder / contact**
[DEDQ3E](https://github.com/DEDQ3E) · Discord `dedq3e3` · Telegram [@DEDQ3E](https://t.me/DEDQ3E)

**Category**
Token Activity

**One sentence**
A spectator-sponsored battle royale where your Generations Friend drops onto an island with 49 real Rare Friends: entries fund a top-10 prize ladder and knockout bounties, and every sponsor purchase from the crowd (a shield, a medkit or a second life for any Friend) burns 50% of its $RAREFRIENDS and sends 50% to active Friend rewards (all RF is simulated in this preview).

## What did you build?

A complete battle royale that runs itself, in rounds of about four minutes: a one-minute lobby, the drop, about 2.5 minutes of battle and the results.

- **Lobby.** Your Friend on a lit pedestal with its stats and family ability; this round's island with seven places to drop on (and how many Friends plan to land at each); a tactic (Fight, Hide, Loot); the entry panel with the prize ladder and **your real odds for that tactic**; enter for 1 RF, practise for free, or just watch. A short *How to play* guide opens on the first visit and pauses the countdown.
- **Drop.** An airship crosses the island and every Friend parachutes to its target.
- **Battle.** Tiered loot (slingshot, hammer, bow, star wand, armour, bandages), six storm circles that shift and shrink, ranged fights with line of sight, cover inside buildings, knockdowns with a five-second window for a second life, and loot left behind. A broadcast camera follows your Friend (teal ring, YOU arrow, edge pointer, minimap marker), with a kill feed, an announcer and up to four quick decisions per round (fight or flee, open a crate, sprint out of the storm).
- **Crowd.** Anyone watching can sponsor your Friend or the one on camera until 25 are left.
- **Results.** The top 10 with their payouts, your place and what you won (ladder plus bounties), and exactly what the round burned.
- **Hall of fame.** RF burned to date read **live from the RF token's `totalSupply` on Robinhood mainnet**, the burn of the last 12 rounds and their champions (past rounds replay from their seeds, the same for everyone).
- **Sound.** Its own synthesized arena sound: a formant-built stadium crowd, a drum-and-bass bed that speeds up as the field shrinks, plucked-string bows and slingshots, a ring-modulated star wand, bells for loot, a flame whoosh for every burn, the airship drone and the storm siren. Mute button in the top bar.

![Lobby: the Friend, the island, the tactic, the ladder and your odds](https://raw.githubusercontent.com/DEDQ3E/rare-royale/main/media/lobby.png)

## How does it spend and burn $RAREFRIENDS?

Everything below is **simulated** in this preview and labelled on every screen. RF amounts are bigint base units (`1 RF = 10n ** 18n`).

| Payment | Price | Where it goes |
|---|---|---|
| Round entry | 1 RF | 0.6 RF to the round's top-10 ladder · 0.2 RF bounty on your head · **0.1 RF burned** · 0.1 RF to active Friend rewards |
| Practice | free | Same battle, no RF in or out |
| Shield (soaks the next 30 damage) | 1 RF | **50% burned** · 50% active Friend rewards |
| Medkit (+45 HP) | 1 RF | **50% burned** · 50% active Friend rewards |
| Second life (within 5 s of a knockdown) | 2, then 4, then 8 RF, max 3 per Friend per round | **50% burned** · 50% active Friend rewards |

- The 50/50 split is the protocol's own rule for gameplay payments ([rarefriends.com/docs/economy](https://rarefriends.com/docs/economy)), so the game feeds both the burn and the rewards of every active Friend holder.
- **Ladder:** with 50 paid entries, 30 RF: 8 · 5 · 4 · 3 · 2.5 RF for places 1–5 and 1.5 RF for places 6–10. Any top-10 place returns more than the entry.
- **Bounties:** whoever knocks out a paid entrant collects its 0.2 RF; the winner keeps its own. If the storm or a wild Friend gets it, the bounty **burns**.
- **Backed prizes:** prizes come only from the same round's paid entries. Unpaid seats are filled by *wild* Friends that fight but never take RF, and the ladder ranks paid entrants only; with fewer than 5 paid entries a round is free and entries are refunded. In this preview the other 49 seats are simulated paid entrants.
- **Sponsoring closes when 25 are left**, so nobody can buy the finish.

**An average round** (300 rounds with the simulated crowd): 85.3 RF spent (50 RF entries + 35.3 RF sponsoring) → **22.9 RF burned (27%)**, 22.7 RF to active Friend rewards, 39.8 RF back to players.

### Why a player would actually play

A 1 RF entry pays something back almost every other round, and the lobby tells you your odds before you enter (6,000 simulated rounds, [`BALANCE.md`](https://github.com/DEDQ3E/rare-royale/blob/main/BALANCE.md)):

| Tactic | Any RF back | 1 RF or more | Top 10 | Win | Average return |
|---|---:|---:|---:|---:|---:|
| All | 45.5% | 20.5% | 20.0% | 2.0% | 0.797 RF |
| Fight | 52.0% | 18.2% | 17.1% | 2.6% | 0.876 RF |
| Hide | 39.9% | 25.0% | 25.0% | 0.9% | 0.707 RF |
| Loot | 44.8% | 18.3% | 17.9% | 2.5% | 0.809 RF |

The average return stays at 0.8 RF per entry (the other 0.2 RF is the burn and the rewards), but it is spread over ten places and every knockout instead of three podium spots. Fight earns bounties, Hide reaches the top 10 most often.

### Fair by construction, checked by simulation

Stats, family abilities, tactics and sponsor items change the fight, within limits checked by `npm run balance`:

- No Generation, family or tactic earns more than 1.2× the average return (highest: 1.10×, Fight). No group averages 1 RF back per 1 RF entry (highest: 0.876 RF).
- **No purchase pays for itself.** Each purchase is tested by playing the same seeded round twice, with and without it: a shield returns 0.31 RF per 1 RF, a medkit 0.20, a second life 0.08, and buying everything every time 0.12. Purchases made in the last moments before sponsoring closes return 0.29–0.53 RF per 1 RF.

## How does it use Rare Friends?

- **Your Friend is your fighter.** The ownership-verified Friend is drawn from its canonical Generations frames through the SDK sprite reader and fights with stats from its NFT: Might, Speed and Wits come from its family profile, its generation (read with one `generation(tokenId)` call) and its sprite seed. Each of the nine families has a signature ability (a Hoverer glides further and shrugs off the storm, a Skeleton ignores the first hit, a Cellular gets a last stand).
- **The other 49 are real Friends too.** A roster of 300 real hardwired Generations Friends (generations 1–6), sampled from the chain with public reads only and baked into the build with their canonical sprites. No owner addresses are read or stored.
- The SDK runtime handles the wallet, Friend selection and the ownership gate; the game adds no wallet code.

![Results: the top 10 with payouts, your place and the round's burn](https://raw.githubusercontent.com/DEDQ3E/rare-royale/main/media/results.png)

## How to use it

Open the preview, connect a browser wallet on **Robinhood mainnet (chain 4663)** holding a hardwired **Generations NFT (generation ≥ 1)** and choose your Friend. No RF, signature or transaction is needed.

| Where | Keys | Touch or mouse |
|---|---|---|
| Lobby | 1, 2, 3: tactic · E: enter for 1 RF · P: practice | Tap a place on the map, the tactic cards and the buttons |
| Battle | S: shield · M: medkit · R: second life · T: switch sponsor target · 1, 2: decisions | Dock buttons |
| Anywhere | H: hall of fame · Esc: close · arrows and Enter in the guide | How to play, Sound and Hall of fame buttons |

Portrait phones get their own 3:4 layout. Reduced motion, mute, loading and error states are included, and the game honours the runtime's `paused` state.

![Phone layout](https://raw.githubusercontent.com/DEDQ3E/rare-royale/main/media/phone-lobby.png)

**Source:** https://github.com/DEDQ3E/rare-royale · **FriendSDK v0.1.2** · React, TypeScript, Canvas 2D, Web Audio.

```sh
git clone https://github.com/DEDQ3E/rare-royale && cd rare-royale
npm install
npm run dev            # http://localhost:4173
npm run build          # static build in docs/ (the GitHub Pages preview)
```

On Windows, `play.bat` installs, builds and opens the game in the browser.

## Checks

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm run test:engine` (map, stats, replay, one winner, sponsoring, decisions, economy, settlement, ledger, rounds) | 10 / 10 pass |
| `npm run check` (`friendsdk check`) | Valid; reference chance game: expected reward 0.8 RF, maximum 0.8 RF |
| `npx friendsdk test games/rare-royale --width 960` and `--width 390` | Pass |
| `npm run balance -- 6000 2500 --report` | All three fairness targets pass ([`BALANCE.md`](https://github.com/DEDQ3E/rare-royale/blob/main/BALANCE.md)) |
| Browser flow (`tests/shots.ts`, SDK test runtime with a fake clock): guide, lobby, entry, drop, landing, fight, late game, results, hall of fame, at 960 × 808 and 390 × 844 | Pass |
| Audio (`Web Audio` in Chromium): starts on the first gesture, suspends on mute | Pass |
| Real-wallet playtest with a real Generations Friend | Pending (the SDK mocks the wallet in automated tests) |

## Known issues and limits

- **Simulated economy.** No RF moves. The 49 other entrants and the sponsoring crowd are simulated; balances reset when the game is reloaded (the SDK has no save API).
- **Shared rounds without a server.** Rounds are named after the minute of their drop, so viewers who drop in the same minute see the same island, line-up and base battle, but each viewer's own sponsoring and decisions change only their own view.
- **Hall of fame supply read** uses the public Robinhood RPC; if it is unreachable, the tile shows "unavailable".
- **The chance-game definition in `game.json` is a required reference only**; the game does not call buy, play or settle.

## What live play would need (integration gaps)

- A round contract: entries from the Friend's canonical wallet; 10% burned with the RF token's `burn()`, 10% to protocol rewards (the reward-funding path needs the Rare Friends team), 60% ladder and 20% bounties held until settlement.
- One randomness request per round for the battle seed. The battle is deterministic from that seed, so anyone can replay a round and verify places and knockouts; the contract pays out by `settleRound` from the posted result, and a disputed result is checked by replay.
- Matchmaking: a lobby that closes after a minute or at 50 paid entries, with wild Friends in the empty seats.
- Sponsor payments recorded per round phase with the same 50/50 split.
- Persistence for sessions and the hall of fame (not in SDK v0.1.2).

## Credits

- Friends: 300 real hardwired Generations Friends (built by `scripts/roster.ts` from public reads) and the player's own Friend, drawn from the SDK's canonical on-chain sprites.
- Sound: synthesized in code with the Web Audio API; no recordings or sample packs.
- Fonts: Bebas Neue and Silkscreen, SIL Open Font License 1.1.
- Built with Claude Code.
