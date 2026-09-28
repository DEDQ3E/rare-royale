![A live round: Friends fight inside the storm circle while the crowd sponsors them](https://raw.githubusercontent.com/DEDQ3E/rare-royale/main/media/battle.png)

🕹️ **Play: https://dedq3e.github.io/rare-royale/** · 🎬 **[Demo with sound (1 min)](https://dedq3e.github.io/rare-royale/demo.html)**

**Project name**
Rare Royale

**Builder / contact**
[DEDQ3E](https://github.com/DEDQ3E) · Discord `dedq3e3` · Telegram [@DEDQ3E](https://t.me/DEDQ3E)

**Category**
Token Activity

**One sentence**
A battle royale where your Generations Friend fights 49 real Rare Friends while anyone watching spends RF to sponsor any Friend: entries fund a top-10 prize ladder and knockout bounties, and every sponsor, shout and cosmetic payment burns 50% and sends 50% to active Friend rewards (all RF is simulated in this preview).

**What did you build?**
Rounds of about four and a half minutes: a one-minute lobby (pick a drop and a tactic, see your odds, enter for 1 RF, practise free or just watch), an airship drop, about three minutes of battle on an island with tiered loot, cover and six shifting storm circles, then results and a replay of the final 20 seconds. Anyone can sponsor any Friend with a shield, a medkit or a second life until 25 are left; each lands in a capsule with the sponsor's name, and a furnace fills with every RF burned. Also: a Fighters tab to follow anyone, paid shouts, Locker auras and titles (looks only), nine challenges, a hall of fame, its own synthesized sound and a phone layout.

**How does it use Rare Friends?**
Your ownership-verified Friend fights as itself, drawn from its canonical sprite, with Might, Speed and Wits from its family, generation and sprite seed, and a signature ability for each of the nine families. The other 49 are real Generations Friends from a roster of 300 (public reads only). The hall of fame reads the RF token's live `totalSupply`. The SDK handles the wallet, Friend selection and the ownership gate.

**How RF is spent and burned**
Four ways to spend: the entry, sponsoring any Friend, shouts and Locker cosmetics. Every payment except the entry burns 50% and funds 50% active Friend rewards (the protocol's 50/50 rule). Both tables are reproduced by `npm run balance` ([BALANCE.md](https://github.com/DEDQ3E/rare-royale/blob/main/BALANCE.md)).

**One real player, with no crowd at all** (3,000 simulated rounds per profile; a 10-minute session is about 2.3 rounds):

| Player | Spent per round | Burned per round | Share burned |
|---|---:|---:|---:|
| Entry only | 1.00 RF | 0.10 RF | 10% |
| Careful: entry, a shield, a medkit when hurt | 2.13 RF | 0.66 RF | 31% |
| All-in: every item whenever it helps | 7.16 RF | 3.18 RF | 44% |

**A whole round of 50 entrants**, by how much the other entrants and viewers sponsor (simulated; the game plays the last column):

| Sponsoring and shouts per entrant per round | 0 | 0.33 RF | 0.74 RF |
|---|---:|---:|---:|
| Spent per round | 50 RF | 66.5 RF | 87.1 RF |
| Burned per round | 5.6 RF (11%) | 13.9 RF (21%) | **24.2 RF (28%)** |

- **The crowd model is modest:** less than one shield per entrant per round. Every second while sponsoring is open, a downed Friend gets a second life with 6% chance, a random Friend a shield with 12%, a hurt one a medkit with 9%, and a fan buys a shout with 2%. Most of that spending would be entrants protecting their own Friend, since a shield lifts its top-10 chance from 28% to 34%. Pure spectators get status, not money: their name on the capsule, under the replay of the final as a Kingmaker, and in the hall of fame as a round's top sponsor.
- **Why the entry burns only 10%:** each extra 10% of entry burn would take 0.1 RF off the average return (0.79 RF now, 0.69 RF at 20%). A game that keeps the entry gets played once; here the burn grows with every round played.
- **The burn is on screen:** the furnace, the capsules, and results that split the round's burn by source (entries, other entrants and viewers, you, the storm), plus what your own payments burned this round and this session.

**What would be on-chain?**
Nothing in this build: no contract or transaction code, as the SDK asks for prototypes. The on-chain phase with the Rare Friends team would add a round contract where:
- every payment comes from the Friend's canonical NFT wallet;
- a 1 RF entry is held until settlement, then 0.1 RF goes through the RF token's `burn()`, 0.1 RF to active Friend rewards, and 0.8 RF is paid out as the ladder and bounties;
- sponsor items, shouts and cosmetics burn 50% and fund 50% rewards at once;
- the settlement pays out exactly the pool, and a round with fewer than 5 paid entries refunds every entry;
- sponsoring is paid from a balance topped up before the round, so a second life's 5-second window needs no wallet prompt;
- rounds run on one shared clock for all holders, one every 5 minutes, with wild Friends in empty seats. Until 5 people enter, a round is free and burns only what is spent on sponsoring, shouts and cosmetics. One ladder place per five paid entries keeps the odds at any player count; only the prizes scale.

Live play would also need the reward-funding path from the Rare Friends team, matchmaking, and saves (the SDK has no save API).

**How does it use randomness?**
The battle is deterministic from a round seed, so anyone can replay a round and check it. In the preview the seed is the round number, so everyone in the same minute gets the same island, line-up and base battle; your own Friend takes one seat, and your sponsoring and decisions change only your view. Live, the seed stays unknown until the final: it mixes a Dice result drawn when entries close with a game secret whose hash is published before entries open and which is revealed after the final. A Dice result alone is public on-chain, so a bot could simulate the rest of a battle mid-round and buy only the items that flip the result; with the secret nobody can, nobody can pick the seed, and every round can still be checked afterwards.

**Source code**
[GitHub repository](https://github.com/DEDQ3E/rare-royale) ([full rules and tables](https://github.com/DEDQ3E/rare-royale#readme)) · FriendSDK v0.1.2 · React, TypeScript, Canvas 2D, Web Audio.

**Playable demo / how to run**
**Play: https://dedq3e.github.io/rare-royale/** (GitHub Pages). You'll need a browser wallet on Robinhood mainnet (chain 4663) holding a hardwired Generations NFT (generation 1 or higher). No RF funding, signature or transaction is needed. To run it locally with Node.js 22+:

```sh
git clone https://github.com/DEDQ3E/rare-royale && cd rare-royale
npm install
npm run dev
```

**How do you play?**
Lobby: tap the map to pick a drop; **1–3** Fight, Hide or Loot, **E** enter for 1 RF, **P** practise, **L** Locker. Battle: **S** shield, **M** medkit, **R** second life (within 5 s of a knockdown), **T** your Friend or the one on camera, **1 / 2** quick decisions, **Y** shouts, **F** Fighters tab. Results: **V** replay the final. **H** hall of fame, **Esc** close. Everything also has a button for touch.

**Costs and rewards**
Everything is simulated; you start with 20 RF. RF amounts are placeholder units: live prices are for the developers to set, and every split and ratio stays the same.
- **Entry, 1 RF:**
  - where it goes: 0.6 RF to the ladder, a 0.2 RF starting bounty on your head, 0.1 RF burned, 0.1 RF to rewards;
  - ladder with 50 paid entries: places 1–10 pay 8, 5, 4, 3, 2.5, then 1.5 RF each;
  - bounties: a knockout pays half the victim's bounty and adds the other half to your own head, the biggest head (once worth 0.4 RF or more) is marked WANTED, and the winner keeps its own;
  - a round with fewer than 5 paid entries refunds every entry; practice is free.
- **Sponsoring:** a shield (soaks the next 30 damage) or a medkit (+45 HP) costs 1 RF. A second life costs 2, then 4, then 8 RF, at most 3 per Friend per round. Sponsoring closes at 25 standing.
- **Looks:** shouts cost 1 RF, auras 2–5 RF and titles 1–5 RF.
- **Odds per 1 RF entry** (6,000 simulated rounds):
  - any RF back 45.5%, 1 RF or more 20.1%, win 2.0%, average return 0.79 RF;
  - Fight, Hide and Loot each return within 5% of that average;
  - no purchase pays for itself in RF (a shield returns 0.29 RF per 1 RF), but each raises the chance of a high place (a medkit when hurt: top 10 from 7% to 11%); the game shows this on each item.

**What have you tested?**
All pass: typecheck; 12 engine tests (map, stats, replay, sponsoring, decisions, economy, settlement, ledger, rounds, challenges); `friendsdk check` and `friendsdk test` at 960 and 390 px; `npm run balance` (four fairness targets over 6,000 rounds, plus the burn tables above); an automated browser run through every screen at 960 × 808 and 390 × 844, on into a second round; a one-minute recording from the real runtime with a Friend read live from mainnet. The builder played the public preview with a real wallet and Friend; later additions were checked in the SDK test runtime.

**Known limitations**
- The economy, the other entrants and the viewers are simulated; balances reset on reload (no save API).
- Rounds are shared by time, not by a server: your sponsoring and decisions change only your own view.
- The hall's supply read uses the public Robinhood RPC and shows "unavailable" if it fails.
- Sound was checked by measurement, not on physical devices.

**Credits**
Friends are drawn from their canonical on-chain sprites through FriendSDK. All other art and every sound are generated in code, with no samples or image files. Fonts: Bebas Neue and Silkscreen (SIL Open Font License 1.1). Built with Claude Code.
