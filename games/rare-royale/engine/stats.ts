/** Fighter stats from the NFT itself. Family sets the profile and a signature ability, Generation adds a small,
 * capped number of points, and the sprite seed shifts two points between stats so no two Friends are identical.
 * Every value here is tuned by scripts/balance.ts against the fairness targets in DESIGN.md. */

export const FAMILIES = ["Skeleton", "Mask", "Family", "Cellular", "Asymmetry", "Hoverer", "Colossus", "Sparkling", "Hollow"] as const;
export type Family = typeof FAMILIES[number];

export type Stats = Readonly<{ might: number; speed: number; wits: number }>;
export type StatKey = keyof Stats;
export const STAT_KEYS: readonly StatKey[] = ["might", "speed", "wits"];
export const STAT_LABEL: Readonly<Record<StatKey, string>> = { might: "Might", speed: "Speed", wits: "Wits" };

/** Mechanical effects of a family's signature ability. Absent fields mean no effect. */
export type SignatureMods = Readonly<{
  /** Multiplier on the first damage the fighter takes each round. */
  firstHitMul?: number;
  /** Multiplier on all damage taken from attacks. */
  dmgTakenMul?: number;
  /** Chance to dodge any attack. */
  feint?: number;
  /** HP regained per second while out of combat. */
  regen?: number;
  /** Once per round, a lethal hit leaves the fighter standing with a little HP instead. */
  lastStand?: boolean;
  /** Extra maximum HP. */
  hpBonus?: number;
  /** Multiplier on movement. */
  moveMul?: number;
  /** Chance that each new attacker's first shot misses. */
  dazzle?: number;
  /** Multiplier on storm damage. */
  stormMul?: number;
  /** Extra chance to dodge while on the move. */
  movingDodge?: number;
  /** Share by which enemies' sight range is cut when looking for this fighter. */
  stealth?: number;
  /** Multiplier on glide speed during the drop. */
  glideMul?: number;
}>;

export type Signature = Readonly<{ id: string; name: string; text: string; mods: SignatureMods }>;

export type FamilyProfile = Readonly<{ family: Family; style: string; base: Stats; signature: Signature }>;

/** Profiles total 30 points; the lean mirrors each family's temperament in Friend Nook. */
export const PROFILES: Readonly<Record<Family, FamilyProfile>> = {
  Skeleton: { family: "Skeleton", style: "Night Owl", base: { might: 12, speed: 9, wits: 9 },
    signature: { id: "bone-armor", name: "Bone armor", text: "Shrugs off the first hit of the round and takes 10% less damage.", mods: { firstHitMul: 0, dmgTakenMul: 0.9 } } },
  Mask: { family: "Mask", style: "Performer", base: { might: 8, speed: 10, wits: 12 },
    signature: { id: "showstopper", name: "Showstopper", text: "Sidesteps 15% of attacks with a flourish.", mods: { feint: 0.15 } } },
  Family: { family: "Family", style: "Homebody", base: { might: 10, speed: 10, wits: 10 },
    signature: { id: "home-team", name: "Home team", text: "Recovers 1 HP a second when out of combat.", mods: { regen: 1 } } },
  Cellular: { family: "Cellular", style: "Foodie", base: { might: 11, speed: 8, wits: 11 },
    signature: { id: "split", name: "Split", text: "Once per round, a knockout blow splits it in two and leaves it at 20 HP.", mods: { lastStand: true } } },
  Asymmetry: { family: "Asymmetry", style: "Chaos Gremlin", base: { might: 9, speed: 13, wits: 8 },
    signature: { id: "zigzag", name: "Zigzag", text: "Hard to hit on the move: 8% extra dodge while running.", mods: { movingDodge: 0.08 } } },
  Hoverer: { family: "Hoverer", style: "Dreamer", base: { might: 8, speed: 12, wits: 10 },
    signature: { id: "float", name: "Float", text: "Glides further on the drop and takes 40% of storm damage.", mods: { stormMul: 0.4, glideMul: 1.4 } } },
  Colossus: { family: "Colossus", style: "Gentle Giant", base: { might: 14, speed: 6, wits: 10 },
    signature: { id: "heavy", name: "Heavy", text: "20 extra HP, but slower on its feet.", mods: { hpBonus: 20, moveMul: 0.85 } } },
  Sparkling: { family: "Sparkling", style: "Style Icon", base: { might: 9, speed: 10, wits: 11 },
    signature: { id: "dazzle", name: "Dazzle", text: "Every new attacker's first shot misses half the time, and it sidesteps 6% of attacks.", mods: { dazzle: 0.5, feint: 0.06 } } },
  Hollow: { family: "Hollow", style: "Introvert", base: { might: 9, speed: 10, wits: 11 },
    signature: { id: "shadow", name: "Shadow", text: "Hard to spot: enemies see it from 20% closer.", mods: { stealth: 0.2 } } },
};

/** Extra stat points by Generation (Gen 1 is the rarest and costs the most RF to hardwire). Kept small on purpose:
 * the fairness target caps the strongest Friend's top-3 rate at 1.2x the average. */
export const GEN_POINTS: Readonly<Record<number, number>> = { 1: 2, 2: 2, 3: 1, 4: 1, 5: 0, 6: 0 };
export const genPoints = (generation: number) => GEN_POINTS[generation] ?? 0;

export type FighterIdentity = Readonly<{ tokenId: bigint; family: Family; generation: number; seed: number }>;

/** Seed shift: two points move from one stat to another (or none), so siblings of one family still differ. */
const SHIFTS: readonly (readonly [StatKey, StatKey] | null)[] = [
  null, ["might", "speed"], ["might", "wits"], ["speed", "might"], ["speed", "wits"], ["wits", "might"], ["wits", "speed"], null, null,
];

export function statsFor(id: FighterIdentity): Stats {
  const profile = PROFILES[id.family];
  const s = { ...profile.base };
  // Generation points go to the family's strongest stats first, one at a time.
  const order = [...STAT_KEYS].sort((a, b) => profile.base[b] - profile.base[a]);
  for (let i = 0; i < genPoints(id.generation); i++) s[order[i % 3]] += 1;
  const shift = SHIFTS[(id.seed >>> 0) % SHIFTS.length];
  if (shift && s[shift[0]] - 2 >= 5) { s[shift[0]] -= 2; s[shift[1]] += 2; }
  return s;
}

export const signatureOf = (family: Family) => PROFILES[family].signature;
