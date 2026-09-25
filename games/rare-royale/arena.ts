/** The broadcast camera over the island and the minimap. Pure presentation: it reads engine snapshots and
 * events and never changes the battle. */

import { TICK_MS, WEAPONS, type BattleEvent, type BattleSnapshot, type Fighter, type GameMap, type WeaponId } from "./engine/index.ts";
import { FAMILY_COLOR, type FriendArt } from "./roster.ts";
import { drawIcon, feetRow, spriteCanvas } from "./art.ts";
import { terrainFor, TERRAIN_PX } from "./terrain.ts";

/** Camera canvas size in pixels. */
export const CAM_W = 600, CAM_H = 300;

type Shot = { born: number; dur: number; fx: number; fy: number; tx: number; ty: number; weapon: WeaponId; hit: boolean; dmg: number; armor: number; blocked: string; to: number; from: number };
type Pop = { born: number; x: number; y: number; text: string; color: string };
type Effect = { born: number; kind: "down" | "revive" | "loot" | "heal" | "flash" | "land"; who: number; item?: string; x: number; y: number };

export type ArenaView = Readonly<{
  push(snapshot: BattleSnapshot, events: readonly BattleEvent[], now: number): void;
  draw(now: number, focus: number, player: number, reducedMotion: boolean): void;
  drawMinimap(canvas: HTMLCanvasElement, player: number, now: number): void;
  /** Where the camera looks, in world units, and how far it sees (half the visible width). */
  view(): Readonly<{ x: number; y: number; halfWidth: number }>;
}>;

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const YOU = "#5DCAA5";

/** The bouncing YOU arrow and tag above the player's Friend. */
function drawYou(g: CanvasRenderingContext2D, x0: number, top: number, now: number, reduced: boolean, scale = 1.25) {
  g.save(); g.translate(x0, top); g.scale(scale, scale);
  const x = 0, bob = reduced ? 0 : Math.round(Math.sin(now / 180) * 3), y = -6 + bob;
  g.fillStyle = "#0E1020"; g.beginPath(); g.moveTo(x - 8, y - 9); g.lineTo(x + 8, y - 9); g.lineTo(x, y + 1); g.fill();
  g.fillStyle = YOU; g.beginPath(); g.moveTo(x - 6, y - 8); g.lineTo(x + 6, y - 8); g.lineTo(x, y - 1); g.fill();
  g.font = "8px Silkscreen, monospace";
  g.fillStyle = "#0E1020"; g.fillRect(x - 13, y - 21, 26, 11);
  g.fillStyle = YOU; g.fillRect(x - 12, y - 20, 24, 9);
  g.fillStyle = "#0E1020"; g.fillText("YOU", x - 9, y - 13);
  g.restore();
}

function drawAirship(g: CanvasRenderingContext2D, x: number, y: number, s: number, dir: number, now: number) {
  g.save(); g.translate(Math.round(x), Math.round(y)); g.scale(dir * s, s);
  g.fillStyle = "rgba(20,20,40,.25)"; g.beginPath(); g.ellipse(6, 30, 26, 6, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#993C1D"; g.beginPath(); g.ellipse(0, 0, 30, 11, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#D85A30"; g.beginPath(); g.ellipse(0, -2, 28, 8, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#FAC775"; g.fillRect(-18, -4, 36, 3);
  g.fillStyle = "#4A1B0C"; g.fillRect(-28, -2, 3, 6); g.fillRect(-32, -8, 4, 16);
  g.fillStyle = "#5B4636"; g.fillRect(-9, 10, 18, 6); g.fillStyle = "#FAEEDA"; g.fillRect(-7, 11, 3, 3); g.fillRect(-2, 11, 3, 3); g.fillRect(3, 11, 3, 3);
  const blade = Math.floor(now / 60) % 2 ? 7 : 2;
  g.fillStyle = "#E8E6F5"; g.fillRect(-35, -blade, 2, blade * 2);
  g.restore();
}

export function createArenaView(canvas: HTMLCanvasElement, map: GameMap, artOf: (f: Readonly<Fighter>) => FriendArt | null): ArenaView {
  const g = canvas.getContext("2d")!;
  const terrain = terrainFor(map);
  let prev: BattleSnapshot | null = null, cur: BattleSnapshot | null = null, tickAt = 0;
  let camX = map.airship.ax, camY = map.airship.ay, zoom = 2, camInit = false;
  const shots: Shot[] = [], pops: Pop[] = [], effects: Effect[] = [];
  const hitFlash = new Map<number, number>();

  function posOf(i: number, k: number) {
    const b = cur!.fighters[i], a = prev?.fighters[i] ?? b;
    if (Math.hypot(b.x - a.x, b.y - a.y) > 30) return { x: b.x, y: b.y, moving: false };
    return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), moving: Math.hypot(b.x - a.x, b.y - a.y) > 0.3 };
  }

  return {
    view: () => ({ x: camX, y: camY, halfWidth: CAM_W / 2 / zoom }),
    push(snapshot, events, now) {
      prev = cur; cur = snapshot; tickAt = now;
      for (const e of events) {
        if (e.kind === "shot") {
          const a = prev?.fighters[e.from] ?? snapshot.fighters[e.from], b = prev?.fighters[e.to] ?? snapshot.fighters[e.to];
          const d = Math.hypot(b.x - a.x, b.y - a.y), w = WEAPONS[e.weapon];
          shots.push({ born: now + e.at * TICK_MS * 0.9, dur: w.ranged ? Math.max(90, d * (e.weapon === "bow" ? 9 : 13)) : 140, fx: a.x, fy: a.y, tx: b.x, ty: b.y, weapon: e.weapon, hit: !e.blocked, dmg: e.dmg, armor: e.armorDmg, blocked: e.blocked, to: e.to, from: e.from });
        } else if (e.kind === "downed") effects.push({ born: now, kind: "down", who: e.who, x: 0, y: 0 });
        else if (e.kind === "revived") effects.push({ born: now, kind: "revive", who: e.who, x: 0, y: 0 });
        else if (e.kind === "loot") effects.push({ born: now + Math.random() * 400, kind: "loot", who: e.who, item: e.item, x: 0, y: 0 });
        else if (e.kind === "sponsor" && e.item !== "revive") effects.push({ born: now, kind: "loot", who: e.who, item: e.item, x: 0, y: 0 });
        else if (e.kind === "heal") effects.push({ born: now, kind: "heal", who: e.who, x: 0, y: 0 });
        else if (e.kind === "land") effects.push({ born: now, kind: "land", who: e.who, x: 0, y: 0 });
        else if (e.kind === "storm_hit") { const f = snapshot.fighters[e.who]; pops.push({ born: now, x: f.x, y: f.y, text: `-${e.dmg}`, color: "#AFA9EC" }); }
      }
      const cutoff = now - 4000;
      for (const list of [shots, pops, effects] as { born: number }[][]) while (list.length && list[0].born < cutoff) list.shift();
    },
    draw(now, focus, player, reducedMotion) {
      if (!cur) return;
      const k = reducedMotion ? 1 : Math.min(1, (now - tickAt) / TICK_MS);
      const fcs = focus >= 0 ? cur.fighters[focus] : null;
      // Camera: wide on the airship during the drop, close on the action after landing.
      const flying = !fcs || fcs.state === "air";
      const target = fcs && !flying ? posOf(focus, k) : fcs ? posOf(focus, k) : { x: cur.ship.x, y: cur.ship.y };
      const wantZoom = flying ? 1.6 : cur.zone.r < 25 ? 4.5 : 3.5;
      if (!camInit || reducedMotion) { camX = target.x; camY = target.y; zoom = wantZoom; camInit = true; }
      else { camX += (target.x - camX) * 0.08; camY += (target.y - camY) * 0.08; zoom += (wantZoom - zoom) * 0.05; }
      const Z = zoom, ox = CAM_W / 2 - camX * Z, oy = CAM_H / 2 - camY * Z;
      const sx = (x: number) => Math.round(ox + x * Z), sy = (y: number) => Math.round(oy + y * Z);

      g.imageSmoothingEnabled = Z < TERRAIN_PX * 0.9;
      g.fillStyle = "#265E8C"; g.fillRect(0, 0, CAM_W, CAM_H);
      const frame = terrain.frames[Math.floor(now / 700) % terrain.frames.length];
      g.drawImage(frame, ox, oy, frame.width * Z / TERRAIN_PX, frame.height * Z / TERRAIN_PX);
      g.imageSmoothingEnabled = false;

      // Crates: glow by tier. Fallen Friends' gear: purple boxes.
      cur.crates.forEach((open, i) => {
        if (open) return;
        const c = map.crates[i], x = sx(c.x), y = sy(c.y);
        if (x < -20 || y < -20 || x > CAM_W + 20 || y > CAM_H + 20 || (Z < 2.5 && c.tier < 3)) return;
        const s = Math.max(1, Math.round(Z / 2));
        if (c.tier === 3) { g.fillStyle = `rgba(250,199,117,${0.25 + 0.2 * Math.sin(now / 200 + i)})`; g.beginPath(); g.arc(x, y, 6 * s, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = "#4A2E14"; g.fillRect(x - 4 * s, y - 3 * s, 8 * s, 7 * s);
        g.fillStyle = c.tier === 3 ? "#EF9F27" : c.tier === 2 ? "#378ADD" : "#BA7517"; g.fillRect(x - 3 * s, y - 2 * s, 6 * s, 5 * s);
        g.fillStyle = "#FAEEDA"; g.fillRect(x - 3 * s, y - 2 * s, 6 * s, s); g.fillRect(x - s / 2, y - 2 * s, s, 5 * s);
      });
      for (const c of cur.deathCrates) {
        if (c.open || Z < 2.5) continue;
        const x = sx(c.x), y = sy(c.y), s = Math.max(1, Math.round(Z / 2));
        g.fillStyle = "#26215C"; g.fillRect(x - 4 * s, y - 3 * s, 8 * s, 7 * s);
        g.fillStyle = "#7F77DD"; g.fillRect(x - 3 * s, y - 2 * s, 6 * s, 5 * s);
        g.fillStyle = "#FFFFFF"; g.fillRect(x - s, y - s, s, s); g.fillRect(x + s / 2, y - s, s, s);
      }

      // The storm: everything outside the circle, animated; the next circle as a white dashed ring.
      const z = cur.zone, pz = prev?.zone ?? z;
      const zr = lerp(pz.r, z.r, k), zx = lerp(pz.cx, z.cx, k), zy = lerp(pz.cy, z.cy, k);
      g.save(); g.beginPath(); g.rect(0, 0, CAM_W, CAM_H); g.arc(sx(zx), sy(zy), Math.max(0, zr * Z), 0, Math.PI * 2, true);
      g.fillStyle = "rgba(83,74,183,.45)"; g.fill("evenodd");
      g.clip("evenodd");
      g.fillStyle = "rgba(175,169,236,.35)";
      const drift = Math.floor(now / 90) % 8;
      for (let y = -8; y < CAM_H; y += 8) for (let x = ((y / 8) % 2) * 4 - drift; x < CAM_W; x += 8) g.fillRect(x, y, 2, 2);
      g.restore();
      g.lineWidth = 3; g.strokeStyle = "#AFA9EC"; g.beginPath(); g.arc(sx(zx), sy(zy), Math.max(0, zr * Z), 0, Math.PI * 2); g.stroke();
      if (z.nr > 0 && z.nr < z.r) { g.setLineDash([6, 6]); g.lineWidth = 2; g.strokeStyle = "rgba(255,255,255,.85)"; g.beginPath(); g.arc(sx(z.ncx), sy(z.ncy), z.nr * Z, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }

      // Friends on the ground, back to front.
      const spriteScale = Z >= 3 ? 2 : 1, size = 18 * spriteScale;
      const standing = cur.fighters.filter(f => f.state === "alive" || f.state === "downed").map(f => ({ f, p: posOf(f.index, k) })).sort((a, b) => a.p.y - b.p.y);
      for (const { f, p } of standing) {
        const x = sx(p.x), y = sy(p.y);
        if (x < -50 || y < -60 || x > CAM_W + 50 || y > CAM_H + 60) continue;
        const art = artOf(f);
        const walk = p.moving && f.state === "alive";
        const frameN = Math.floor(now / 100 + f.index * 3) % 8;
        const rows = art ? (walk ? (f.facing > 0 ? art.walkRight : art.walkLeft)[frameN] : art.idle[Math.floor(now / 160 + f.index) % 8]) : null;
        g.fillStyle = "rgba(20,30,10,.35)"; g.beginPath(); g.ellipse(x, y, 5 * spriteScale, 2 * spriteScale, 0, 0, Math.PI * 2); g.fill();
        if (f.index === player) {
          const pulse = reducedMotion ? 0 : (Math.sin(now / 220) + 1) * 1.5;
          g.strokeStyle = YOU; g.lineWidth = 2;
          g.beginPath(); g.ellipse(x, y, (8 + pulse) * spriteScale, (3 + pulse / 2) * spriteScale, 0, 0, Math.PI * 2); g.stroke();
          g.strokeStyle = "rgba(93,202,165,.35)"; g.lineWidth = 4;
          g.beginPath(); g.ellipse(x, y, (11 + pulse) * spriteScale, (4.5 + pulse / 2) * spriteScale, 0, 0, Math.PI * 2); g.stroke();
        }
        if (f.state === "downed") g.globalAlpha = 0.5 + 0.3 * Math.sin(now / 110);
        if (rows) {
          const img = spriteCanvas(rows), feet = (feetRow(rows) + 2) * spriteScale;
          g.drawImage(img, x - size / 2, y - feet, size, size);
          const flash = hitFlash.get(f.index);
          if (flash && now - flash < 90) { g.globalCompositeOperation = "lighter"; g.globalAlpha = 0.7; g.drawImage(img, x - size / 2, y - feet, size, size); g.globalCompositeOperation = "source-over"; }
        }
        g.globalAlpha = 1;
        if (f.state === "alive" && f.weapon !== "fists" && spriteScale > 1) drawIcon(g, f.weapon, x + (f.facing > 0 ? 9 : -18), y - 16, 1);
        if (f.shield) { g.strokeStyle = `rgba(133,183,235,${0.6 + 0.3 * Math.sin(now / 150)})`; g.lineWidth = 2; g.beginPath(); g.arc(x, y - size * 0.45, size * 0.62, 0, Math.PI * 2); g.stroke(); }
        // Bars: armour over HP.
        const bw = 7 * spriteScale + 4, hp = Math.max(0, f.hp / f.maxHp), ar = Math.min(1, f.armor / 50);
        g.fillStyle = "#111"; g.fillRect(x - bw / 2 - 1, y + 3, bw + 2, ar > 0 ? 7 : 4);
        g.fillStyle = f.state === "downed" ? "#E24B4A" : hp > 0.5 ? "#5DCAA5" : hp > 0.25 ? "#EF9F27" : "#E24B4A"; g.fillRect(x - bw / 2, y + 4, Math.round(bw * hp), 2);
        if (ar > 0) { g.fillStyle = "#85B7EB"; g.fillRect(x - bw / 2, y + 7, Math.round(bw * ar), 2); }
        if (f.index === player) drawYou(g, x, y - size - 4, now, reducedMotion, spriteScale > 1 ? 1.25 : 1.6);
        const labelled = f.index !== player && (f.index === focus || f.state === "downed" || f.kos >= 3);
        if (labelled && spriteScale > 1) {
          const label = f.kos >= 3 ? `#${f.id.tokenId} ${f.kos}KO` : `#${f.id.tokenId}`;
          g.font = "8px Silkscreen, monospace";
          const w = Math.ceil(g.measureText(label).width) + 6, ly = y - size - 8;
          g.fillStyle = FAMILY_COLOR[f.id.family]; g.fillRect(x - w / 2, ly, w, 10);
          g.fillStyle = "#111"; g.fillText(label, x - w / 2 + 3, ly + 8);
        }
        if (f.state === "downed" && cur) {
          const left = Math.max(0, 5 - (cur.t - f.downedAt) - k);
          g.strokeStyle = "#E24B4A"; g.lineWidth = 2; g.beginPath(); g.arc(x, y - size * 0.4, size * 0.7, -Math.PI / 2, -Math.PI / 2 + (left / 5) * Math.PI * 2); g.stroke();
        }
      }

      // Projectiles and swings.
      for (const s of shots) {
        const age = now - s.born;
        if (age < 0 || age > s.dur + 250) continue;
        const t = Math.min(1, age / s.dur);
        const fx = sx(s.fx), fy = sy(s.fy) - 10, tx = sx(s.tx) + (s.hit ? 0 : 8), ty = sy(s.ty) - 10 + (s.hit ? 0 : -6);
        if (age <= s.dur) {
          const x = lerp(fx, tx, t), y = lerp(fy, ty, t) - (s.weapon === "slingshot" ? Math.sin(t * Math.PI) * 10 : 0);
          if (s.weapon === "slingshot") { g.fillStyle = "#5F5E5A"; g.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4); g.fillStyle = "#B4B2A9"; g.fillRect(Math.round(x) - 1, Math.round(y) - 2, 2, 1); }
          else if (s.weapon === "bow") { const ang = Math.atan2(ty - fy, tx - fx); g.strokeStyle = "#633806"; g.lineWidth = 2; g.beginPath(); g.moveTo(x - Math.cos(ang) * 10, y - Math.sin(ang) * 10); g.lineTo(x, y); g.stroke(); g.fillStyle = "#E8E6F5"; g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3); }
          else if (s.weapon === "wand") { for (let q = 0; q < 4; q++) { const tt = Math.max(0, t - q * 0.06); g.fillStyle = q ? `rgba(250,199,117,${0.5 - q * 0.1})` : "#FFF3C4"; g.fillRect(Math.round(lerp(fx, tx, tt)) - 2 + q, Math.round(lerp(fy, ty, tt)) - 2, 4 - q, 4 - q); } }
          else { const r = 8 + t * 6, ang = Math.atan2(ty - fy, tx - fx); g.strokeStyle = s.weapon === "hammer" ? "#E8E6F5" : "#FAEEDA"; g.lineWidth = 2; g.beginPath(); g.arc(fx, fy, r, ang - 0.8, ang + 0.8); g.stroke(); }
        } else if (age <= s.dur + 20 && s.hit) hitFlash.set(s.to, now);
        if (age > s.dur && age < s.dur + 250) {
          const p = (age - s.dur) / 250;
          if (s.blocked === "shield") { g.strokeStyle = `rgba(181,212,244,${1 - p})`; g.lineWidth = 2; g.beginPath(); g.arc(tx, ty, 6 + p * 10, 0, Math.PI * 2); g.stroke(); }
          else if (s.hit) { g.fillStyle = `rgba(255,255,255,${1 - p})`; for (let q = 0; q < 6; q++) { const aa = q * Math.PI / 3; g.fillRect(Math.round(tx + Math.cos(aa) * (3 + p * 8)), Math.round(ty + Math.sin(aa) * (3 + p * 8)), 2, 2); } }
        }
        if (age > s.dur && age < s.dur + 30 && (s.dmg || s.armor || s.blocked) && !pops.some(pp => pp.born === s.born + s.dur)) {
          const text = s.blocked === "miss" ? "miss" : s.blocked === "dazzle" ? "dazzled" : s.blocked === "feint" ? "dodge" : s.blocked === "shield" ? "blocked" : s.armor && !s.dmg ? `${s.armor}` : `${s.dmg + s.armor}`;
          pops.push({ born: s.born + s.dur, x: s.tx, y: s.ty, text, color: s.blocked ? "#E8E6F5" : s.armor && !s.dmg ? "#85B7EB" : s.dmg >= 14 ? "#FAC775" : "#FFFFFF" });
        }
      }
      for (const p of pops) {
        const age = now - p.born;
        if (age < 0 || age > 900) continue;
        const x = sx(p.x), y = sy(p.y) - 24 - age / 30;
        g.font = "8px Silkscreen, monospace"; g.globalAlpha = 1 - age / 900;
        g.fillStyle = "#111"; g.fillText(p.text, x - 7, y + 1); g.fillStyle = p.color; g.fillText(p.text, x - 8, y);
        g.globalAlpha = 1;
      }
      for (const e of effects) {
        const age = now - e.born, f = cur.fighters[e.who];
        if (age < 0 || age > 900 || !f) continue;
        const p = posOf(e.who, k), x = sx(p.x), y = sy(p.y) - 14, s = age / 900;
        if (e.kind === "down") { g.fillStyle = `rgba(226,75,74,${1 - s})`; for (let q = 0; q < 10; q++) { const aa = q * 0.63; g.fillRect(Math.round(x + Math.cos(aa) * s * 26), Math.round(y + Math.sin(aa) * s * 26), 3, 3); } }
        else if (e.kind === "revive") { g.strokeStyle = `rgba(93,202,165,${1 - s})`; g.lineWidth = 3; g.beginPath(); g.arc(x, y + 12, 6 + s * 26, 0, Math.PI * 2); g.stroke(); g.fillStyle = `rgba(159,225,203,${0.5 * (1 - s)})`; g.fillRect(x - 3, y - 60 + s * 40, 6, 60); }
        else if (e.kind === "heal") { g.fillStyle = `rgba(93,202,165,${1 - s})`; g.fillRect(x - 1, y - 16 - s * 12, 3, 7); g.fillRect(x - 3, y - 14 - s * 12, 7, 3); }
        else if (e.kind === "land") { g.strokeStyle = `rgba(233,201,139,${1 - s})`; g.lineWidth = 2; g.beginPath(); g.ellipse(x, y + 14, 6 + s * 14, 2 + s * 5, 0, 0, Math.PI * 2); g.stroke(); }
        else if (e.kind === "loot" && e.item) drawIcon(g, e.item, x - 7, y - 22 - s * 12, 2);
      }

      // The airship and Friends under their parachutes.
      if (cur.ship.flying) {
        const ps = prev?.ship ?? cur.ship, dir = map.airship.bx >= map.airship.ax ? 1 : -1;
        const ax = sx(lerp(ps.x, cur.ship.x, k)), ay = sy(lerp(ps.y, cur.ship.y, k)) - 30;
        drawAirship(g, ax, ay, Math.max(0.8, Z / 2), dir, now);
        const me = player >= 0 ? cur.fighters[player] : null;
        if (me && me.state === "air" && cur.t < me.jumpAt) drawYou(g, ax, ay - 14 * Math.max(0.8, Z / 2), now, reducedMotion, 1.6);
      }
      for (const f of cur.fighters) {
        if (f.state !== "air" || cur.t < f.jumpAt) continue;
        const p = posOf(f.index, k), x = sx(p.x), y = sy(p.y), prog = Math.min(1, (cur.t + k - f.jumpAt) / Math.max(1, f.landAt - f.jumpAt));
        const lift = (1 - prog) * 40 + 8, art = artOf(f), s = Z >= 3 ? 2 : 1;
        g.fillStyle = "rgba(20,30,10,.25)"; g.beginPath(); g.ellipse(x, y, 4 * s, 1.5 * s, 0, 0, Math.PI * 2); g.fill();
        const cy = y - lift - 16 * s;
        g.fillStyle = f.index === player ? "#5DCAA5" : FAMILY_COLOR[f.id.family]; g.beginPath(); g.arc(x, cy, 9 * s, Math.PI, 0); g.fill();
        g.fillStyle = "rgba(255,255,255,.5)"; g.fillRect(x - 3 * s, cy - 9 * s, 2 * s, 9 * s);
        g.strokeStyle = "rgba(20,20,20,.6)"; g.lineWidth = 1; g.beginPath(); g.moveTo(x - 9 * s, cy); g.lineTo(x - 2, cy + 10 * s); g.moveTo(x + 9 * s, cy); g.lineTo(x + 2, cy + 10 * s); g.stroke();
        if (art) g.drawImage(spriteCanvas(art.idle[0]), x - 9 * s, cy + 6 * s, 18 * s, 18 * s);
        if (f.index === player) drawYou(g, x, cy - 9 * s - 2, now, reducedMotion, s > 1 ? 1.25 : 1.6);
      }

      // When the player's Friend is off camera, point at it from the edge.
      const me = player >= 0 ? cur.fighters[player] : null;
      if (me && me.state !== "out" && !(me.state === "air" && cur.t < me.jumpAt)) {
        const p = posOf(player, k), x = sx(p.x), y = sy(p.y) - 12;
        if (x < 0 || y < 0 || x > CAM_W || y > CAM_H) {
          const cx = Math.max(18, Math.min(CAM_W - 18, x)), cy = Math.max(18, Math.min(CAM_H - 18, y)), a = Math.atan2(y - cy, x - cx);
          g.save(); g.translate(cx, cy); g.rotate(a);
          g.fillStyle = "#0E1020"; g.beginPath(); g.moveTo(12, 0); g.lineTo(-8, -9); g.lineTo(-8, 9); g.fill();
          g.fillStyle = YOU; g.beginPath(); g.moveTo(10, 0); g.lineTo(-6, -7); g.lineTo(-6, 7); g.fill();
          g.restore();
        }
      }

      // Place names while the camera is wide.
      if (Z < 2.5) {
        g.font = "10px Silkscreen, monospace";
        for (const p of map.pois) {
          const x = sx(p.x), y = sy(p.y) - p.r * Z - 6, w = g.measureText(p.name).width;
          g.fillStyle = "rgba(14,16,32,.75)"; g.fillRect(x - w / 2 - 4, y - 10, w + 8, 14);
          g.fillStyle = FAMILY_COLOR[p.family]; g.fillText(p.name, x - w / 2, y);
        }
      }
    },
    drawMinimap(mc, player, now) {
      if (!cur) return;
      const m = mc.getContext("2d")!, W = mc.width, s = W / 240;
      m.imageSmoothingEnabled = true; m.drawImage(terrain.mini, 0, 0, W, W);
      const z = cur.zone;
      m.save(); m.beginPath(); m.rect(0, 0, W, W); m.arc(z.cx * s, z.cy * s, Math.max(0, z.r * s), 0, Math.PI * 2, true); m.fillStyle = "rgba(60,52,137,.55)"; m.fill("evenodd"); m.restore();
      if (z.nr > 0) { m.strokeStyle = "#FFFFFF"; m.lineWidth = 1; m.setLineDash([3, 2]); m.beginPath(); m.arc(z.ncx * s, z.ncy * s, z.nr * s, 0, Math.PI * 2); m.stroke(); m.setLineDash([]); }
      if (cur.ship.flying) {
        m.strokeStyle = "rgba(240,153,123,.9)"; m.setLineDash([2, 2]); m.beginPath(); m.moveTo(map.airship.ax * s, map.airship.ay * s); m.lineTo(map.airship.bx * s, map.airship.by * s); m.stroke(); m.setLineDash([]);
        m.fillStyle = "#D85A30"; m.fillRect(cur.ship.x * s - 3, cur.ship.y * s - 2, 6, 4);
      }
      for (const f of cur.fighters) {
        if (f.state === "out" || f.index === player || (f.state === "air" && cur.t < f.jumpAt)) continue;
        m.fillStyle = f.state === "downed" ? "#E24B4A" : FAMILY_COLOR[f.id.family];
        m.fillRect(Math.round(f.x * s) - 1, Math.round(f.y * s) - 1, 2, 2);
      }
      const me = cur.fighters[player];
      if (me && me.state !== "out" && !(me.state === "air" && cur.t < me.jumpAt)) {
        const mx = Math.round(me.x * s), my = Math.round(me.y * s), r = 5 + (Math.sin(now / 250) + 1) * 2;
        m.strokeStyle = YOU; m.lineWidth = 1.5; m.beginPath(); m.arc(mx, my, r, 0, Math.PI * 2); m.stroke();
        m.fillStyle = "#FFFFFF"; m.fillRect(mx - 3, my - 3, 6, 6); m.fillStyle = "#1D9E75"; m.fillRect(mx - 2, my - 2, 4, 4);
      }
      const vw = CAM_W / zoom, vh = CAM_H / zoom;
      m.strokeStyle = "#FFFFFF"; m.lineWidth = 1; m.strokeRect(Math.round((camX - vw / 2) * s) + 0.5, Math.round((camY - vh / 2) * s) + 0.5, Math.round(vw * s), Math.round(vh * s));
    },
  };
}
