/** Balance simulation: fairness of stats and tactics, the odds a player sees in the lobby, and the rule that no
 * purchase pays for itself. Returns include the placement ladder and knockout bounties (economy.ts settleRound).
 * Usage: node scripts/balance.ts [baselineRounds=10000] [pairedRoundsPerItem=4000] [--report]
 * With --report the results are written to BALANCE.md and the lobby odds to games/rare-royale/engine/odds.json. */

import { writeFileSync } from "node:fs";
import {
  createBattle, createRng, hash32, settleRound, ladderPrizes, FAMILIES, TACTICS, ENTRY_PRICE, ENTRY_POOL_BPS, BOUNTY, BPS, RF,
  REVIVE_PRICES, SPONSOR_ITEMS, TUNING, ROUND_SIZE, type Battle, type FighterInit, type Rng, type SponsorItemId,
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
let worstRatio = 0, worstEV = 0, worstName = "";
function table(title: string, map: Map<unknown, Acc>, keys: readonly unknown[]) {
  out(); out(`## ${title}`); out();
  out(`| Group | Entries | Any RF back | Top 10 | Win rate | Return per 1 RF entry | vs average |`);
  out(`|---|---:|---:|---:|---:|---:|---:|`);
  for (const k of keys) {
    const a = map.get(k); if (!a) continue;
    const ev = a.prize / a.n, ratio = ev / avgEV;
    if (ratio > worstRatio) { worstRatio = ratio; worstName = `${title}: ${String(k)}`; }
    worstEV = Math.max(worstEV, ev);
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

const policies: readonly Policy[] = [
  { name: "Shield, bought at a random moment", act: (() => {
    let at = -1;
    return (b: Battle, me: number, spent: { rf: number; bought: number; standing: number }) => {
      const t = b.snapshot().t;
      if (t === 0) at = 20 + createRng(hash32("shield-at", b.fighters()[me].id.seed)).int(80);
      if (spent.bought === 0 && t >= at) buy(b, me, "shield", spent);
    };
  })() },
  { name: "Medkit, bought below 50% HP", act: once("medkit", (b, me) => { const f = b.fighters()[me]; return f.state === "alive" && f.hp < f.maxHp * 0.5; }) },
  { name: "Second life, bought when downed", act: once("revive", (b, me) => b.fighters()[me].state === "downed") },
  { name: "Medkit, bought as late as possible (hurt, 30 or fewer standing)", act: once("medkit", (b, me) => { const f = b.fighters()[me]; return f.state === "alive" && f.hp < f.maxHp * 0.6 && b.snapshot().standing <= 30; }) },
  { name: "Shield, bought as late as possible (30 or fewer standing)", act: once("shield", (b, me) => b.fighters()[me].state === "alive" && b.snapshot().standing <= 30) },
  { name: "Everything, every time (max spender)", act: (b, me, spent) => {
    const f = b.fighters()[me];
    if (f.state === "downed") buy(b, me, "revive", spent);
    if (f.state === "alive" && !f.shield) buy(b, me, "shield", spent);
    if (f.state === "alive" && f.hp < f.maxHp * 0.5) buy(b, me, "medkit", spent);
  } },
];

out(); out(`## Does any purchase pay for itself?`); out();
out(`Each pair plays the same seeded round twice for the same Friend: once without the purchase and once with it. ` +
  `The gain is the average extra prize among rounds where the purchase happened, with a 95% interval. Fairness holds when gain < cost.`);
out();
out(`| Purchase | Rounds bought | Avg cost | Avg return gain | 95% interval | Gain per 1 RF spent | Bought with 30 or fewer standing: gain / cost |`);
out(`|---|---:|---:|---:|---:|---:|---:|`);
let purchaseOk = true;
for (const policy of policies) {
  let n = 0, sum = 0, sumSq = 0, cost = 0, lateN = 0, lateGain = 0, lateCost = 0;
  for (let k = 0; k < pairedRounds; k++) {
    const seed = hash32("paired", policy.name, k), fighters = lineFor(hash32("paired-line", k)), me = 0;
    const base = createBattle({ seed, fighters }); base.run();
    const withBuy = createBattle({ seed, fighters });
    const spent = { rf: 0, bought: 0, standing: 0 };
    while (!withBuy.isOver()) { policy.act(withBuy, me, spent); withBuy.step(); }
    if (!spent.bought) continue;
    const gain = returnsOf(withBuy)[me] - returnsOf(base)[me];
    n += 1; sum += gain; sumSq += gain * gain; cost += spent.rf;
    if (spent.standing <= 30) { lateN += 1; lateGain += gain; lateCost += spent.rf; }
  }
  const mean = sum / n, sd = Math.sqrt(Math.max(0, sumSq / n - mean * mean)), ci = 1.96 * sd / Math.sqrt(n), avgCost = cost / n;
  if (mean + ci >= avgCost) purchaseOk = false;
  if (lateN >= 100 && lateGain / lateN >= lateCost / lateN) purchaseOk = false;
  out(`| ${policy.name} | ${n} | ${avgCost.toFixed(2)} RF | ${mean.toFixed(3)} RF | ${(mean - ci).toFixed(3)} to ${(mean + ci).toFixed(3)} | ` +
    `${(mean / avgCost).toFixed(3)} RF | ${lateN ? `${(lateGain / lateN).toFixed(2)} / ${(lateCost / lateN).toFixed(2)} RF (${lateN} rounds)` : "none"} |`);
}

out(); out(`## Targets`); out();
out(`- No Generation, family or tactic earns more than 1.2x the average prize per entry (${avgEV.toFixed(2)} RF): ${worstRatio <= 1.2 ? "PASS" : "FAIL"} (highest ${worstRatio.toFixed(2)}x, ${worstName}).`);
out(`- No group earns 1 RF or more per 1 RF entry: ${worstEV < 1 ? "PASS" : "FAIL"} (highest ${worstEV.toFixed(3)} RF).`);
out(`- No purchase's average gain reaches its cost, even at the top of the 95% interval, and no late purchase (100+ rounds) pays for itself: ${purchaseOk ? "PASS" : "FAIL"}.`);
out(); out(`Simulated in ${((Date.now() - t0) / 1000).toFixed(1)} s.`);

if (writeReport) {
  writeFileSync(new URL("../BALANCE.md", import.meta.url), `${lines.join("\n")}\n`);
  writeFileSync(new URL("../games/rare-royale/engine/odds.json", import.meta.url), `${JSON.stringify(odds, null, 2)}\n`);
}
