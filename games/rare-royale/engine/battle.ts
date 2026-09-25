/** The battle engine: a deterministic battle royale on a generated island, with no DOM. One tick is one second.
 *
 * A round: the airship crosses the island and every Friend drops towards its chosen place; Friends loot crates for
 * weapons, armour and bandages; a phased storm shrinks towards seeded, off-centre circles and forces rotations;
 * fights are ranged, need line of sight and respect cover; knocked-down Friends leave their gear behind.
 *
 * Randomness for tick t comes from the round seed and t alone, so every viewer sees the same base battle.
 * A sponsor item or a player decision only changes what it touches from that tick on.
 * Stats, tactics, loot and sponsor items change the fight; nothing here moves RF (see economy.ts). */

import { createRng, type Rng } from "./rng.ts";
import { signatureOf, statsFor, type FighterIdentity, type SignatureMods, type Stats } from "./stats.ts";
import { generateMap, WORLD, type GameMap } from "./map.ts";
import type { SponsorItemId } from "./economy.ts";

export const TICK_MS = 1000;

export const TUNING = {
  maxTicks: 230,
  airTicks: 16, glideSpeed: 8,
  baseHp: 90, hpPerMight: 1.5, armorCap: 50,
  moveBase: 2.4, movePerSpeed: 0.12,
  sightBase: 26, sightPerWits: 0.8,
  woundedFrac: 0.35,
  mightDmg: 0.035, fightDmgMul: 1.05, hideDmgMul: 1, hideStealth: 0.3, maxStealth: 0.5, lastStandHp: 20, koDmgStep: 0.08, koDmgMaxStacks: 3,
  hitPerStat: 0.012, rangeFalloff: 0.25, coverHit: 0.15, coverDmg: 0.7,
  koHealFrac: 0.25, bandageHp: 20, maxBandages: 4,
  downedTicks: 5, reviveHpFrac: 0.5, reviveInvulnTicks: 3,
  medkitHp: 45, shieldHp: 30,
  sprintMul: 1.5, sprintCost: 6, sprintTicks: 4,
  sponsorWindowMin: 25,
  maxDecisions: 4, decisionGapTicks: 12, decisionWindowTicks: 5, decisionHoldTicks: 10,
  /** Storm circles: radius per phase, wait and shrink seconds, damage per second outside. */
  zoneRadius: [135, 88, 58, 36, 20, 9, 0],
  zoneWait: [34, 16, 14, 12, 10, 8],
  zoneShrink: [16, 14, 12, 10, 10, 10],
  stormDps: [1, 2, 3, 5, 8, 12, 16],
};

export const WEAPONS = {
  fists: { id: "fists", name: "Fists", range: 3.5, rate: 1.6, dmg: 5, acc: 0.8, tier: 0, ranged: false },
  slingshot: { id: "slingshot", name: "Slingshot", range: 20, rate: 1, dmg: 8, acc: 0.72, tier: 1, ranged: true },
  hammer: { id: "hammer", name: "Hammer", range: 4.5, rate: 1, dmg: 16, acc: 0.8, tier: 2, ranged: false },
  bow: { id: "bow", name: "Bow", range: 32, rate: 0.7, dmg: 15, acc: 0.7, tier: 2, ranged: true },
  wand: { id: "wand", name: "Star wand", range: 26, rate: 1.2, dmg: 11, acc: 0.78, tier: 3, ranged: true },
} as const;
export type WeaponId = keyof typeof WEAPONS;

export type Tactic = "fight" | "hide" | "loot";
export const TACTICS: readonly Tactic[] = ["fight", "hide", "loot"];
export type FighterState = "air" | "alive" | "downed" | "out";
export type Mode = "drop" | "loot" | "fight" | "rotate" | "retreat" | "hide" | "roam" | "heal" | "down";
export type LootId = WeaponId | "armor20" | "armor35" | "armor50" | "bandages";
export type DecisionKind = "engage" | "crate" | "storm";
export const DECISION_OPTIONS: Readonly<Record<DecisionKind, readonly [string, string]>> = {
  engage: ["fight", "flee"], crate: ["open", "skip"], storm: ["sprint", "steady"],
};
export type KoCause = "fight" | "storm";

export type FighterInit = FighterIdentity & Readonly<{ tactic?: Tactic; drop?: string }>;

export type Fighter = {
  readonly index: number;
  readonly id: FighterIdentity;
  readonly stats: Stats;
  readonly mods: SignatureMods;
  tactic: Tactic;
  readonly maxHp: number;
  hp: number; armor: number; /** Sponsor shield bubble HP. */ shield: number;
  x: number; y: number; facing: 1 | -1; moved: boolean;
  state: FighterState; mode: Mode;
  readonly dropPoi: string | null; readonly jumpAt: number; readonly landAt: number;
  readonly jx: number; readonly jy: number; readonly tx: number; readonly ty: number;
  weapon: WeaponId; bandages: number; charge: number;
  target: number; lastHitAt: number; seenBy: number[];
  downedAt: number; place: number; kos: number; koBy: number; koCause: "" | KoCause; damage: number;
  revives: number; invulnUntil: number; firstHitTaken: boolean; lastStandUsed: boolean;
  sprintUntil: number; sponsored: number;
};

export type Zone = Readonly<{ cx: number; cy: number; r: number; ncx: number; ncy: number; nr: number; phase: number; shrinking: boolean; nextChangeAt: number }>;
export type DeathCrate = { x: number; y: number; weapon: WeaponId; armor: number; bandages: number; open: boolean };

export type BattleEvent = Readonly<
  | { t: number; kind: "zone"; phase: number; shrinking: boolean; r: number; nr: number }
  | { t: number; kind: "jump"; who: number }
  | { t: number; kind: "land"; who: number; poi: string | null }
  | { t: number; kind: "shot"; from: number; to: number; weapon: WeaponId; at: number; dmg: number; armorDmg: number; blocked: "" | "miss" | "shield" | "feint" | "dazzle" }
  | { t: number; kind: "loot"; who: number; item: LootId }
  | { t: number; kind: "heal"; who: number; hp: number }
  | { t: number; kind: "storm_hit"; who: number; dmg: number }
  | { t: number; kind: "last_stand"; who: number }
  | { t: number; kind: "downed"; who: number; by: number; cause: KoCause; weapon: WeaponId | null }
  | { t: number; kind: "revived"; who: number }
  | { t: number; kind: "out"; who: number; place: number; by: number; cause: KoCause }
  | { t: number; kind: "sponsor"; who: number; item: SponsorItemId; by: string }
  | { t: number; kind: "window_closed"; alive: number }
  | { t: number; kind: "decision"; who: number; decision: DecisionKind; deadline: number }
  | { t: number; kind: "winner"; who: number }
>;

export type SponsorCheck = Readonly<{ ok: true } | { ok: false; reason: string }>;

export type BattleSnapshot = Readonly<{
  t: number; alive: number; standing: number; windowOpen: boolean; over: boolean; winner: number;
  zone: Zone; ship: Readonly<{ x: number; y: number; flying: boolean }>;
  fighters: readonly Readonly<Fighter>[];
  crates: readonly boolean[];
  deathCrates: readonly Readonly<DeathCrate>[];
}>;

export type Battle = Readonly<{
  map: GameMap;
  step(): readonly BattleEvent[];
  run(): readonly BattleEvent[];
  snapshot(): BattleSnapshot;
  fighters(): readonly Readonly<Fighter>[];
  canSponsor(who: number, item: SponsorItemId): SponsorCheck;
  sponsor(who: number, item: SponsorItemId, by: string): SponsorCheck;
  pendingDecision(who: number): Readonly<{ kind: DecisionKind; deadline: number }> | null;
  decide(who: number, option: string): boolean;
  isOver(): boolean;
  places(): readonly number[];
}>;

type Choice = { kind: DecisionKind; offered: number; deadline: number; option: string; until: number };

export type BattleOptions = Readonly<{
  seed: number;
  fighters: readonly FighterInit[];
  /** Fighters whose owner can make decisions (normally the player's Friend). */
  deciders?: readonly number[];
}>;

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
const ARMOR_OF: Readonly<Record<string, number>> = { armor20: 20, armor35: 35, armor50: 50 };

/** The storm schedule for a map: circles and their timing. */
export function zoneSchedule(map: GameMap) {
  const T = TUNING, rng = createRng(map.seed).fork("zone");
  const circles = [{ cx: WORLD / 2, cy: WORLD / 2, r: T.zoneRadius[0] }];
  for (let k = 1; k < T.zoneRadius.length; k++) {
    const prev = circles[k - 1], r = T.zoneRadius[k];
    let cx = prev.cx, cy = prev.cy;
    for (let tries = 0; tries < 80; tries++) {
      const a = rng.next() * Math.PI * 2, d = Math.sqrt(rng.next()) * Math.max(0, prev.r - r) * (k === 1 ? 0.45 : 0.85);
      const x = prev.cx + Math.cos(a) * d, y = prev.cy + Math.sin(a) * d;
      if (map.height(x, y) > 0.12) { cx = x; cy = y; break; }
    }
    circles.push({ cx, cy, r });
  }
  const starts: number[] = [];
  let t = 0;
  for (let k = 0; k < T.zoneWait.length; k++) { starts.push(t); t += T.zoneWait[k] + T.zoneShrink[k]; }
  const zoneAt = (tick: number): Zone => {
    for (let k = 0; k < starts.length; k++) {
      const wait = starts[k] + T.zoneWait[k], end = wait + T.zoneShrink[k];
      if (tick < end) {
        const a = circles[k], b = circles[k + 1];
        if (tick < wait) return { cx: a.cx, cy: a.cy, r: a.r, ncx: b.cx, ncy: b.cy, nr: b.r, phase: k, shrinking: false, nextChangeAt: wait };
        const s = (tick - wait) / T.zoneShrink[k];
        return { cx: a.cx + (b.cx - a.cx) * s, cy: a.cy + (b.cy - a.cy) * s, r: a.r + (b.r - a.r) * s, ncx: b.cx, ncy: b.cy, nr: b.r, phase: k, shrinking: true, nextChangeAt: end };
      }
    }
    const last = circles[circles.length - 1];
    return { cx: last.cx, cy: last.cy, r: 0, ncx: last.cx, ncy: last.cy, nr: 0, phase: circles.length - 1, shrinking: false, nextChangeAt: Number.MAX_SAFE_INTEGER };
  };
  return { circles, zoneAt };
}

/** Where each Friend of a line-up will land (for the lobby's drop map). Same result as the battle's own setup. */
export function plannedDrops(seed: number, fighters: readonly FighterInit[]) {
  return createBattle({ seed, fighters }).fighters().map(f => ({ index: f.index, poi: f.dropPoi, x: f.tx, y: f.ty }));
}

export function createBattle(options: BattleOptions): Battle {
  const T = TUNING;
  const map = generateMap(options.seed);
  const { zoneAt } = zoneSchedule(map);
  const root = createRng(options.seed);
  const setup = root.fork("setup");
  const events: BattleEvent[] = [];
  let t = 0, over = false, winner = -1, windowOpen = true, lastPhaseKey = "";
  const ship = map.airship;
  const shipAt = (tick: number) => { const s = Math.min(1, Math.max(0, tick / T.airTicks)); return { x: ship.ax + (ship.bx - ship.ax) * s, y: ship.ay + (ship.by - ship.ay) * s }; };

  const landPoint = (x: number, y: number, spread: number, rng: Rng) => {
    for (let i = 0; i < 40; i++) {
      const a = rng.next() * Math.PI * 2, r = rng.next() * spread, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (map.isLand(px, py) && !map.near(px, py).some(o => dist(o.x, o.y, px, py) < o.r)) return { x: px, y: py };
    }
    return { x: WORLD / 2, y: WORLD / 2 };
  };
  const pickPoi = (tactic: Tactic, rng: Rng) => {
    const weights = map.pois.map(p => (tactic === "fight" ? p.heat * p.heat + 1 : tactic === "loot" ? map.crates.filter(c => c.poi === p.id).length : 4 - p.heat));
    let roll = rng.next() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < weights.length; i++) { roll -= weights[i]; if (roll <= 0) return map.pois[i]; }
    return map.pois[map.pois.length - 1];
  };

  const fighters: Fighter[] = options.fighters.map((init, index) => {
    const rng = setup.fork(`fighter:${index}`);
    const stats = statsFor(init), mods = signatureOf(init.family).mods;
    const tactic = init.tactic ?? rng.pick(TACTICS);
    const chosen = init.drop ? map.pois.find(p => p.id === init.drop) ?? null : null;
    const poi = chosen ?? (tactic === "hide" && rng.chance(0.6) ? null : pickPoi(tactic, rng));
    const target = poi ? landPoint(poi.x, poi.y, poi.r * 0.9, rng) : landPoint(WORLD / 2 + rng.range(-70, 70), WORLD / 2 + rng.range(-70, 70), 20, rng);
    let jumpAt = 1, best = Infinity;
    for (let k = 1; k < T.airTicks; k++) { const s = shipAt(k), d = dist(s.x, s.y, target.x, target.y); if (d < best) { best = d; jumpAt = k; } }
    jumpAt += rng.int(2);
    const j = shipAt(jumpAt), glide = T.glideSpeed * (mods.glideMul ?? 1);
    const landAt = jumpAt + Math.max(2, Math.ceil(dist(j.x, j.y, target.x, target.y) / glide));
    const maxHp = Math.round(T.baseHp + stats.might * T.hpPerMight + (mods.hpBonus ?? 0));
    return {
      index, id: init, stats, mods, tactic, maxHp, hp: maxHp, armor: 0, shield: 0,
      x: j.x, y: j.y, facing: 1, moved: false, state: "air", mode: "drop",
      dropPoi: poi?.id ?? null, jumpAt, landAt, jx: j.x, jy: j.y, tx: target.x, ty: target.y,
      weapon: "fists", bandages: 0, charge: 0, target: -1, lastHitAt: -99, seenBy: [],
      downedAt: -1, place: 0, kos: 0, koBy: -1, koCause: "", damage: 0,
      revives: 0, invulnUntil: -1, firstHitTaken: false, lastStandUsed: false, sprintUntil: -1, sponsored: 0,
    };
  });
  const crateOpen = map.crates.map(() => false);
  const deathCrates: DeathCrate[] = [];
  const deciders = new Set(options.deciders ?? []);
  const choices = new Map<number, Choice[]>();

  let tickEvents: BattleEvent[] = [];
  const emit = (e: BattleEvent) => { events.push(e); tickEvents.push(e); };
  const standing = () => fighters.filter(f => f.state !== "out").length;
  const landed = (f: Fighter) => f.state === "alive";

  function choiceFor(f: Fighter, kind: DecisionKind): string | null {
    const list = choices.get(f.index);
    if (!list) return null;
    for (let i = list.length - 1; i >= 0; i--) { const c = list[i]; if (c.kind === kind && t >= c.offered && t <= c.until && c.option) return c.option; }
    return null;
  }
  function offerDecision(f: Fighter, kind: DecisionKind) {
    if (!deciders.has(f.index)) return;
    const list = choices.get(f.index) ?? [];
    const last = list[list.length - 1];
    if (list.length >= T.maxDecisions || (last && t - last.offered < T.decisionGapTicks)) return;
    const deadline = t + T.decisionWindowTicks;
    list.push({ kind, offered: t, deadline, option: "", until: t + T.decisionHoldTicks });
    choices.set(f.index, list);
    emit({ t, kind: "decision", who: f.index, decision: kind, deadline });
  }

  const sightOf = (f: Fighter, o: Fighter) => (T.sightBase + f.stats.wits * T.sightPerWits) * (1 - Math.min(T.maxStealth, (o.mods.stealth ?? 0) + (o.tactic === "hide" ? T.hideStealth : 0)));
  function threats(f: Fighter) {
    const out: { o: Fighter; d: number }[] = [];
    for (const o of fighters) {
      if (o === f || !landed(o)) continue;
      const d = dist(f.x, f.y, o.x, o.y);
      if (d <= sightOf(f, o) && !map.blocked(f.x, f.y, o.x, o.y)) out.push({ o, d });
    }
    return out.sort((a, b) => a.d - b.d);
  }
  const speedOf = (f: Fighter) => (T.moveBase + f.stats.speed * T.movePerSpeed) * (f.mods.moveMul ?? 1) * (t < f.sprintUntil ? T.sprintMul : 1);

  function stepTo(f: Fighter, tx: number, ty: number, amount: number) {
    const d = dist(f.x, f.y, tx, ty);
    if (d < 0.05 || amount <= 0) return;
    const step = Math.min(amount, d), ang = Math.atan2(ty - f.y, tx - f.x);
    for (const off of [0, 0.5, -0.5, 1, -1, 1.7, -1.7]) {
      const nx = f.x + Math.cos(ang + off) * step, ny = f.y + Math.sin(ang + off) * step;
      if (!map.isLand(nx, ny) || map.near(nx, ny).some(o => dist(o.x, o.y, nx, ny) < o.r * 0.8)) continue;
      if (Math.abs(nx - f.x) > 0.05) f.facing = nx > f.x ? 1 : -1;
      f.x = nx; f.y = ny; f.moved = true;
      return;
    }
  }

  function hurt(f: Fighter, raw: number, source: number, cause: KoCause, weapon: WeaponId | null): { hp: number; armor: number } {
    if (f.state !== "alive" || t < f.invulnUntil) return { hp: 0, armor: 0 };
    let dmg = raw;
    if (cause === "fight" && !f.firstHitTaken) { f.firstHitTaken = true; if (f.mods.firstHitMul !== undefined) dmg *= f.mods.firstHitMul; }
    dmg = Math.round(dmg);
    if (dmg <= 0) return { hp: 0, armor: 0 };
    let armorDmg = 0;
    // Armour absorbs attacks first; the storm ignores it.
    if (cause === "fight" && f.armor > 0) { armorDmg = Math.min(f.armor, dmg); f.armor -= armorDmg; dmg -= armorDmg; }
    f.hp -= dmg;
    if (source >= 0) fighters[source].damage += dmg + armorDmg;
    if (f.hp <= 0) {
      if (f.mods.lastStand && !f.lastStandUsed) { f.lastStandUsed = true; f.hp = T.lastStandHp; emit({ t, kind: "last_stand", who: f.index }); }
      else knockDown(f, source, cause, weapon);
    }
    return { hp: dmg, armor: armorDmg };
  }
  function knockDown(f: Fighter, source: number, cause: KoCause, weapon: WeaponId | null) {
    f.hp = 0; f.state = "downed"; f.mode = "down"; f.downedAt = t; f.koBy = source; f.koCause = cause; f.target = -1;
    deathCrates.push({ x: f.x, y: f.y, weapon: f.weapon, armor: f.armor, bandages: f.bandages, open: false });
    f.armor = 0; f.bandages = 0; f.shield = 0;
    if (source >= 0) {
      const s = fighters[source];
      s.kos += 1;
      if (s.state === "alive") s.hp = Math.min(s.maxHp, s.hp + Math.round(s.maxHp * T.koHealFrac));
    }
    emit({ t, kind: "downed", who: f.index, by: source, cause, weapon });
  }
  function eliminate(f: Fighter) {
    f.place = standing(); f.state = "out";
    emit({ t, kind: "out", who: f.index, place: f.place, by: f.koBy, cause: f.koCause || "fight" });
  }

  function shoot(a: Fighter, d: Fighter, at: number, rng: Rng) {
    const w = WEAPONS[a.weapon], range = dist(a.x, a.y, d.x, d.y), cover = w.ranged && !!map.buildingAt(d.x, d.y);
    d.lastHitAt = t;
    let blocked: "" | "miss" | "shield" | "feint" | "dazzle" = "";
    const firstFromHim = !d.seenBy.includes(a.index);
    if (firstFromHim) d.seenBy.push(a.index);
    let hit = w.acc - (range / w.range) * T.rangeFalloff + (a.stats.wits - d.stats.speed) * T.hitPerStat - (cover ? T.coverHit : 0) - (d.moved ? d.mods.movingDodge ?? 0 : 0);
    hit = Math.max(0.08, Math.min(0.95, hit));
    if (firstFromHim && d.mods.dazzle && rng.chance(d.mods.dazzle)) blocked = "dazzle";
    else if (!rng.chance(hit)) blocked = "miss";
    else if (d.mods.feint && rng.chance(d.mods.feint)) blocked = "feint";
    if (blocked) { emit({ t, kind: "shot", from: a.index, to: d.index, weapon: a.weapon, at, dmg: 0, armorDmg: 0, blocked }); return; }
    let dmg = w.dmg * (1 + (a.stats.might - 10) * T.mightDmg) * rng.range(0.85, 1.15) * (1 + Math.min(T.koDmgMaxStacks, a.kos) * T.koDmgStep);
    if (a.tactic === "fight") dmg *= T.fightDmgMul; else if (a.tactic === "hide") dmg *= T.hideDmgMul;
    if (d.mods.dmgTakenMul) dmg *= d.mods.dmgTakenMul;
    if (cover) dmg *= T.coverDmg;
    if (d.shield > 0) {
      // A sponsor's shield bubble soaks damage before armour and HP.
      const soak = Math.min(d.shield, Math.round(dmg));
      d.shield -= soak; dmg -= soak;
      if (dmg < 0.5) { emit({ t, kind: "shot", from: a.index, to: d.index, weapon: a.weapon, at, dmg: 0, armorDmg: 0, blocked: "shield" }); return; }
    }
    const taken = hurt(d, dmg, a.index, "fight", a.weapon);
    emit({ t, kind: "shot", from: a.index, to: d.index, weapon: a.weapon, at, dmg: taken.hp, armorDmg: taken.armor, blocked: "" });
  }

  function loot(f: Fighter, item: LootId) {
    if (item === "bandages") f.bandages = Math.min(T.maxBandages, f.bandages + 2);
    else if (item in ARMOR_OF) f.armor = Math.max(f.armor, ARMOR_OF[item]);
    else if (WEAPONS[item as WeaponId].tier > WEAPONS[f.weapon].tier) f.weapon = item as WeaponId;
    emit({ t, kind: "loot", who: f.index, item });
  }
  function openCrate(f: Fighter, i: number, rng: Rng) {
    crateOpen[i] = true;
    const tier = Math.min(3, map.crates[i].tier + (rng.chance(f.stats.wits * 0.012) ? 1 : 0));
    const table: readonly (readonly [LootId, number])[] = tier === 1
      ? [["slingshot", 35], ["armor20", 30], ["bandages", 35]]
      : tier === 2 ? [["bow", 25], ["hammer", 20], ["armor35", 30], ["bandages", 25]] : [["wand", 35], ["armor50", 35], ["bow", 15], ["bandages", 15]];
    let roll = rng.next() * 100;
    for (const [item, w] of table) { roll -= w; if (roll <= 0) { loot(f, item); return; } }
  }
  function openDeathCrate(f: Fighter, c: DeathCrate) {
    c.open = true;
    if (WEAPONS[c.weapon].tier > WEAPONS[f.weapon].tier) loot(f, c.weapon);
    if (c.armor > f.armor) { f.armor = c.armor; emit({ t, kind: "loot", who: f.index, item: c.armor >= 50 ? "armor50" : c.armor >= 35 ? "armor35" : "armor20" }); }
    if (c.bandages) { f.bandages = Math.min(T.maxBandages, f.bandages + c.bandages); emit({ t, kind: "loot", who: f.index, item: "bandages" }); }
  }
  const geared = (f: Fighter) => WEAPONS[f.weapon].tier >= 2 && f.armor >= 35;

  /** Chooses what a Friend does this second and moves it. */
  function think(f: Fighter, zone: Zone, rng: Rng) {
    f.moved = false;
    const seen = threats(f), nearest = seen[0];
    const w = WEAPONS[f.weapon], wounded = f.hp < f.maxHp * T.woundedFrac;
    const attacked = t - f.lastHitAt <= 3;
    const engage = choiceFor(f, "engage");
    let target: Fighter | null = null;
    // Unarmed and not under fire: grab the nearest crate first, like any sensible Friend after landing.
    const grab = w.tier === 0 && !attacked && engage !== "fight" ? map.crates.findIndex((c, i) => !crateOpen[i] && dist(f.x, f.y, c.x, c.y) < 12) : -1;
    if (grab >= 0) {
      f.target = -1; f.mode = "loot";
      const c = map.crates[grab];
      if (dist(f.x, f.y, c.x, c.y) <= 2.2) openCrate(f, grab, rng); else stepTo(f, c.x, c.y, speedOf(f));
      return;
    }
    if (engage === "fight") target = nearest?.o ?? null;
    else if (engage !== "flee" && nearest) {
      const attacker = attacked ? seen.find(s => s.o.target === f.index)?.o ?? null : null;
      if (f.tactic === "fight") target = !wounded && (w.ranged || nearest.d < 14) ? nearest.o : attacker;
      else if (f.tactic === "loot") target = attacker ?? (nearest.d < w.range * 0.8 ? nearest.o : null);
      else target = attacker ?? (nearest.d < 6 ? nearest.o : null);
      if (wounded && target && nearest.d > 5) target = null;
    }
    f.target = target ? target.index : -1;

    const step = speedOf(f);
    const inZone = dist(f.x, f.y, zone.cx, zone.cy) < zone.r - 1;
    const toNext = dist(f.x, f.y, zone.ncx, zone.ncy) - zone.nr * 0.7;
    const timeLeft = zone.nextChangeAt - t;
    const mustRotate = !inZone || (toNext > 0 && toNext / step > timeLeft - 4);
    if (!inZone && zone.r > 0) offerDecision(f, "storm");

    if (mustRotate && !(target && inZone)) {
      f.mode = "rotate";
      const a = Math.atan2(f.y - zone.ncy, f.x - zone.ncx), r = zone.nr * 0.55;
      stepTo(f, zone.ncx + Math.cos(a) * r, zone.ncy + Math.sin(a) * r, step);
      return;
    }
    if (target) {
      f.mode = "fight";
      if (!engage) offerDecision(f, "engage");
      const d = dist(f.x, f.y, target.x, target.y);
      if (!w.ranged) stepTo(f, target.x, target.y, Math.min(step, Math.max(0, d - 2.2)));
      else if (d > w.range * 0.85) stepTo(f, target.x, target.y, Math.min(step, d - w.range * 0.7));
      else if (d < w.range * 0.4) { const a = Math.atan2(f.y - target.y, f.x - target.x); stepTo(f, f.x + Math.cos(a) * 4, f.y + Math.sin(a) * 4, step * 0.7); }
      else { const a = Math.atan2(target.y - f.y, target.x - f.x) + (rng.chance(0.5) ? 1.4 : -1.4); stepTo(f, f.x + Math.cos(a) * 3, f.y + Math.sin(a) * 3, step * 0.5); }
      return;
    }
    if (nearest && (wounded || engage === "flee" || (f.tactic === "hide" && nearest.d < 18))) {
      f.mode = "retreat";
      if (!engage && !wounded) offerDecision(f, "engage");
      const a = Math.atan2(f.y - nearest.o.y, f.x - nearest.o.x), b = Math.atan2(zone.ncy - f.y, zone.ncx - f.x);
      const ang = Math.atan2(Math.sin(a) * 2 + Math.sin(b), Math.cos(a) * 2 + Math.cos(b));
      stepTo(f, f.x + Math.cos(ang) * step, f.y + Math.sin(ang) * step, step);
      return;
    }
    if (f.hp < f.maxHp * 0.7 && f.bandages > 0 && !attacked) {
      f.mode = "heal"; f.bandages -= 1;
      const before = f.hp; f.hp = Math.min(f.maxHp, f.hp + T.bandageHp);
      emit({ t, kind: "heal", who: f.index, hp: f.hp - before });
      return;
    }
    // Loot: crates and fallen Friends' gear, inside the coming circle.
    const crateChoice = choiceFor(f, "crate");
    const wantLoot = crateChoice !== "skip" && (!geared(f) || f.tactic === "loot" || crateChoice === "open");
    if (wantLoot) {
      let best = -1, bestScore = Infinity, bestDeath: DeathCrate | null = null;
      const reach = f.tactic === "loot" ? 55 : 40;
      map.crates.forEach((c, i) => {
        if (crateOpen[i]) return;
        const d = dist(f.x, f.y, c.x, c.y);
        if (d > reach || dist(c.x, c.y, zone.ncx, zone.ncy) > zone.nr + 8) return;
        const score = d - c.tier * 6;
        if (score < bestScore) { bestScore = score; best = i; bestDeath = null; }
      });
      for (const c of deathCrates) {
        if (c.open) continue;
        const d = dist(f.x, f.y, c.x, c.y);
        if (d > reach) continue;
        const score = d - 12;
        if (score < bestScore) { bestScore = score; bestDeath = c; best = -1; }
      }
      const goal: { x: number; y: number } | null = bestDeath ?? (best >= 0 ? map.crates[best] : null);
      if (goal) {
        f.mode = "loot";
        if (best >= 0 && dist(f.x, f.y, goal.x, goal.y) < 14) offerDecision(f, "crate");
        if (dist(f.x, f.y, goal.x, goal.y) <= 2.2) { if (bestDeath) openDeathCrate(f, bestDeath); else openCrate(f, best, rng); }
        else stepTo(f, goal.x, goal.y, step);
        return;
      }
    }
    if (f.tactic === "hide") {
      f.mode = "hide";
      let home: { cx: number; cy: number } | null = null, bd = 45;
      for (const b of map.buildings) {
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2, d = dist(f.x, f.y, cx, cy);
        if (d < bd && dist(cx, cy, zone.ncx, zone.ncy) < zone.nr) { bd = d; home = { cx, cy }; }
      }
      if (home) stepTo(f, home.cx, home.cy, step * 0.8);
      return;
    }
    f.mode = "roam";
    const a = rng.next() * Math.PI * 2, r = zone.nr * 0.5;
    stepTo(f, zone.ncx + Math.cos(a) * r, zone.ncy + Math.sin(a) * r, step * 0.7);
  }

  function step(): readonly BattleEvent[] {
    if (over) return [];
    tickEvents = [];
    const rng = root.fork(`tick:${t}`);
    const zone = zoneAt(t);
    const key = `${zone.phase}:${zone.shrinking}`;
    if (key !== lastPhaseKey) { lastPhaseKey = key; emit({ t, kind: "zone", phase: zone.phase, shrinking: zone.shrinking, r: zone.r, nr: zone.nr }); }

    // 1. The drop.
    for (const f of fighters) {
      if (f.state !== "air") continue;
      if (t < f.jumpAt) { const s = shipAt(t); f.x = s.x; f.y = s.y; continue; }
      if (t === f.jumpAt) emit({ t, kind: "jump", who: f.index });
      const k = Math.min(1, (t - f.jumpAt) / Math.max(1, f.landAt - f.jumpAt));
      f.x = f.jx + (f.tx - f.jx) * k; f.y = f.jy + (f.ty - f.jy) * k;
      f.facing = f.tx >= f.jx ? 1 : -1;
      if (t >= f.landAt) { f.state = "alive"; f.mode = "loot"; emit({ t, kind: "land", who: f.index, poi: f.dropPoi }); }
    }

    // 2. Downed Friends who were not revived in time are out.
    for (const f of rng.fork("downed").shuffle(fighters.filter(f => f.state === "downed" && t - f.downedAt >= T.downedTicks))) {
      if (standing() <= 1) break;
      eliminate(f);
    }

    // 3. Plans and movement.
    const mv = rng.fork("move");
    for (const f of mv.shuffle(fighters.filter(landed))) think(f, zone, mv);

    // 4. Attacks.
    const at = rng.fork("attack");
    for (const f of at.shuffle(fighters.filter(landed))) {
      if (f.state !== "alive" || f.target < 0) { f.charge = Math.min(f.charge, 1); continue; }
      const d = fighters[f.target], w = WEAPONS[f.weapon];
      if (d.state !== "alive") { f.target = -1; continue; }
      const range = dist(f.x, f.y, d.x, d.y);
      if (range > w.range || (w.ranged && map.blocked(f.x, f.y, d.x, d.y))) { f.charge = Math.min(f.charge, 1); continue; }
      f.facing = d.x >= f.x ? 1 : -1;
      f.charge += w.rate;
      const shots = Math.floor(f.charge);
      for (let s = 0; s < shots && d.state === "alive" && f.state === "alive"; s++) { f.charge -= 1; shoot(f, d, (s + at.next() * 0.6) / Math.max(1, shots), at); }
    }

    // 5. Storm, regeneration.
    const dps = T.stormDps[Math.min(T.stormDps.length - 1, zone.phase + (zone.shrinking ? 1 : 0))];
    for (const f of fighters) {
      if (f.state !== "alive") continue;
      if (dist(f.x, f.y, zone.cx, zone.cy) > zone.r) {
        const taken = hurt(f, dps * (f.mods.stormMul ?? 1), -1, "storm", null);
        if (taken.hp) emit({ t, kind: "storm_hit", who: f.index, dmg: taken.hp });
      } else if (f.mods.regen && t - f.lastHitAt > 3) f.hp = Math.min(f.maxHp, f.hp + f.mods.regen);
    }

    // 6. The sponsor window and the end.
    if (windowOpen && standing() <= T.sponsorWindowMin) { windowOpen = false; emit({ t, kind: "window_closed", alive: standing() }); }
    const left = fighters.filter(f => f.state !== "out"), up = left.filter(f => f.state === "alive" || f.state === "air");
    if (left.length <= 1 || (up.length === 0 && left.every(f => t - f.downedAt >= T.downedTicks)) || t >= T.maxTicks) finish();
    else if (up.length === 1 && !windowOpen) {
      for (const f of rng.fork("final").shuffle(left.filter(f => f.state === "downed"))) if (standing() > 1) eliminate(f);
      finish();
    }
    t += 1;
    return tickEvents;
  }

  function finish() {
    const tie = root.fork("finish");
    const ranked = fighters.filter(f => f.state !== "out").map(f => ({ f, k: (f.state === "alive" ? 1e6 : 0) + f.hp * 100 + tie.next() })).sort((a, b) => a.k - b.k);
    for (const { f } of ranked) if (standing() > 1) eliminate(f);
    const last = fighters.find(f => f.state !== "out");
    if (last) { last.place = 1; winner = last.index; emit({ t, kind: "winner", who: last.index }); }
    over = true;
  }

  function canSponsor(who: number, item: SponsorItemId): SponsorCheck {
    const f = fighters[who];
    if (!f) return { ok: false, reason: "No such fighter." };
    if (over) return { ok: false, reason: "The round is over." };
    if (!windowOpen) return { ok: false, reason: `Sponsoring closed: the final ${T.sponsorWindowMin} are on their own.` };
    if (f.state === "air") return { ok: false, reason: "Still in the air. Wait for the landing." };
    if (item === "revive") {
      if (f.state !== "downed") return { ok: false, reason: "Only a downed Friend can get a second life." };
      if (f.revives >= 3) return { ok: false, reason: "Three second lives per round at most." };
      return { ok: true };
    }
    if (f.state !== "alive") return { ok: false, reason: "This Friend is not standing." };
    if (item === "shield" && f.shield > 0) return { ok: false, reason: "Already shielded." };
    if (item === "medkit" && f.hp >= f.maxHp) return { ok: false, reason: "Already at full HP." };
    return { ok: true };
  }

  function sponsor(who: number, item: SponsorItemId, by: string): SponsorCheck {
    const check = canSponsor(who, item);
    if (!check.ok) return check;
    const f = fighters[who];
    f.sponsored += 1;
    if (item === "shield") f.shield = T.shieldHp;
    else if (item === "medkit") f.hp = Math.min(f.maxHp, f.hp + T.medkitHp);
    else {
      f.revives += 1; f.state = "alive"; f.mode = "retreat"; f.hp = Math.round(f.maxHp * T.reviveHpFrac); f.downedAt = -1;
      f.invulnUntil = t + T.reviveInvulnTicks;
      emit({ t, kind: "revived", who });
    }
    emit({ t, kind: "sponsor", who, item, by });
    return { ok: true };
  }

  return {
    map,
    step,
    run() { while (!over) step(); return events; },
    snapshot: () => {
      const s = shipAt(t);
      return {
        t, alive: fighters.filter(landed).length, standing: standing(), windowOpen, over, winner, zone: zoneAt(t),
        ship: { x: s.x, y: s.y, flying: t <= T.airTicks + 2 },
        fighters: fighters.map(f => ({ ...f, seenBy: [] })), crates: [...crateOpen], deathCrates: deathCrates.map(c => ({ ...c })),
      };
    },
    fighters: () => fighters,
    canSponsor,
    sponsor,
    pendingDecision(who) {
      const c = choices.get(who)?.at(-1);
      return c && !c.option && t <= c.deadline && fighters[who]?.state === "alive" ? { kind: c.kind, deadline: c.deadline } : null;
    },
    decide(who, option) {
      const c = choices.get(who)?.at(-1);
      if (!c || c.option || t > c.deadline || !DECISION_OPTIONS[c.kind].includes(option)) return false;
      c.option = option;
      const f = fighters[who];
      if (c.kind === "storm" && option === "sprint" && f.state === "alive") { f.sprintUntil = t + T.sprintTicks; f.hp = Math.max(1, f.hp - T.sprintCost); }
      return true;
    },
    isOver: () => over,
    places: () => fighters.map(f => f.place),
  };
}
