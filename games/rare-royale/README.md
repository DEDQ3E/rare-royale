# Rare Royale

A live battle royale: your Rare Friend against 49 real Generations Friends. The top 10 are paid, every knockout pays a
bounty, and everyone watching can spend RF to sponsor any Friend at the right moment. Built with FriendSDK v0.1.2.
**Every balance, entry, prize and burn is simulated.**

## Run

```sh
npm install
npm run dev        # http://localhost:4173
```

Playing needs a browser wallet on Robinhood mainnet (chain 4663) holding a hardwired Generations NFT (generation ≥ 1).
The SDK runtime handles wallet connection, Friend selection and the ownership check. The game adds no wallet code.

## How a round works

Every round starts with a 1-minute lobby from the moment you arrive ("Start now" skips the wait), then the drop, a battle of about 3 minutes and 25 s of results. A short "How to play" guide opens on the first visit and pauses the countdown. Rounds are named after the minute of their drop, so viewers who drop in the same minute share the same island, line-up and base battle.

- **Lobby:** pick where to drop on this round's island (the map shows how many Friends plan to land at each place)
  and a tactic (Fight, Hide or Loot). The entry panel shows the odds for that tactic (averaged over all Friends). Enter for 1 RF, practise for
  free, or just watch.
- **Drop:** an airship crosses the island; every Friend jumps over its target and glides down.
- **Loot:** crates in three tiers hold a slingshot, hammer, bow or star wand, armour and bandages.
- **Storm:** six circles, each one shifted inside the last; the storm hurts more every phase and forces rotations.
- **Fights:** ranged, with line of sight through woods and rocks, cover inside buildings, armour, knockdowns and loot drops.
  A knocked-down Friend has 5 seconds for someone to buy it a second life.
  Up to 4 free decisions per round: fight or flee, open a crate, sprint out of the storm.
- **Sponsoring:** shield, medkit or second life for your Friend or the one on camera, dropped in a capsule with the
  sponsor's name. A furnace in the dock fills with the round's burn. Sponsoring closes when 25 are left.
- **Spectating:** the Fighters tab lists everyone still standing; pick one to follow it with the camera and sponsor it.
- **Results:** the top 10 with their payouts, your place and what you won (ladder place plus bounties), damage,
  who knocked you out, the round's top sponsor and Kingmakers (who backed the winner), and what the round burned.
  **Replay the final** plays the last 20 seconds again with the winner on camera.
- **Locker and shouts:** auras and titles for your Friend, and paid shouts in the arena. Looks only, never the fight.
- **Challenges:** three goals in the lobby at a time (top 10, two knockouts, sponsor another Friend, back the winner
  and more). Each unlocks a free title, win or lose. Progress lasts for the session.

## Controls

| Where | Keys | Touch or mouse |
|---|---|---|
| Lobby | 1, 2, 3: tactic · E: enter for 1 RF · P: practice · L: locker | Tap a place on the map, the tactic cards and the buttons |
| Battle | S: shield · M: medkit · R: second life · T: switch sponsor target · 1, 2: decisions · Y: shout (then 1–6) · F: Fighters tab | Dock buttons, tap a Friend in the Fighters tab to follow it |
| Results | V: replay the final | Replay the final button |
| Anywhere | H: hall of fame · Esc: close · arrows and Enter in the guide | How to play, Sound and Hall of fame buttons |

Sound starts after your first click or key press; the "Sound on/off" button mutes it. A reduced-motion switch is in
the bottom bar. Audio stops while the game is paused or hidden.

## Economy (simulated)

| Payment | Price | Where it goes |
|---|---|---|
| Entry | 1 RF | 0.6 RF to the round's top-10 ladder, 0.2 RF starting bounty on your head, 0.1 RF burned, 0.1 RF to active Friend rewards |
| Practice | free | Same battle, no RF in or out, no prizes |
| Shield (soaks the next 30 damage) | 1 RF | 50% burned, 50% active Friend rewards |
| Medkit (+45 HP) | 1 RF | 50% burned, 50% active Friend rewards |
| Second life | 2, then 4, then 8 RF (max 3 per Friend per round) | 50% burned, 50% active Friend rewards |
| Aura (Ember, Frost 2 RF · Starfall 5 RF) | once per session | 50% burned, 50% active Friend rewards; looks only |
| Title (Underdog 1 · Showrunner 3 · High Roller 5 RF) | once per session | 50% burned, 50% active Friend rewards; looks only. Challenge titles are free |
| Shout | 1 RF | 50% burned, 50% active Friend rewards; a line in the ticker and over your Friend |

- **Ladder:** with 50 paid entries the ladder is 30 RF: 8, 5, 4, 3 and 2.5 RF for places 1 to 5 and 1.5 RF for places
  6 to 10. There is one paid place per five paid entries (at most ten), ranked among paid entrants only.
- **Progressive bounties:** every head starts at 0.2 RF. A knockout pays the paid entrant who made it half the
  victim's bounty and adds the other half to its own head; the biggest head, once worth 0.4 RF or more, is marked WANTED. The winner keeps its
  whole head. A bounty whose owner falls to the storm or to a wild Friend is burned.
- **Backing:** prizes come only from the same round's paid entries. Unpaid seats are wild Friends that fight but never
  take RF. With fewer than 5 paid entries the round is free and entries are refunded. In this preview all 49 other
  seats are simulated paid entrants, and the crowd of sponsors is simulated.
- The 50/50 split is the Rare Friends protocol rule for gameplay payments (rarefriends.com/docs/economy).
- `game.json` holds the reference chance-game definition the SDK runtime requires (its single outcome is the average
  0.8 RF returned per entry); the game does not use its buy or play actions.

### Odds for one 1 RF entry (6,000 simulated rounds)

| Tactic | Any RF back | 1 RF or more | Top 10 | Win | Average return |
|---|---:|---:|---:|---:|---:|
| All | 45.5% | 20.1% | 20.0% | 2.0% | 0.789 RF |
| Fight | 51.8% | 15.6% | 15.5% | 2.1% | 0.779 RF |
| Hide | 41.5% | 27.0% | 27.0% | 1.3% | 0.784 RF |
| Loot | 43.1% | 17.5% | 17.5% | 2.6% | 0.804 RF |

An average round moves 87.1 RF: 50 RF of entries and 37.1 RF of sponsoring and shouts from the simulated crowd.
39.4 RF returns to players, 24.2 RF (28%) is burned and 23.6 RF funds active Friend rewards. The viewer's own
cosmetics come on top.

Fairness is checked by `npm run balance`; the results are in `BALANCE.md` and the lobby odds in `engine/odds.json`.
No Generation, family or tactic earns more than 1.2× the average, every tactic returns within 5% of the average (the
round, not the choice, decides which was right), no group averages 1 RF back per 1 RF entry, and no
purchase pays for itself on average, including purchases made just before sponsoring closes.

## Credits

- Friends: 300 real hardwired Generations Friends (`roster.json`, built by `scripts/roster.ts` from public reads) and
  the player's own Friend, drawn from the SDK's canonical on-chain sprites.
- Sound: synthesized in code with the Web Audio API (`audio.ts`); no recordings or sample packs.
- Fonts: Bebas Neue and Silkscreen, SIL Open Font License 1.1 (`assets/fonts`).
