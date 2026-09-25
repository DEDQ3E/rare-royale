/** Canonical Friend rendering: the on-chain 16 × 16 silhouette in black with a one-pixel white outline,
 * never recoloured or reshaped. Frames are cached as small canvases for fast drawing. */

import type { SpriteRows } from "./roster.ts";

export const FRIEND_MASK = "#111111";
export const FRIEND_HALO = "#FFFFFF";

const cache = new WeakMap<SpriteRows, HTMLCanvasElement>();

/** An 18 × 18 canvas: the 16 × 16 frame plus its outline. */
export function spriteCanvas(rows: SpriteRows): HTMLCanvasElement {
  const hit = cache.get(rows);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = 18; c.height = 18;
  const g = c.getContext("2d")!;
  const on = (i: number, j: number) => j >= 0 && j < 16 && i >= 0 && i < 16 && rows[j][i] === "#";
  g.fillStyle = FRIEND_HALO;
  for (let j = -1; j < 17; j++) for (let i = -1; i < 17; i++) {
    if (!on(i, j) && (on(i + 1, j) || on(i - 1, j) || on(i, j + 1) || on(i, j - 1))) g.fillRect(i + 1, j + 1, 1, 1);
  }
  g.fillStyle = FRIEND_MASK;
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) if (on(i, j)) g.fillRect(i + 1, j + 1, 1, 1);
  cache.set(rows, c);
  return c;
}

/** Lowest filled row: where the Friend's feet are, so it stands on the ground whatever its shape. */
export function feetRow(rows: SpriteRows): number {
  for (let j = 15; j >= 0; j--) if (rows[j].includes("#")) return j;
  return 15;
}

/** Draws a frame into a canvas at an integer scale, centred. */
export function paintSprite(canvas: HTMLCanvasElement, rows: SpriteRows | null) {
  const g = canvas.getContext("2d");
  if (!g) return;
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, canvas.width, canvas.height);
  if (!rows) return;
  const scale = Math.max(1, Math.floor(Math.min(canvas.width, canvas.height) / 18));
  const w = 18 * scale;
  g.drawImage(spriteCanvas(rows), Math.floor((canvas.width - w) / 2), Math.floor((canvas.height - w) / 2), w, w);
}

/** Tiny 7 × 7 pixel icons for loot and sponsor items, drawn in the arena. */
export const PIXEL_ICONS: Readonly<Record<string, Readonly<{ color: string; rows: readonly string[] }>>> = {
  shield: { color: "#85B7EB", rows: [".#####.", "#######", "#######", "#######", ".#####.", "..###..", "...#..."] },
  medkit: { color: "#E24B4A", rows: [".......", "..###..", "..###..", "#######", "..###..", "..###..", "......."] },
  revive: { color: "#5DCAA5", rows: [".##.##.", "#######", "#######", "#######", ".#####.", "..###..", "...#..."] },
  slingshot: { color: "#BA7517", rows: ["#.....#", "#.....#", ".#...#.", "..###..", "...#...", "...#...", "...#..."] },
  helmet: { color: "#B4B2A9", rows: [".......", "..###..", ".#####.", "#######", "#######", "#.....#", "......."] },
  sneakers: { color: "#F09595", rows: [".......", ".......", "##.....", "###....", "######.", "#######", "......."] },
  snack: { color: "#FAC775", rows: [".......", "..###..", ".#####.", ".#####.", ".#####.", "..###..", "......."] },
  fists: { color: "#E9C98B", rows: [".......", ".####..", "######.", "######.", ".#####.", "..###..", "......."] },
  hammer: { color: "#B4B2A9", rows: ["#####..", "#####..", "..#....", "..#....", "..#....", "..#....", "..#...."] },
  bow: { color: "#BA7517", rows: ["..#....", ".#.#...", "#...#..", "#....#.", "#...#..", ".#.#...", "..#...."] },
  wand: { color: "#FAC775", rows: ["....#.#", ".....#.", "....#.#", "...#...", "..#....", ".#.....", "#......"] },
  armor20: { color: "#85B7EB", rows: ["#.....#", "##...##", "#######", "#######", ".#####.", ".#####.", "..###.."] },
  armor35: { color: "#378ADD", rows: ["#.....#", "##...##", "#######", "#######", ".#####.", ".#####.", "..###.."] },
  armor50: { color: "#AFA9EC", rows: ["#.....#", "##...##", "#######", "#######", ".#####.", ".#####.", "..###.."] },
  bandages: { color: "#F4C0D1", rows: [".......", ".#####.", "#######", "#.#.#.#", "#######", ".#####.", "......."] },
};

export function drawIcon(g: CanvasRenderingContext2D, id: string, x: number, y: number, scale = 1) {
  const icon = PIXEL_ICONS[id];
  if (!icon) return;
  g.fillStyle = "#111111";
  icon.rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === "#") g.fillRect(x + (i - 1) * scale, y + j * scale, scale, scale); });
  g.fillStyle = icon.color;
  icon.rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === "#") g.fillRect(x + i * scale, y + j * scale - scale, scale, scale); });
}
