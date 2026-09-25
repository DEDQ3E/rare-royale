/** One round from the viewer's side: the seeded battle, the simulated crowd of sponsors, and the round's
 * simulated RF tally. The crowd is seeded by the round and tick, so every viewer sees the same fans. */

import {
  createBattle, createRng, hash32, lineUp, withPlayer, roundSeed, settleRound, splitPayment, revivePrice, ENTRY_PRICE, ROUND_SIZE, SPONSOR_ITEMS,
  type Battle, type BattleEvent, type FighterInit, type Settlement, type SponsorItemId,
} from "./engine/index.ts";

/** The round's simulated RF: entries in, sponsor payments, and where it all went. `bountyBurned` is part of `burned`. */
export type Tally = { entries: bigint; paid: number; crowd: bigint; yours: bigint; pool: bigint; bounty: bigint; burned: bigint; bountyBurned: bigint; rewards: bigint };
export const emptyTally = (): Tally => ({ entries: 0n, paid: 0, crowd: 0n, yours: 0n, pool: 0n, bounty: 0n, burned: 0n, bountyBurned: 0n, rewards: 0n });

export type RoundRunner = Readonly<{
  id: number;
  battle: Battle;
  player: number;
  lineup: readonly FighterInit[];
  /** Which seats paid an entry. In the preview every simulated entrant paid; a practice seat did not. */
  paid: readonly boolean[];
  tally: Tally;
  /** The payouts, once the battle is over (null before). */
  settlement(): Settlement | null;
  /** Steps until the battle reaches `tick` (or ends). Returns every event produced, oldest first. */
  advanceTo(tick: number): BattleEvent[];
  /** Records a payment by the viewer in the round tally. */
  recordYours(kind: "shield" | "medkit" | "revive" | "cosmetic", amount: bigint): void;
}>;

/** A round's line-up and battle. With a player, their Friend takes a seat and can make decisions; a practice seat
 * pays nothing and, like a wild Friend, can take no prize. */
export function createRoundRunner(id: number, roster: readonly FighterInit[], player?: FighterInit, practice = false): RoundRunner {
  const line = lineUp(roster, id);
  const seated = player ? withPlayer(line, player, id) : { fighters: line, index: -1 };
  const paid = seated.fighters.map((_, i) => !(practice && i === seated.index));
  const battle = createBattle({ seed: roundSeed(id), fighters: seated.fighters, deciders: seated.index >= 0 ? [seated.index] : [] });
  const tally = emptyTally();
  const pay = (kind: "entry" | SponsorItemId | "cosmetic", amount: bigint) => {
    const s = splitPayment(kind, amount);
    tally.pool += s.pool; tally.bounty += s.bounty; tally.burned += s.burned; tally.rewards += s.rewards;
  };
  // Every paid seat put in its 1 RF entry (the simulated entrants' seats and, if entered for RF, the player's).
  for (let i = 0; i < ROUND_SIZE; i++) if (paid[i]) { tally.entries += ENTRY_PRICE; tally.paid += 1; pay("entry", ENTRY_PRICE); }
  let settled: Settlement | null = null;
  const settle = () => {
    if (settled || !battle.isOver()) return settled;
    settled = settleRound(battle.fighters().map(f => ({ place: f.place, paid: paid[f.index], koBy: f.koBy, koCause: f.koCause })));
    tally.bountyBurned = settled.bountyBurned; tally.burned += settled.bountyBurned;
    return settled;
  };

  function crowd() {
    const snap = battle.snapshot();
    if (!snap.windowOpen || snap.over) return;
    const rng = createRng(hash32(roundSeed(id), "crowd", snap.t));
    const fan = () => `Fan #${1000 + rng.int(9000)}`;
    const buy = (who: number, item: SponsorItemId) => {
      const f = snap.fighters[who];
      const price = item === "revive" ? revivePrice(f.revives) : SPONSOR_ITEMS[item].price;
      if (price === null || !battle.canSponsor(who, item).ok) return;
      battle.sponsor(who, item, fan());
      tally.crowd += price; pay(item, price);
    };
    for (const f of snap.fighters) if (f.state === "downed" && rng.chance(0.06)) buy(f.index, "revive");
    const up = snap.fighters.filter(f => f.state === "alive");
    if (up.length && rng.chance(0.12)) buy(rng.pick(up).index, "shield");
    const hurt = up.filter(f => f.hp < f.maxHp * 0.6);
    if (hurt.length && rng.chance(0.09)) buy(rng.pick(hurt).index, "medkit");
  }

  return {
    id, battle, player: seated.index, lineup: seated.fighters, paid, tally,
    settlement: settle,
    advanceTo(tick) {
      const out: BattleEvent[] = [];
      while (!battle.isOver() && battle.snapshot().t < tick) { crowd(); out.push(...battle.step()); }
      settle();
      return out;
    },
    recordYours(kind, amount) { tally.yours += amount; pay(kind, amount); },
  };
}

/** Finished past rounds for the hall of fame: the same for every viewer. */
export type PastRound = Readonly<{ id: number; winner: FighterInit; winnerKos: number; winnerPrize: bigint; burned: bigint; spent: bigint; topKo: { init: FighterInit; kos: number } }>;
export function replayRound(id: number, roster: readonly FighterInit[]): PastRound {
  const r = createRoundRunner(id, roster);
  r.advanceTo(Number.MAX_SAFE_INTEGER);
  const fighters = r.battle.fighters();
  const win = fighters.find(f => f.place === 1) ?? fighters[0];
  const top = [...fighters].sort((a, b) => b.kos - a.kos)[0];
  return { id, winner: win.id, winnerKos: win.kos, winnerPrize: r.settlement()?.payouts[win.index].total ?? 0n, burned: r.tally.burned, spent: r.tally.entries + r.tally.crowd, topKo: { init: top.id, kos: top.kos } };
}
