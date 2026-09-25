import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createBattle, createLedger, createRng, generateMap, zoneSchedule, hash32, lineUp, withPlayer, ladderPrizes, settleRound, splitPayment, statsFor, genPoints, roundAt,
  FAMILIES, PROFILES, TACTICS, TUNING, ENTRY_PRICE, BOUNTY, REVIVE_PRICES, ROUND_SIZE, RF, rf, EPOCH_MS, ROUND_MS, LOBBY_MS,
  type FighterInit,
} from "../games/rare-royale/engine/index.ts";

const line = (seed: number, size = ROUND_SIZE): FighterInit[] => {
  const r = createRng(seed);
  return Array.from({ length: size }, (_, i) => ({ tokenId: BigInt(i + 1), family: r.pick(FAMILIES), generation: 1 + r.int(6), seed: r.int(2 ** 31), tactic: r.pick(TACTICS) }));
};

test("map: the island, its places and the storm are the same for everyone", () => {
  const a = generateMap(123), b = generateMap(123);
  assert.equal(a, b);
  assert.equal(a.pois.length, 7);
  for (const p of a.pois) assert.ok(a.isLand(p.x, p.y), p.name);
  const z = zoneSchedule(a);
  assert.equal(z.circles.length, TUNING.zoneRadius.length);
  for (let k = 1; k < z.circles.length; k++) {
    const p = z.circles[k - 1], c = z.circles[k];
    assert.ok(Math.hypot(c.cx - p.cx, c.cy - p.cy) + c.r <= p.r + 1e-6, "each circle sits inside the previous one");
  }
});

test("stats: every family profile totals 30 and Generation adds at most 2 points", () => {
  for (const family of FAMILIES) {
    const b = PROFILES[family].base;
    assert.equal(b.might + b.speed + b.wits, 30, family);
    for (let generation = 1; generation <= 6; generation++) for (let seed = 0; seed < 9; seed++) {
      const s = statsFor({ tokenId: 1n, family, generation, seed });
      assert.equal(s.might + s.speed + s.wits, 30 + genPoints(generation));
      assert.ok(Math.min(s.might, s.speed, s.wits) >= 5);
    }
  }
  assert.ok(Math.max(...[1, 2, 3, 4, 5, 6].map(genPoints)) <= 2);
});

test("battle: the same seed and line-up replay identically", () => {
  const fighters = line(7);
  const a = createBattle({ seed: 42, fighters }).run(), b = createBattle({ seed: 42, fighters }).run();
  assert.deepEqual(a, b);
});

test("battle: every round ends with one winner and places 1..50 exactly once", () => {
  for (let r = 0; r < 60; r++) {
    const battle = createBattle({ seed: hash32("t", r), fighters: line(r) });
    const events = battle.run();
    const places = [...battle.places()].sort((x, y) => x - y);
    assert.deepEqual(places, Array.from({ length: ROUND_SIZE }, (_, i) => i + 1));
    assert.equal(events.filter(e => e.kind === "winner").length, 1);
    assert.ok(battle.snapshot().t <= TUNING.maxTicks + 1);
    assert.ok(events.some(e => e.kind === "land") && events.some(e => e.kind === "shot") && events.some(e => e.kind === "loot"));
  }
});

test("sponsoring: rules for shield, medkit and second life; the window closes at 25 standing", () => {
  const battle = createBattle({ seed: 9, fighters: line(9) });
  assert.equal(battle.canSponsor(0, "shield").ok, false, "still in the air");
  while (battle.fighters()[0].state === "air") battle.step();
  assert.equal(battle.canSponsor(0, "medkit").ok, false, "full HP");
  assert.equal(battle.canSponsor(0, "revive").ok, false, "not downed");
  assert.equal(battle.sponsor(0, "shield", "fan").ok, true);
  assert.equal(battle.canSponsor(0, "shield").ok, false, "shields do not stack");
  let revived = 0;
  while (!battle.isOver()) {
    const snap = battle.snapshot();
    for (const f of snap.fighters) if (f.state === "downed" && battle.canSponsor(f.index, "revive").ok && f.revives < 3) {
      assert.equal(battle.sponsor(f.index, "revive", "fan").ok, true); revived += 1;
    }
    if (!snap.windowOpen) {
      assert.ok(snap.standing <= TUNING.sponsorWindowMin);
      for (const f of snap.fighters) for (const item of ["shield", "medkit", "revive"] as const) assert.equal(battle.canSponsor(f.index, item).ok, false);
    }
    battle.step();
  }
  assert.ok(revived > 0);
  assert.ok(battle.fighters().every(f => f.revives <= 3));
});

test("decisions: offered only to deciders and only with valid options", () => {
  const battle = createBattle({ seed: 11, fighters: line(11), deciders: [3] });
  let offered = 0;
  while (!battle.isOver()) {
    for (const e of battle.step()) if (e.kind === "decision") {
      assert.equal(e.who, 3); offered += 1;
      assert.equal(battle.decide(3, "nonsense"), false);
      assert.equal(battle.decide(3, e.decision === "engage" ? "flee" : e.decision === "crate" ? "open" : "sprint"), true);
      assert.equal(battle.decide(3, "fight"), false, "answered once");
    }
  }
  assert.ok(offered >= 1 && offered <= TUNING.maxDecisions);
});

test("economy: entry is 60% ladder, 20% bounty, 10% burned, 10% rewards; gameplay payments are 50/50", () => {
  assert.deepEqual(splitPayment("entry", ENTRY_PRICE), { pool: rf("0.6"), bounty: rf("0.2"), burned: rf("0.1"), rewards: rf("0.1") });
  for (const kind of ["shield", "medkit", "revive", "cosmetic"] as const) {
    assert.deepEqual(splitPayment(kind, rf("3")), { pool: 0n, bounty: 0n, burned: rf("1.5"), rewards: rf("1.5") });
  }
  for (const amount of [1n, 7n, rf("0.3"), rf("12345.678")]) for (const kind of ["entry", "shield"] as const) {
    const s = splitPayment(kind, amount);
    assert.equal(s.pool + s.bounty + s.burned + s.rewards, amount);
  }
  assert.deepEqual(ladderPrizes(rf("30"), 50), ["8", "5", "4", "3", "2.5", "1.5", "1.5", "1.5", "1.5", "1.5"].map(rf));
  for (const paid of [5, 6, 12, 37, 49, 50]) {
    const pool = ENTRY_PRICE * BigInt(paid) * 6n / 10n, ladder = ladderPrizes(pool, paid);
    assert.equal(ladder.reduce((a, b) => a + b, 0n), pool);
    assert.equal(ladder.length, Math.min(10, Math.ceil(paid / 5)));
    for (let i = 1; i < ladder.length; i++) assert.ok(ladder[i] <= ladder[i - 1]);
  }
  assert.deepEqual(REVIVE_PRICES, [rf("2"), rf("4"), rf("8")]);
});

test("settlement: prizes go to paid entrants only, bounties follow knockouts, every RF is accounted for", () => {
  const b = createBattle({ seed: 42, fighters: line(42) });
  b.run();
  const fs = b.fighters();
  for (const wild of [0, 5, 20, 45, 46]) {
    const paid = fs.map((_, i) => i >= wild);
    const st = settleRound(fs.map(f => ({ place: f.place, paid: paid[f.index], koBy: f.koBy, koCause: f.koCause })));
    const n = paid.filter(Boolean).length;
    const paidOut = st.payouts.reduce((a, p) => a + p.total, 0n);
    if (n < 5) {
      assert.ok(st.refunded);
      assert.equal(paidOut, ENTRY_PRICE * BigInt(n));
      continue;
    }
    // Everything that went into the ladder and bounties comes back out, or is burned.
    assert.equal(paidOut + st.bountyBurned, ENTRY_PRICE * BigInt(n) * 8n / 10n);
    fs.forEach((f, i) => { if (!paid[i]) assert.equal(st.payouts[i].total, 0n); });
    // The best paid entrant takes the top ladder prize.
    const best = fs.filter(f => paid[f.index]).sort((x, y) => x.place - y.place)[0];
    assert.equal(st.payouts[best.index].paidRank, 1);
    assert.equal(st.payouts[best.index].place, st.ladder[0]);
    // A paid entrant's bounty count matches its knockouts of paid entrants.
    for (const f of fs) if (paid[f.index]) {
      const kos = fs.filter(v => paid[v.index] && v.place !== 1 && v.koBy === f.index && v.koCause === "fight" && v.index !== f.index).length;
      assert.equal(st.payouts[f.index].bountiesWon, kos);
      assert.equal(st.payouts[f.index].bounties, BOUNTY * BigInt(kos + (f.place === 1 ? 1 : 0)));
    }
  }
});

test("ledger: refuses overspending and keeps an exact receipt", () => {
  const ledger = createLedger(rf("3"));
  ledger.spend("entry", ENTRY_PRICE);
  ledger.spend("revive", rf("2"));
  assert.throws(() => ledger.spend("shield", rf("1")));
  ledger.win(rf("12"));
  const r = ledger.receipt();
  assert.equal(ledger.balance(), rf("12"));
  assert.equal(r.toPool, rf("0.8"));
  ledger.refund(rf("0.5"));
  assert.equal(ledger.receipt().toPool, rf("0.3"));
  assert.equal(ledger.balance(), rf("12.5"));
  assert.equal(r.burned, rf("1.1"));
  assert.equal(r.rewards, rf("1.1"));
  assert.equal(r.won, rf("12"));
  assert.equal(r.count.entry + r.count.revive, 2);
  assert.equal(RF, 10n ** 18n);
});

test("rounds: the clock gives the same round, line-up and player seat to everyone", () => {
  const now = EPOCH_MS + 5 * ROUND_MS + 10_000;
  const clock = roundAt(now);
  assert.equal(clock.id, 5);
  assert.equal(clock.phase, "lobby");
  assert.equal(roundAt(now + LOBBY_MS).phase, "battle");
  const roster = line(1, 300);
  const a = lineUp(roster, 5), b = lineUp(roster, 5);
  assert.equal(a.length, ROUND_SIZE);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, lineUp(roster, 6));
  const player = { tokenId: 999_999n, family: "Mask" as const, generation: 1, seed: 3 };
  const seated = withPlayer(a, player, 5);
  assert.equal(seated.fighters[seated.index], player);
  assert.equal(withPlayer(a, player, 5).index, seated.index);
  const already = withPlayer(a, a[7], 5);
  assert.equal(already.index, 7);
});
