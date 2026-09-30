/** Balance simulation: fairness of stats and tactics, the odds a player sees in the lobby, the rule that no
 * purchase (sponsor items and paid decision calls) pays for itself, where the burn comes from at each crowd level, what one real player spends and burns, and
 * how much the drop changes a Friend's chances.
 * Returns include the placement ladder and knockout bounties (economy.ts settleRound).
 * Usage: node scripts/balance.ts [baselineRounds=10000] [pairedRoundsPerItem=4000] [--report]
 * With --report the results are written to BALANCE.md and the lobby odds to games/rare-royale/engine/odds.json. */

import { readFileSync, writeFileSync } from "node:fs";
import { createRoundRunner, CROWD } from "../games/rare-royale/runner.ts";
import {
  createBattle, createRng, hash32, settleRound, ladderPrizes, FAMILIES, TACTICS, ENTRY_PRICE, ENTRY_POOL_BPS, BOUNTY, BPS, RF,
  REVIVE_PRICES, SPONSOR_ITEMS, plannedDrops, TUNING, ROUND_SIZE, LOBBY_MS, GAMEPLAY_BURN_BPS, splitPayment, DECISION_PRICE, PAID_OPTION,
  type Battle, type BattleEvent, type DecisionKind, type FighterInit, type Rng, type SponsorItemId,
} from "../games/rare-royale/engine/index.ts";

const [baselineRounds = 10000, pairedRounds = 4000] = process.argv.slice(2).filter(a => !a.startsWith("--")).map(Number);
const writeReport = process.argv.includes("--report");

const toRF = (x: bigint) => Number(x * 1000n / RF) / 1000;
const POOL = ENTRY_PRICE * BigInt(ROUND_SIZE) * ENTRY_POOL_BPS / BPS;
const LADDER = ladderPrizes(POOL, ROUND_SIZE).map(toRF);
/** Every seat's return in RF (ladder place plus bounties) for a finished battle where every seat paid. */
const returnsOf = (b: Battle) => settleRound(b.fighters().map(f => ({ place: f.place, paid: true, koBy: f.koBy, koCause: f.koCause }))).payouts.map(p => toRF(p.total));

function randomFighter(rng: Rng): FighterInit {
  return { tokenId: BigInt(rng.int(1_000_000) + 1), family: rng.pick(FAMILIES), generation: 1 + rng.int(6), seed: rng.int(2 ** 31), tactic: rng.pick(TACTICS) };
}
const lineFor = (seed: number) => { const rng = createRng(seed).fork("line"); return Array.from({ length: ROUND_SIZE }, () => randomFighter(rng)); };

type Acc = { n: number; back: number; profit: number; top10: number; wins: number; prize: number };
const acc = (): Acc => ({ n: 0, back: 0, profit: 0, top10: 0, wins: 0, prize: 0 });
const lines: string[] = [];
const out = (s = "") => { console.log(s); lines.push(s); };

// ---------------------------------------------------------------- baseline fairness
const t0 = Date.now();
const byGen = new Map<number, Acc>(), byFamily = new Map<string, Acc>(), byTactic = new Map<string, Acc>();
const ticks: number[] = [], causes = { fight: 0, storm: 0 }, all = acc();
let bountyBurned = 0;
for (let r = 0; r < baselineRounds; r++) {
  const fighters = lineFor(hash32("baseline", r));
  const battle = createBattle({ seed: hash32("baseline-seed", r), fighters });
  const events = battle.run();
  ticks.push(battle.snapshot().t);
  for (const e of events) if (e.kind === "out") causes[e.cause] += 1;
  const settled = settleRound(battle.fighters().map(f => ({ place: f.place, paid: true, koBy: f.koBy, koCause: f.koCause })));
  bountyBurned += toRF(settled.bountyBurned);
  battle.places().forEach((place, i) => {
    const f = fighters[i], ret = toRF(settled.payouts[i].total);
    const add = (a: Acc) => { a.n += 1; if (ret > 0) a.back += 1; if (ret >= 1) a.profit += 1; if (place <= 10) a.top10 += 1; if (place === 1) a.wins += 1; a.prize += ret; };
    add(all);
    for (const [map, key] of [[byGen, f.generation], [byFamily, f.family], [byTactic, f.tactic]] as const) {
      const a = (map as Map<unknown, Acc>).get(key) ?? acc();
      add(a); (map as Map<unknown, Acc>).set(key, a);
    }
  });
}
ticks.sort((a, b) => a - b);
const pct = (p: number) => ticks[Math.min(ticks.length - 1, Math.floor(p * ticks.length))];

out(`# Rare Royale balance report`);
out();
out(`${baselineRounds.toLocaleString("en-US")} simulated rounds of ${ROUND_SIZE} random Friends (uniform families and Generations, random tactics), ` +
  `plus ${pairedRounds.toLocaleString("en-US")} paired rounds per purchase. Entry ${toRF(ENTRY_PRICE)} RF: ladder pool ${toRF(POOL)} RF ` +
  `(${LADDER.join(" / ")} RF for places 1–10) and a ${toRF(BOUNTY)} RF bounty on every head. Sponsoring closes at ${TUNING.sponsorWindowMin} standing.`);
out();
out(`Battle length in seconds: p10 ${pct(0.1)}, median ${pct(0.5)}, p90 ${pct(0.9)}, max ${ticks[ticks.length - 1]}. ` +
  `Knockouts in fights ${causes.fight}, by the storm ${causes.storm}. Bounties burned by the storm: ${(bountyBurned / baselineRounds).toFixed(3)} RF per round.`);

const pc = (x: number, n: number) => `${(x / n * 100).toFixed(1)}%`;
out(); out(`## What a player can expect from one 1 RF entry`); out();
out(`| Tactic | Any RF back | Back at least 1 RF | Top 10 | Win | Average return |`);
out(`|---|---:|---:|---:|---:|---:|`);
for (const [name, a] of [["All", all], ...TACTICS.map(t => [t, byTactic.get(t)!] as const)] as const) {
  out(`| ${name} | ${pc(a.back, a.n)} | ${pc(a.profit, a.n)} | ${pc(a.top10, a.n)} | ${pc(a.wins, a.n)} | ${(a.prize / a.n).toFixed(3)} RF |`);
}
const oddsOf = (a: Acc) => ({ back: +(a.back / a.n).toFixed(3), profit: +(a.profit / a.n).toFixed(3), top10: +(a.top10 / a.n).toFixed(3), win: +(a.wins / a.n).toFixed(3), avg: +(a.prize / a.n).toFixed(3) });
const odds = { rounds: baselineRounds, all: oddsOf(all), byTactic: Object.fromEntries(TACTICS.map(t => [t, oddsOf(byTactic.get(t)!)])) };

const avgEV = all.prize / all.n;
let worstRatio = 0, worstEV = 0, worstName = "", tacticLo = Infinity, tacticHi = 0;
function table(title: string, map: Map<unknown, Acc>, keys: readonly unknown[]) {
  out(); out(`## ${title}`); out();
  out(`| Group | Entries | Any RF back | Top 10 | Win rate | Return per 1 RF entry | vs average |`);
  out(`|---|---:|---:|---:|---:|---:|---:|`);
  for (const k of keys) {
    const a = map.get(k); if (!a) continue;
    const ev = a.prize / a.n, ratio = ev / avgEV;
    if (ratio > worstRatio) { worstRatio = ratio; worstName = `${title}: ${String(k)}`; }
    worstEV = Math.max(worstEV, ev);
    if (title === "By tactic") { tacticLo = Math.min(tacticLo, ratio); tacticHi = Math.max(tacticHi, ratio); }
    out(`| ${String(k)} | ${a.n} | ${pc(a.back, a.n)} | ${pc(a.top10, a.n)} | ${pc(a.wins, a.n)} | ${ev.toFixed(3)} RF | ${ratio.toFixed(2)}x |`);
  }
}
table("By Generation", byGen as Map<unknown, Acc>, [1, 2, 3, 4, 5, 6]);
table("By family", byFamily as Map<unknown, Acc>, FAMILIES);
table("By tactic", byTactic as Map<unknown, Acc>, TACTICS);

// ---------------------------------------------------------------- paired purchase experiments
type Policy = Readonly<{ name: string; act(b: Battle, me: number, spent: { rf: number; bought: number; standing: number }): void }>;
const buy = (b: Battle, me: number, item: SponsorItemId, spent: { rf: number; bought: number; standing: number }) => {
  const f = b.fighters()[me];
  const price = item === "revive" ? REVIVE_PRICES[f.revives] : SPONSOR_ITEMS[item].price;
  if (price === undefined || !b.canSponsor(me, item).ok) return false;
  b.sponsor(me, item, "sim");
  if (spent.bought === 0) spent.standing = b.snapshot().standing;
  spent.rf += toRF(price); spent.bought += 1;
  return true;
};
const once = (item: SponsorItemId, when: (b: Battle, me: number) => boolean): Policy["act"] =>
  (b, me, spent) => { if (spent.bought === 0 && when(b, me)) buy(b, me, item, spent); };
/** Answers an open decision of one of `kinds` with its paid option (Smoke, Pry or Boost) for DECISION_PRICE. */
const call = (b: Battle, me: number, kinds: readonly DecisionKind[], spent: { rf: number; bought: number; standing: number }) => {
  const d = b.pendingDecision(me);
  if (!d || !kinds.includes(d.kind) || !b.decide(me, PAID_OPTION[d.kind])) return false;
  if (spent.bought === 0) spent.standing = b.snapshot().standing;
  spent.rf += toRF(DECISION_PRICE); spent.bought += 1;
  return true;
};
const ALL_CALLS: readonly DecisionKind[] = ["engage", "crate", "storm"];

const policies: readonly (Policy & { item?: SponsorItemId; call?: DecisionKind | "all" })[] = [
  { name: "Shield, bought at a random moment", item: "shield", act: (() => {
    let at = -1;
    return (b: Battle, me: number, spent: { rf: number; bought: number; standing: number }) => {
      const t = b.snapshot().t;
      if (t === 0) at = 20 + createRng(hash32("shield-at", b.fighters()[me].id.seed)).int(80);
      if (spent.bought === 0 && t >= at) buy(b, me, "shield", spent);
    };
  })() },
  { name: "Medkit, bought below 50% HP", item: "medkit", act: once("medkit", (b, me) => { const f = b.fighters()[me]; return f.state === "alive" && f.hp < f.maxHp * 0.5; }) },
  { name: "Second life, bought when downed", item: "revive", act: once("revive", (b, me) => b.fighters()[me].state === "downed") },
  { name: "Medkit, bought as late as possible (hurt, 30 or fewer standing)", act: once("medkit", (b, me) => { const f = b.fighters()[me]; return f.state === "alive" && f.hp < f.maxHp * 0.6 && b.snapshot().standing <= 30; }) },
  { name: "Shield, bought as late as possible (30 or fewer standing)", act: once("shield", (b, me) => b.fighters()[me].state === "alive" && b.snapshot().standing <= 30) },
  { name: "Smoke (1 RF), whenever an enemy is spotted", call: "engage", act: (b, me, spent) => { call(b, me, ["engage"], spent); } },
  { name: "Pry (1 RF), whenever a crate is near", call: "crate", act: (b, me, spent) => { call(b, me, ["crate"], spent); } },
  { name: "Boost (1 RF), whenever caught in the storm", call: "storm", act: (b, me, spent) => { call(b, me, ["storm"], spent); } },
  { name: "Every paid call, every time (up to 4 a round)", call: "all", act: (b, me, spent) => { call(b, me, ALL_CALLS, spent); } },
  { name: "Everything, every time (max spender: items and calls)", act: (b, me, spent) => {
    const f = b.fighters()[me];
    if (f.state === "downed") buy(b, me, "revive", spent);
    if (f.state === "alive" && !f.shield) buy(b, me, "shield", spent);
    if (f.state === "alive" && f.hp < f.maxHp * 0.5) buy(b, me, "medkit", spent);
    call(b, me, ALL_CALLS, spent);
  } },
];

out(); out(`## Does any purchase pay for itself?`); out();
out(`Each pair plays the same seeded round twice for the same Friend: once without the purchase and once with it. ` +
  `For a paid call (Smoke, Pry, Boost), "without" leaves the decision to the tactic, as when a player does not answer. ` +
  `The gain is the average extra prize among rounds where the purchase happened, with a 95% interval. Fairness holds when gain < cost.`);
out();
out(`| Purchase | Rounds bought | Avg cost | Avg return gain | 95% interval | Gain per 1 RF spent | Top 10: without → with | Bought with 30 or fewer standing: gain / cost |`);
out(`|---|---:|---:|---:|---:|---:|---:|---:|`);
let purchaseOk = true;
/** What each sponsor item does for the Friend it is bought for, shown in the game's dock. */
const purchases: Partial<Record<SponsorItemId, { perRF: number; top10Without: number; top10With: number }>> = {};
/** The same for each paid call, shown next to the decision's third button; "all" is every call every time. */
const decisions: Partial<Record<DecisionKind | "all", { perRF: number; top10Without: number; top10With: number; perRound: number }>> = {};
for (const policy of policies) {
  let n = 0, sum = 0, sumSq = 0, cost = 0, lateN = 0, lateGain = 0, lateCost = 0, topBase = 0, topBuy = 0;
  for (let k = 0; k < pairedRounds; k++) {
    const seed = hash32("paired", policy.name, k), fighters = lineFor(hash32("paired-line", k)), me = 0;
    const base = createBattle({ seed, fighters }); base.run();
    const withBuy = createBattle({ seed, fighters, deciders: [me] });
    const spent = { rf: 0, bought: 0, standing: 0 };
    while (!withBuy.isOver()) { policy.act(withBuy, me, spent); withBuy.step(); }
    if (!spent.bought) continue;
    const gain = returnsOf(withBuy)[me] - returnsOf(base)[me];
    n += 1; sum += gain; sumSq += gain * gain; cost += spent.rf;
    if (base.fighters()[me].place <= 10) topBase += 1;
    if (withBuy.fighters()[me].place <= 10) topBuy += 1;
    if (spent.standing <= 30) { lateN += 1; lateGain += gain; lateCost += spent.rf; }
  }
  const mean = sum / n, sd = Math.sqrt(Math.max(0, sumSq / n - mean * mean)), ci = 1.96 * sd / Math.sqrt(n), avgCost = cost / n;
  if (mean + ci >= avgCost) purchaseOk = false;
  if (policy.item) purchases[policy.item] = { perRF: +(mean / avgCost).toFixed(2), top10Without: +(topBase / n).toFixed(3), top10With: +(topBuy / n).toFixed(3) };
  if (policy.call) decisions[policy.call] = { perRF: +(mean / avgCost).toFixed(2), top10Without: +(topBase / n).toFixed(3), top10With: +(topBuy / n).toFixed(3), perRound: +(n / pairedRounds).toFixed(3) };
  if (lateN >= 100 && lateGain / lateN >= lateCost / lateN) purchaseOk = false;
  out(`| ${policy.name} | ${n} | ${avgCost.toFixed(2)} RF | ${mean.toFixed(3)} RF | ${(mean - ci).toFixed(3)} to ${(mean + ci).toFixed(3)} | ` +
    `${(mean / avgCost).toFixed(3)} RF | ${pc(topBase, n)} → ${pc(topBuy, n)} | ${lateN ? `${(lateGain / lateN).toFixed(2)} / ${(lateCost / lateN).toFixed(2)} RF (${lateN} rounds)` : "none"} |`);
}

// ---------------------------------------------------------------- where the burn comes from
const ROSTER: FighterInit[] = JSON.parse(readFileSync(new URL("../games/rare-royale/roster.json", import.meta.url), "utf8")).friends
  .filter((f: { family: string }) => (FAMILIES as readonly string[]).includes(f.family))
  .map((f: { id: string; family: FighterInit["family"]; gen: number; seed: number }) => ({ tokenId: BigInt(f.id), family: f.family, generation: f.gen, seed: f.seed }));
const CROWD_ROUNDS = 300;
out(); out(`## Where the burn comes from`); out();
out(`The same ${CROWD_ROUNDS} rounds (the game's roster, round ids 8000 to ${8000 + CROWD_ROUNDS - 1}, 50 paid entries) at three levels of the simulated ` +
  `other entrants and viewers; 100% is what the game plays. The crowd model: every second while sponsoring is open, each downed Friend gets a ` +
  `second life with ${CROWD.revive * 100}% chance, a random standing Friend a shield with ${CROWD.shield * 100}%, a random Friend below ` +
  `${CROWD.hurtBelow * 100}% HP a medkit with ${CROWD.medkit * 100}%, and a fan buys a shout with ${CROWD.shout * 100}%. The level scales all four chances.`);
out();
out(`| Crowd level | Sponsoring and shouts per entrant per round | Spent per round | Burned per round | Share burned | From entries | From the crowd | Storm bounties |`);
out(`|---|---:|---:|---:|---:|---:|---:|---:|`);
const crowdLevels: { level: number; perEntrant: number; spent: number; burned: number; share: number }[] = [];
for (const level of [0, 0.5, 1]) {
  let entries = 0, crowdRF = 0, burned = 0, crowdBurned = 0, storm = 0;
  for (let i = 0; i < CROWD_ROUNDS; i++) {
    const r = createRoundRunner(8000 + i, ROSTER, undefined, false, level);
    r.advanceTo(Number.MAX_SAFE_INTEGER);
    entries += toRF(r.tally.entries); crowdRF += toRF(r.tally.crowd); burned += toRF(r.tally.burned);
    crowdBurned += toRF(r.tally.crowdBurned); storm += toRF(r.tally.bountyBurned);
  }
  const n = CROWD_ROUNDS, spent = (entries + crowdRF) / n, b = burned / n;
  crowdLevels.push({ level, perEntrant: +(crowdRF / n / ROUND_SIZE).toFixed(2), spent: +spent.toFixed(1), burned: +b.toFixed(1), share: +(b / spent).toFixed(3) });
  out(`| ${level * 100}% | ${(crowdRF / n / ROUND_SIZE).toFixed(2)} RF | ${spent.toFixed(1)} RF | ${b.toFixed(1)} RF | ${(b / spent * 100).toFixed(0)}% | ` +
    `${((burned - crowdBurned - storm) / n).toFixed(1)} RF | ${(crowdBurned / n).toFixed(1)} RF | ${(storm / n).toFixed(2)} RF |`);
}

// ---------------------------------------------------------------- one real player, no crowd needed
const PLAYER_ROUNDS = 3000;
type Profile = Readonly<{ name: string; act(b: Battle, me: number, spent: { rf: number; bought: number; standing: number }): void }>;
const profiles: readonly Profile[] = [
  { name: "Entry only", act: () => {} },
  { name: "Careful: entry, one shield, a medkit when below half HP", act: (() => {
    let at = -1, shield = false, medkit = false;
    return (b: Battle, me: number, spent: { rf: number; bought: number; standing: number }) => {
      const t = b.snapshot().t, f = b.fighters()[me];
      if (t === 0) { at = 20 + createRng(hash32("careful-at", f.id.seed)).int(80); shield = medkit = false; }
      if (!shield && t >= at && buy(b, me, "shield", spent)) shield = true;
      if (!medkit && f.state === "alive" && f.hp < f.maxHp * 0.5 && buy(b, me, "medkit", spent)) medkit = true;
    };
  })() },
  { name: "Tactician: entry and every paid call (Smoke, Pry, Boost)", act: (b, me, spent) => { call(b, me, ALL_CALLS, spent); } },
  { name: "All-in: every item and every paid call whenever it helps", act: policies[policies.length - 1].act },
];
out(); out(`## One real player`); out();
const playerProfiles: { name: string; spent: number; burned: number; share: number; back: number; calls: number }[] = [];
let playerTicks = 0, battles = 0;
for (const profile of profiles) {
  let spentRF = 0, burnedRF = 0, back = 0, calls = 0;
  for (let k = 0; k < PLAYER_ROUNDS; k++) {
    // Every profile plays the same rounds, so the rows compare like with like.
    const b = createBattle({ seed: hash32("player", k), fighters: lineFor(hash32("player-line", k)), deciders: [0] }), me = 0;
    const spent = { rf: 0, bought: 0, standing: 0 };
    const events: BattleEvent[] = [];
    while (!b.isOver()) { profile.act(b, me, spent); events.push(...b.step()); }
    calls += events.filter(e => e.kind === "decided" && e.paid).length;
    playerTicks += b.snapshot().t; battles += 1;
    spentRF += toRF(ENTRY_PRICE) + spent.rf;
    burnedRF += toRF(splitPayment("entry", ENTRY_PRICE).burned) + spent.rf * Number(GAMEPLAY_BURN_BPS) / Number(BPS);
    back += returnsOf(b)[me];
  }
  const n = PLAYER_ROUNDS;
  playerProfiles.push({ name: profile.name, spent: +(spentRF / n).toFixed(2), burned: +(burnedRF / n).toFixed(2), share: +(burnedRF / spentRF).toFixed(3), back: +(back / n).toFixed(2), calls: +(calls / n).toFixed(2) });
}
const roundSeconds = LOBBY_MS / 1000 + playerTicks / battles + 25, session = 600 / roundSeconds;
out(`What a single player spends and burns, with no crowd at all: ${PLAYER_ROUNDS.toLocaleString("en-US")} rounds per profile, random line-ups, ` +
  `the player's own purchases only. A session of 10 minutes holds about ${session.toFixed(1)} rounds (60 s lobby, the battle, 25 s of results). ` +
  `A paid call costs ${toRF(DECISION_PRICE)} RF (50% burned) and needs a decision the round offers, at most ${TUNING.maxDecisions} a round.`);
out();
out(`| Player | Spent per round | Burned per round | Share burned | Paid calls per round | Back per round (average) | 10-minute session: spent / burned |`);
out(`|---|---:|---:|---:|---:|---:|---:|`);
for (const p of playerProfiles)
  out(`| ${p.name} | ${p.spent.toFixed(2)} RF | ${p.burned.toFixed(2)} RF | ${(p.share * 100).toFixed(0)}% | ${p.calls.toFixed(2)} | ${p.back.toFixed(2)} RF | ${(p.spent * session).toFixed(1)} / ${(p.burned * session).toFixed(1)} RF |`);

// ---------------------------------------------------------------- does the drop matter?
out(); out(`## Where to drop`); out();
out(`Each of ${pairedRounds.toLocaleString("en-US")} rounds is played three times for the same Friend with the same tactic, changing only the drop: ` +
  `the place the fewest other Friends plan to land at (as the lobby's drop map shows), the tactic's own choice, and the busiest place.`);
out();
out(`| Drop | Other Friends landing at the same place (average) | Top 10 | Win | Average return |`);
out(`|---|---:|---:|---:|---:|`);
const drops: { name: string; landers: number; top10: number; win: number; avg: number }[] = [];
{
  const variants = ["Quietest place", "Tactic's own choice", "Busiest place"] as const;
  const sums = variants.map(() => ({ landers: 0, top10: 0, win: 0, ret: 0 }));
  for (let k = 0; k < pairedRounds; k++) {
    const seed = hash32("drop", k), fighters = lineFor(hash32("drop-line", k)), me = 0;
    const planned = plannedDrops(seed, fighters), count = new Map<string, number>();
    for (const d of planned) if (d.index !== me && d.poi) count.set(d.poi, (count.get(d.poi) ?? 0) + 1);
    const pois = [...new Set(planned.map(d => d.poi).filter((x): x is string => !!x))];
    const by = (id: string) => count.get(id) ?? 0;
    const quiet = pois.reduce((a, b) => (by(b) < by(a) ? b : a)), busy = pois.reduce((a, b) => (by(b) > by(a) ? b : a));
    [quiet, undefined, busy].forEach((drop, v) => {
      const b = createBattle({ seed, fighters: fighters.map((f, i) => (i === me ? { ...f, drop } : f)) }); b.run();
      const f = b.fighters()[me], sum = sums[v];
      sum.landers += f.dropPoi ? by(f.dropPoi) : 0;
      if (f.place <= 10) sum.top10 += 1;
      if (f.place === 1) sum.win += 1;
      sum.ret += returnsOf(b)[me];
    });
  }
  variants.forEach((name, v) => {
    const sum = sums[v], n = pairedRounds;
    drops.push({ name, landers: +(sum.landers / n).toFixed(1), top10: +(sum.top10 / n).toFixed(3), win: +(sum.win / n).toFixed(3), avg: +(sum.ret / n).toFixed(3) });
    out(`| ${name} | ${(sum.landers / n).toFixed(1)} | ${pc(sum.top10, n)} | ${pc(sum.win, n)} | ${(sum.ret / n).toFixed(2)} RF |`);
  });
}

out(); out(`## Targets`); out();
out(`- No Generation, family or tactic earns more than 1.2x the average prize per entry (${avgEV.toFixed(2)} RF): ${worstRatio <= 1.2 ? "PASS" : "FAIL"} (highest ${worstRatio.toFixed(2)}x, ${worstName}).`);
out(`- Every tactic returns within 5% of the average, so the round, not the choice, decides which was right: ${tacticLo >= 0.95 && tacticHi <= 1.05 ? "PASS" : "FAIL"} (${tacticLo.toFixed(2)}x to ${tacticHi.toFixed(2)}x).`);
out(`- No group earns 1 RF or more per 1 RF entry: ${worstEV < 1 ? "PASS" : "FAIL"} (highest ${worstEV.toFixed(3)} RF).`);
out(`- No purchase's average gain reaches its cost, even at the top of the 95% interval, and no late purchase (100+ rounds) pays for itself: ${purchaseOk ? "PASS" : "FAIL"}.`);
out(); out(`Simulated in ${((Date.now() - t0) / 1000).toFixed(1)} s.`);

if (writeReport) {
  writeFileSync(new URL("../BALANCE.md", import.meta.url), `${lines.join("\n")}\n`);
  writeFileSync(new URL("../games/rare-royale/engine/odds.json", import.meta.url), `${JSON.stringify({ ...odds, purchases, decisions, crowdLevels, playerProfiles, sessionRounds: +session.toFixed(1), drops }, null, 2)}\n`);
}
