/** Island artwork, rendered once per round from the generated map: shaded terrain, shallows and surf, beaches,
 * dirt roads, stone plazas, buildings with floors and furniture, woods and rocks. Used by the battle camera,
 * the minimap and the lobby's drop map. */

import { createRng, fmix32, hash32, type GameMap } from "./engine/index.ts";
import { WORLD } from "./engine/map.ts";
import { FAMILY_COLOR } from "./roster.ts";

/** Pixels per world unit in the full-size artwork. */
export const TERRAIN_PX = 4;

export type Terrain = Readonly<{ frames: readonly HTMLCanvasElement[]; mini: HTMLCanvasElement }>;

const cache = new Map<number, Terrain>();

type RGB = [number, number, number];
const h3 = (a: number, b: number, c: number) => fmix32(Math.imul(a, 0x27D4EB2D) ^ Math.imul(b, 0x165667B1) ^ c);
const mix = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

function paintGround(map: GameMap, shimmer: number): HTMLCanvasElement {
  const S = TERRAIN_PX, W = WORLD * S, B = 2; // shading is computed per 2 × 2 pixel block for a chunky look
  const c = document.createElement("canvas"); c.width = W; c.height = W;
  const g = c.getContext("2d")!, img = g.createImageData(W, W), d = img.data;
  const deep: RGB = [38, 94, 140], shallow: RGB = [74, 146, 196], foam: RGB = [214, 236, 246], sand: RGB = [236, 214, 160], sandDark: RGB = [214, 188, 132];
  const grass: RGB = [124, 178, 88], grassDark: RGB = [100, 152, 72], grassLight: RGB = [146, 196, 104], hill: RGB = [96, 140, 70];
  for (let by = 0; by < W; by += B) for (let bx = 0; bx < W; bx += B) {
    const x = bx / S, y = by / S, h = map.height(x, y);
    const n = h3(bx >> 2, by >> 2, map.seed) % 97;
    let col: RGB;
    if (h < -0.07) {
      col = mix(deep, shallow, Math.max(0, (h + 0.35) / 0.28));
      if ((h3(bx >> 3, (by >> 1) + shimmer, map.seed) % 53) === 0) col = mix(col, foam, 0.5);
    } else if (h < 0) col = mix(shallow, foam, Math.max(0, (h + 0.07) / 0.07) ** 3 * 0.9);
    else if (h < 0.05) col = n < 12 ? sandDark : sand;
    else {
      // Light from the top-left: compare with the height a little further along.
      const slope = (map.height(x - 1.2, y - 1.2) - h) * 6;
      col = h > 0.55 ? hill : n < 9 ? grassDark : n > 88 ? grassLight : grass;
      col = mix(col, slope > 0 ? [60, 90, 50] : [196, 224, 150], Math.min(0.35, Math.abs(slope)));
    }
    for (let yy = 0; yy < B; yy++) for (let xx = 0; xx < B; xx++) {
      const i = ((by + yy) * W + bx + xx) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = false;
  const rng = createRng(hash32(map.seed, "art"));

  // Dirt roads.
  for (const [ax, ay, bx, by] of map.roads) {
    g.lineCap = "round";
    g.strokeStyle = "#A8875A"; g.lineWidth = 3.2 * S; g.beginPath(); g.moveTo(ax * S, ay * S); g.lineTo(bx * S, by * S); g.stroke();
    g.strokeStyle = "#C9A874"; g.lineWidth = 2.2 * S; g.beginPath(); g.moveTo(ax * S, ay * S); g.lineTo(bx * S, by * S); g.stroke();
  }
  // Stone plazas with tiles and a family banner.
  for (const p of map.pois) {
    const r = p.r * 0.75 * S;
    g.fillStyle = "#9E9888"; g.beginPath(); g.arc(p.x * S, p.y * S, r + 3, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#BDB6A4"; g.beginPath(); g.arc(p.x * S, p.y * S, r, 0, Math.PI * 2); g.fill();
    g.save(); g.beginPath(); g.arc(p.x * S, p.y * S, r, 0, Math.PI * 2); g.clip();
    g.fillStyle = "#A9A292";
    for (let y = p.y * S - r; y < p.y * S + r; y += 8) g.fillRect(p.x * S - r, Math.round(y), r * 2, 1);
    for (let y = p.y * S - r, row = 0; y < p.y * S + r; y += 8, row++) for (let x = p.x * S - r + (row % 2) * 4; x < p.x * S + r; x += 8) g.fillRect(Math.round(x), Math.round(y), 1, 8);
    g.restore();
    const fx = Math.round(p.x * S), fy = Math.round(p.y * S);
    g.fillStyle = "#5B4636"; g.fillRect(fx - 1, fy - 22, 3, 24);
    g.fillStyle = FAMILY_COLOR[p.family]; g.fillRect(fx + 2, fy - 22, 14, 9);
    g.fillStyle = "#111"; g.fillRect(fx + 2, fy - 13, 14, 1);
  }
  // Buildings: plank floors, furniture, thick walls with a door.
  for (const b of map.buildings) {
    const x = Math.round(b.x * S), y = Math.round(b.y * S), w = Math.round(b.w * S), h = Math.round(b.h * S);
    g.fillStyle = "rgba(40,30,20,.3)"; g.fillRect(x + 4, y + 4, w, h);
    g.fillStyle = "#C79A63"; g.fillRect(x, y, w, h);
    g.fillStyle = "#B4874F"; for (let yy = y + 5; yy < y + h; yy += 6) g.fillRect(x, yy, w, 1);
    for (let k = 0; k < 3; k++) {
      const fw = 6 + rng.int(8), fh = 5 + rng.int(6), fx2 = x + 6 + rng.int(Math.max(1, w - fw - 12)), fy2 = y + 6 + rng.int(Math.max(1, h - fh - 12));
      g.fillStyle = ["#8A5A3A", "#6E8FB0", "#A64B3C", "#5F7D4A"][rng.int(4)]; g.fillRect(fx2, fy2, fw, fh);
      g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(fx2, fy2 + fh - 1, fw, 1);
    }
    g.fillStyle = "#4A3728";
    const door = rng.int(4), dw = 10;
    const wall = (wx: number, wy: number, ww: number, wh: number) => g.fillRect(wx, wy, ww, wh);
    const cx = x + Math.round(w / 2 - dw / 2), cy = y + Math.round(h / 2 - dw / 2);
    if (door === 0) { wall(x, y, cx - x, 3); wall(cx + dw, y, x + w - cx - dw, 3); } else wall(x, y, w, 3);
    if (door === 1) { wall(x, y + h - 3, cx - x, 3); wall(cx + dw, y + h - 3, x + w - cx - dw, 3); } else wall(x, y + h - 3, w, 3);
    if (door === 2) { wall(x, y, 3, cy - y); wall(x, cy + dw, 3, y + h - cy - dw); } else wall(x, y, 3, h);
    if (door === 3) { wall(x + w - 3, y, 3, cy - y); wall(x + w - 3, cy + dw, 3, y + h - cy - dw); } else wall(x + w - 3, y, 3, h);
  }
  // Rocks and trees, with shadows, back to front.
  for (const o of [...map.obstacles].sort((a, b) => a.y - b.y)) {
    const x = o.x * S, y = o.y * S, r = o.r * S;
    g.fillStyle = "rgba(30,50,20,.32)"; g.beginPath(); g.ellipse(x + r * 0.35, y + r * 0.45, r * 1.05, r * 0.6, 0, 0, Math.PI * 2); g.fill();
    if (o.kind === "rock") {
      g.fillStyle = "#7C7A72"; g.beginPath(); g.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#A3A197"; g.beginPath(); g.ellipse(x - r * 0.25, y - r * 0.25, r * 0.55, r * 0.4, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#5F5E5A"; g.fillRect(Math.round(x - r * 0.5), Math.round(y + r * 0.45), Math.round(r), 2);
    } else {
      g.fillStyle = "#6B4A2B"; g.fillRect(Math.round(x - 2), Math.round(y), 4, Math.round(r * 0.8));
      g.fillStyle = "#2F5A12"; g.beginPath(); g.arc(x, y - r * 0.2, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#3F7A18"; g.beginPath(); g.arc(x - r * 0.15, y - r * 0.35, r * 0.78, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#58A024"; g.beginPath(); g.arc(x - r * 0.35, y - r * 0.55, r * 0.38, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#7CC23A"; g.fillRect(Math.round(x - r * 0.45), Math.round(y - r * 0.7), 3, 3);
    }
  }
  return c;
}

export function terrainFor(map: GameMap): Terrain {
  const hit = cache.get(map.seed);
  if (hit) return hit;
  const frames = [paintGround(map, 0), paintGround(map, 3)];
  const mini = document.createElement("canvas"); mini.width = 240; mini.height = 240;
  const m = mini.getContext("2d")!;
  m.imageSmoothingEnabled = true; m.drawImage(frames[0], 0, 0, 240, 240);
  const out = { frames, mini };
  if (cache.size > 4) cache.clear();
  cache.set(map.seed, out);
  return out;
}
