![A live round: Friends fight inside the storm circle while the crowd sponsors them](https://raw.githubusercontent.com/DEDQ3E/rare-royale/main/media/battle.png)

🕹️ **Play: https://dedq3e.github.io/rare-royale/** · 🎬 **[Demo with sound (106 s)](https://dedq3e.github.io/rare-royale/demo.html)**

**Project name**
Rare Royale

**Builder / contact**
[DEDQ3E](https://github.com/DEDQ3E) · Discord `dedq3e3` · Telegram [@DEDQ3E](https://t.me/DEDQ3E)

**Category**
Token Activity

**One sentence**
A battle royale where your Generations Friend fights 49 real Rare Friends while anyone watching spends RF to sponsor any Friend: entries fund a top-10 prize ladder and knockout bounties, and every sponsor, shout and cosmetic payment burns 50% and sends 50% to active Friend rewards (all RF is simulated in this preview).

**What did you build?**
Rounds of about four and a half minutes: a one-minute lobby (pick where to drop and a tactic, see your odds, enter for 1 RF, practise free or just watch), an airship drop, about three minutes of battle, then results with payouts and a replay of the final 20 seconds. The island has tiered loot, ranged fights with cover, knockdowns and six shifting storm circles. Anyone can sponsor any Friend with a shield, a medkit or a second life until 25 are left. Each one lands in a capsule with the sponsor's name, and a furnace fills with every RF burned. Also included: a Fighters tab to follow any Friend, paid shouts, Locker auras and titles (looks only), nine challenges that unlock free titles, a hall of fame, its own synthesized sound and a portrait phone layout.

**How does it use Rare Friends?**
Your ownership-verified Friend fights as itself, drawn from its canonical sprite, with stats from its NFT: its family, generation (one `generation(tokenId)` read) and sprite seed set Might, Speed and Wits, and each of the nine families has a signature ability. The other 49 are real Generations Friends from a roster of 300 (generations 1–6, public reads only, baked into the build). The hall of fame reads the RF token's live `totalSupply` on Robinhood mainnet. The SDK handles the wallet, Friend selection and the ownership gate.

**How RF is spent and burned**
An average round (300 simulated rounds with the crowd):

| Spent | Burned | To active Friend rewards | Back to players |
|---:|---:|---:|---:|
| 87.1 RF (50 entries + 37.1 sponsoring and shouts) | **24.2 RF (28%)** | 23.6 RF | 39.4 RF |

- **Four ways to spend, for players and viewers alike:** the entry, sponsoring any Friend, shouts and Locker cosmetics.
- **Every gameplay payment burns 50%**, following the protocol's 50/50 rule. Knockout bounties lost to the storm also burn. The entry burns 10% and keeps 80% in play, so it returns 0.79 RF on average. That keeps players coming back, and each round burns again.
- **The burn is on screen:** the furnace, the capsules, the results' burn count-up, and a line showing what *your* payments burned this round and this session.
- **The crowd is simulated here:** 37.1 RF of the 87.1 RF comes from simulated entrants and viewers. At launch they would be real holders.

**What would be on-chain?**
Nothing in this build: no contract or transaction code, as the SDK asks for prototypes. The on-chain phase with the Rare Friends team would add a round contract where:
- every payment comes from the Friend's canonical NFT wallet;
- a 1 RF entry is held until settlement, then 0.1 RF goes through the RF token's `burn()`, 0.1 RF to active Friend rewards, and 0.8 RF is paid out as the ladder and bounties;
- sponsor items, shouts and cosmetics burn 50% and fund 50% rewards at once;
- the settlement pays out exactly the pool, and a round with fewer than 5 paid entries refunds every entry.

Live play would also need the reward-funding path from the Rare Friends team, matchmaking, and saves (the SDK has no save API).

**How does it use randomness?**
The battle is deterministic from a round seed, so anyone can replay a round and check places and knockouts. In the preview the seed comes from the round number: everyone who drops in the same minute gets the same island, line-up and base battle. Live, one Dice request per round, made after entries close, would set the seed, so nobody could simulate a round before entering.

**Source code**
[GitHub repository](https://github.com/DEDQ3E/rare-royale) · FriendSDK v0.1.2 · React, TypeScript, Canvas 2D, Web Audio. Full rules and odds tables are in the [README](https://github.com/DEDQ3E/rare-royale#readme), and the fairness report is in [BALANCE.md](https://github.com/DEDQ3E/rare-royale/blob/main/BALANCE.md).

**Playable demo / how to run**
**Play: https://dedq3e.github.io/rare-royale/** (GitHub Pages). You'll need a browser wallet on Robinhood mainnet (chain 4663) holding a hardwired Generations NFT (generation 1 or higher). No RF funding, signature or transaction is needed. To run it locally with Node.js 22+:

```sh
git clone https://github.com/DEDQ3E/rare-royale && cd rare-royale
npm install
npm run dev
```

**How do you play?**
- **Lobby:** tap a place on the map to drop there. Keys **1–3** pick Fight, Hide or Loot, **E** enters for 1 RF, **P** practises free and **L** opens the Locker.
- **Battle:** **S** buys a shield, **M** a medkit and **R** a second life (within 5 s of a knockdown). **T** switches between your Friend and the one on camera. **1 / 2** answer up to four quick decisions, **Y** opens shouts and **F** opens the Fighters tab.
- **Results:** **V** replays the final.
- **Anywhere:** **H** opens the hall of fame and **Esc** closes panels.

Everything also has a button for touch.

**Costs and rewards**
Everything is simulated; you start with 20 RF.
- **Entry, 1 RF:**
  - where it goes: 0.6 RF to the ladder, a 0.2 RF starting bounty on your head, 0.1 RF burned, 0.1 RF to rewards;
  - ladder with 50 paid entries: places 1–10 pay 8, 5, 4, 3, 2.5, then 1.5 RF each;
  - bounties: a knockout pays half the victim's bounty and adds the other half to your own head, the biggest head is marked WANTED, and the winner keeps its own;
  - a round with fewer than 5 paid entries refunds every entry; practice is free.
- **Sponsoring:** a shield (soaks the next 30 damage) or a medkit (+45 HP) costs 1 RF. A second life costs 2, then 4, then 8 RF, at most 3 per Friend per round. Sponsoring closes at 25 standing.
- **Looks:** shouts cost 1 RF, auras 2–5 RF and titles 1–5 RF. Like sponsoring, they burn 50% and send 50% to rewards.
- **Odds per 1 RF entry** (6,000 simulated rounds):
  - any RF back 45.5%, 1 RF or more 20.1%, win 2.0%, average return 0.79 RF;
  - Fight, Hide and Loot each return within 5% of that average;
  - no purchase pays for itself in RF, but each one raises the chance of a high place: a shield returns 0.29 RF per 1 RF and lifts the top-10 chance from 28% to 34%, a medkit when hurt from 7% to 11%. The game shows this on each item.

**What have you tested?**
All of these pass:
- typecheck;
- 12 engine tests: map, stats, replay, sponsoring, decisions, economy, settlement, ledger, rounds and challenges;
- `friendsdk check`, and `friendsdk test` at 960 and 390 px;
- `npm run balance`: all four fairness targets over 6,000 rounds;
- an automated browser run through every screen at 960 × 808 and 390 × 844 in the SDK test runtime, and on into a second round;
- a 106 s recording from the real runtime with a Friend read live from mainnet.

The builder played the public preview with a real wallet and a real Generations Friend. Later additions were checked in the SDK test runtime.

**Known limitations**
- The economy is simulated, and balances reset on reload (no save API).
- The other entrants and the crowd are simulated.
- Rounds are shared by time, not by a server. Viewers in the same minute see the same base battle, but your sponsoring and decisions change only your own view.
- The hall's supply read uses the public Robinhood RPC and shows "unavailable" if it fails.
- The demo video was recorded before the final balance pass.
- Sound was checked by measurement, not on physical devices.

**Credits**
Friends are drawn from their canonical on-chain sprites through FriendSDK. All other art and every sound are generated in code, with no samples or image files. Fonts: Bebas Neue and Silkscreen (SIL Open Font License 1.1). Built with Claude Code.
