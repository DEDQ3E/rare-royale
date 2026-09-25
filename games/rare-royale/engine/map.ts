/** The island: generated from the round seed, identical for the engine, the renderer and every viewer.
 * Named places (one per Friend family), buildings for cover, woods and rocks that block sight, loot crates,
 * and the airship's flight line for the drop. */

import { createRng, fmix32, hash32 } from "./rng.ts";
import { FAMILIES, type Family } from "./stats.ts";

export const WORLD = 240;
const MID = WORLD / 2;

export type Poi = Readonly<{ id: string; name: string; family: Family; x: number; y: number; r: number; heat: number }>;
export type Obstacle = Readonly<{ x: number; y: number; r: number; kind: "tree" | "rock" }>;
export type Building = Readonly<{ x: number; y: number; w: number; h: number; poi: string }>;
export type CrateSpot = Readonly<{ x: number; y: number; tier: 1 | 2 | 3; poi: string | null }>;
export type GameMap = Readonly<{
  seed: number;
  pois: readonly Poi[];
  obstacles: readonly Obstacle[];
  buildings: readonly Building[];
  crates: readonly CrateSpot[];
  roads: readonly (readonly [number, number, number, number])[];
  airship: Readonly<{ ax: number; ay: number; bx: number; by: number }>;
  /** Terrain height: land above 0, water below. Also used for shading. */
  height(x: number, y: number): number;
  isLand(x: number, y: number): boolean;
  /** True when a tree or rock blocks the straight line between two points. */
  blocked(ax: number, ay: number, bx: number, by: number): boolean;
  /** Obstacles near a point (for movement). */
  near(x: number, y: number): readonly Obstacle[];
  buildingAt(x: number, y: number): Building | null;
  poiAt(x: number, y: number): Poi | null;
}>;

export const POI_NAMES: Readonly<Record<Family, string>> = {
  Skeleton: "Bone Yard", Mask: "Masquerade", Family: "Family Farm", Cellular: "Cell Labs", Asymmetry: "Crooked Market",
  Hoverer: "Cloud Pier", Colossus: "Titan Steps", Sparkling: "Glitter Springs", Hollow: "Hollow Woods",
};

/** Smooth value noise in [0, 1). */
function noise(seed: number, x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const v = (i: number, j: number) => fmix32(seed ^ Math.imul(i, 0x27D4EB2D) ^ Math.imul(j, 0x165667B1)) / 4294967296;
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1);
  return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf);
}

const cache = new Map<number, GameMap>();

export function generateMap(seed: number): GameMap {
  const hit = cache.get(seed);
  if (hit) return hit;
  const rng = createRng(hash32(seed, "map"));
  const n1 = hash32(seed, "n1"), n2 = hash32(seed, "n2"), n3 = hash32(seed, "woods");
  const height = (x: number, y: number) => {
    const d = Math.hypot(x - MID, y - MID) / 104;
    return 1 - d * d * d + (noise(n1, x / 38, y / 38) - 0.5) * 0.7 + (noise(n2, x / 13, y / 13) - 0.5) * 0.22 - 0.42;
  };
  const isLand = (x: number, y: number) => x > 2 && y > 2 && x < WORLD - 2 && y < WORLD - 2 && height(x, y) > 0;

  // Places: seven families, spread out, well inside the coast.
  const families = rng.shuffle(FAMILIES).slice(0, 7);
  const pois: Poi[] = [];
  for (const family of families) {
    for (let tries = 0; tries < 400; tries++) {
      const a = rng.next() * Math.PI * 2, r = 12 + Math.sqrt(rng.next()) * 70, x = MID + Math.cos(a) * r, y = MID + Math.sin(a) * r;
      if (height(x, y) < 0.18 || pois.some(p => Math.hypot(p.x - x, p.y - y) < 46)) continue;
      pois.push({ id: family.toLowerCase(), name: POI_NAMES[family], family, x, y, r: 13 + rng.int(5), heat: 1 + rng.int(3) });
      break;
    }
  }

  const buildings: Building[] = [];
  const crates: CrateSpot[] = [];
  for (const p of pois) {
    const count = 2 + rng.int(3);
    for (let i = 0; i < count; i++) {
      for (let tries = 0; tries < 60; tries++) {
        const w = 9 + rng.int(8), h = 8 + rng.int(7), x = p.x + rng.range(-p.r, p.r) - w / 2, y = p.y + rng.range(-p.r, p.r) - h / 2;
        const clash = buildings.some(b => x < b.x + b.w + 3 && x + w + 3 > b.x && y < b.y + b.h + 3 && y + h + 3 > b.y);
        if (clash || !isLand(x, y) || !isLand(x + w, y + h) || !isLand(x + w, y) || !isLand(x, y + h)) continue;
        buildings.push({ x, y, w, h, poi: p.id });
        break;
      }
    }
    const loot = 4 + p.heat * 2;
    for (let i = 0; i < loot; i++) {
      const a = rng.next() * Math.PI * 2, r = rng.next() * p.r * 1.1, x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
      if (!isLand(x, y)) continue;
      const roll = rng.next() + p.heat * 0.12;
      crates.push({ x, y, tier: roll > 1.05 ? 3 : roll > 0.6 ? 2 : 1, poi: p.id });
    }
  }
  // Scattered crates in the wild.
  for (let i = 0; i < 26; i++) {
    const x = rng.range(20, WORLD - 20), y = rng.range(20, WORLD - 20);
    if (height(x, y) < 0.1 || pois.some(p => Math.hypot(p.x - x, p.y - y) < p.r + 6)) continue;
    crates.push({ x, y, tier: rng.chance(0.15) ? 2 : 1, poi: null });
  }

  // Woods and rocks, clear of places and buildings.
  const obstacles: Obstacle[] = [];
  const clear = (x: number, y: number, pad: number) =>
    !pois.some(p => Math.hypot(p.x - x, p.y - y) < p.r + pad) && !buildings.some(b => x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad);
  for (let i = 0; i < 1400 && obstacles.length < 170; i++) {
    const x = rng.range(6, WORLD - 6), y = rng.range(6, WORLD - 6);
    if (height(x, y) < 0.06 || !clear(x, y, 3)) continue;
    const woods = noise(n3, x / 22, y / 22);
    if (woods > 0.58 && rng.chance(0.8)) obstacles.push({ x, y, r: 2.2 + rng.next() * 1.2, kind: "tree" });
    else if (rng.chance(0.035)) obstacles.push({ x, y, r: 1.6 + rng.next() * 1.4, kind: "rock" });
    else if (rng.chance(0.03)) obstacles.push({ x, y, r: 2 + rng.next(), kind: "tree" });
  }

  // Roads between neighbouring places (drawn only).
  const roads: [number, number, number, number][] = [];
  for (const p of pois) {
    const nearest = pois.filter(q => q !== p).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)).slice(0, 2);
    for (const q of nearest) if (!roads.some(r => (r[0] === q.x && r[1] === q.y && r[2] === p.x) || (r[0] === p.x && r[2] === q.x))) roads.push([p.x, p.y, q.x, q.y]);
  }

  // The airship crosses the island on a seeded line through the middle.
  const a = rng.next() * Math.PI * 2, off = rng.range(-25, 25);
  const px = -Math.sin(a) * off, py = Math.cos(a) * off;
  const airship = { ax: MID + px - Math.cos(a) * 150, ay: MID + py - Math.sin(a) * 150, bx: MID + px + Math.cos(a) * 150, by: MID + py + Math.sin(a) * 150 };

  // Sight grid for obstacles.
  const CELL = 16, cols = Math.ceil(WORLD / CELL);
  const grid: Obstacle[][] = Array.from({ length: cols * cols }, () => []);
  for (const o of obstacles) {
    for (let gy = Math.max(0, Math.floor((o.y - o.r) / CELL)); gy <= Math.min(cols - 1, Math.floor((o.y + o.r) / CELL)); gy++)
      for (let gx = Math.max(0, Math.floor((o.x - o.r) / CELL)); gx <= Math.min(cols - 1, Math.floor((o.x + o.r) / CELL)); gx++) grid[gy * cols + gx].push(o);
  }
  const cellsAround = (x0: number, y0: number, x1: number, y1: number) => {
    const out = new Set<Obstacle>();
    for (let gy = Math.max(0, Math.floor(Math.min(y0, y1) / CELL)); gy <= Math.min(cols - 1, Math.floor(Math.max(y0, y1) / CELL)); gy++)
      for (let gx = Math.max(0, Math.floor(Math.min(x0, x1) / CELL)); gx <= Math.min(cols - 1, Math.floor(Math.max(x0, x1) / CELL)); gx++)
        for (const o of grid[gy * cols + gx]) out.add(o);
    return out;
  };
  const blocked = (ax: number, ay: number, bx: number, by: number) => {
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1;
    for (const o of cellsAround(ax, ay, bx, by)) {
      const t = Math.max(0, Math.min(1, ((o.x - ax) * dx + (o.y - ay) * dy) / len2));
      const cx = ax + dx * t - o.x, cy = ay + dy * t - o.y;
      // Trees block less than their full canopy: shooting through the edge of a tree is fine.
      if (cx * cx + cy * cy < (o.r * 0.75) ** 2 && t > 0.05 && t < 0.95) return true;
    }
    return false;
  };
  const near = (x: number, y: number) => [...cellsAround(x - 4, y - 4, x + 4, y + 4)];
  const buildingAt = (x: number, y: number) => buildings.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) ?? null;
  const poiAt = (x: number, y: number) => pois.find(p => Math.hypot(p.x - x, p.y - y) <= p.r + 6) ?? null;

  const map: GameMap = { seed, pois, obstacles, buildings, crates, roads, airship, height, isLand, blocked, near, buildingAt, poiAt };
  if (cache.size > 24) cache.clear();
  cache.set(seed, map);
  return map;
}
