"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameComponentProps } from "@rarefriends/friendsdk/runtime";
import { GENERATION_SPRITE_MANIFEST, createFriendReader } from "@rarefriends/friendsdk/sprites";
import { GENERATION_ELIGIBILITY_ABI } from "@rarefriends/friendsdk/identity";
import { createFriendPublicClient } from "@rarefriends/friendsdk/wallet";
import { parseAbi } from "viem";
import {
  createLedger, formatRF, generateMap, plannedDrops, ladderPrizes, revivePrice, roundSeed, settleRound, slotId, lineUp, rf, signatureOf, statsFor, splitPayment,
  BOUNTY, COSMETICS, DECISION_OPTIONS, ENTRY_POOL_BPS, BPS, ENTRY_PRICE, FAMILIES, LOBBY_MS, PROFILES, ROUND_SIZE, SHOUT_PRICE, SHOUTS, SPONSOR_ITEMS, TACTICS, TICK_MS, TUNING, WEAPONS, WORLD,
  type BattleEvent, type Cosmetic, type Family, type Fighter, type FighterInit, type Ledger, type SponsorItemId, type Tactic, type DecisionKind,
} from "./engine/index.ts";
import { ROSTER, ROSTER_INITS, FAMILY_COLOR, fighterName, rosterArt, type FriendArt, type SpriteRows } from "./roster.ts";
import { createRoundRunner, replayRound, type Frame, type PastRound, type RoundRunner, type Tally } from "./runner.ts";
import { CHALLENGES, activeChallenges, completedBy } from "./challenges.ts";
import { createNarrator, ordinal, type FeedLine, type Narrator } from "./narrate.ts";
import { createArenaView, CAM_W, CAM_H, type ArenaLook, type ArenaView } from "./arena.ts";
import { drawIcon, paintSprite, spriteCanvas } from "./art.ts";
import { terrainFor } from "./terrain.ts";
import { createRoyaleAudio, type Cue, type RoyaleAudio } from "./audio.ts";
import ODDS from "./engine/odds.json";
import "./style.css";

const RF_TOKEN = "0x0779369854d3EcdEA927206718FFD7730C67B71f" as const;
const RF_INITIAL_SUPPLY = 1_024_000_000;
const START_BALANCE = rf("20");
const HISTORY_ROUNDS = 12;
/** How long results stay up before the next lobby opens (players can skip ahead). */
const RESULTS_MS = 25_000;
/** The placement ladder when every seat is a paid entry (the preview's simulated entrants all paid). */
const FULL_LADDER = ladderPrizes(ENTRY_PRICE * BigInt(ROUND_SIZE) * ENTRY_POOL_BPS / BPS, ROUND_SIZE);
const pct = (x: number) => `${Math.round(x * 100)}%`;
/** The Friend with the biggest bounty still standing, once it is worth at least two starting bounties. */
function wantedOf(r: RoundRunner): { index: number; head: bigint } {
  let index = -1, head = BOUNTY * 2n - 1n;
  const fs = r.battle.fighters();
  r.bounties.head.forEach((h, i) => { if (h > head && fs[i].state === "alive") { head = h; index = i; } });
  return { index, head: index >= 0 ? head : 0n };
}
const soundModeNext = (m: "on" | "nomusic" | "off") => (m === "on" ? "nomusic" : m === "nomusic" ? "off" : "on");

/** A round's timing for this viewer: a one-minute lobby from arrival, then the drop. */
type Sched = Readonly<{ id: number; battleAt: number; overAt: number }>;
const newSched = (from: number): Sched => ({ id: slotId(from + LOBBY_MS), battleAt: from + LOBBY_MS, overAt: 0 });

type Me = Readonly<{ init: FighterInit; art: FriendArt }>;
type Paid = Readonly<{ init: FighterInit; rank: number; place: bigint; bounties: bigint; total: bigint; you: boolean; kos: number; weapon: string }>;
type Results = Readonly<{
  id: number; paidOut: readonly Paid[];
  you: null | {
    place: number; practice: boolean; prize: bigint; placePrize: bigint; bounties: bigint; bountiesWon: number; wouldHave: bigint;
    kos: number; damage: number; weapon: string; koBy: FighterInit | null; koCause: string; nemesis: number; saves: number; spent: bigint;
  };
  tally: Tally;
  winner: string; kingmakers: readonly string[]; topSponsor: null | { by: string; rf: bigint }; unlocked: readonly string[];
}>;
type Session = { rounds: number; best: number; kos: number; wins: number; spent: bigint; nemesis: Map<string, number>; kingmaker: number; done: Set<string> };
type Equipped = { title: string | null; aura: string | null };
type Alert = Readonly<{ key: string; text: string }>;

const TACTIC_INFO: Readonly<Record<Tactic, { label: string; text: string; key: string }>> = {
  fight: { label: "Fight", text: "Hunts anyone in sight. Most bounties.", key: "1" },
  hide: { label: "Hide", text: "Holds buildings, avoids fights. Most top-10s.", key: "2" },
  loot: { label: "Loot", text: "Clears crates first. Most wins.", key: "3" },
};
const DECISION_TEXT: Readonly<Record<DecisionKind, { title: string; a: string; b: string }>> = {
  engage: { title: "Enemy spotted", a: "Fight", b: "Flee" },
  crate: { title: "Crate nearby", a: "Open it", b: "Skip" },
  storm: { title: "You're in the storm!", a: "Sprint (-6 HP)", b: "Steady" },
};
const TUTORIAL: readonly { icon: string; title: string; lines: readonly string[] }[] = [
  { icon: "wand", title: "Welcome to Rare Royale", lines: [
    "Your Friend drops onto an island with 49 real Rare Friends. The top 10 are paid, and every knockout pays a bounty.",
    "Every round: 1 minute in the lobby, then the drop, about 3 minutes of battle, then results.",
    "Everything here uses simulated RF. Nothing asks for a transaction."] },
  { icon: "armor50", title: "Your Friend is your fighter", lines: [
    "Might (HP and damage), Speed (running and dodging) and Wits (aim, sight and better loot) come from your NFT: its family, generation and sprite.",
    "Your family also gives a signature ability. It is shown under the stats."] },
  { icon: "bow", title: "Pick where to drop", lines: [
    "Tap a place on the island map. The number shows how many Friends plan to land there.",
    "Busy places have better loot and more fights. The dashed line is the airship's route."] },
  { icon: "hammer", title: "Pick a tactic", lines: [
    "Fight hunts anyone in sight and collects the most bounties. Hide holds buildings, avoids fights and reaches the top 10 most often. Loot clears crates first.",
    "Keys 1, 2 and 3 switch tactics. The lobby shows each tactic's real odds from thousands of simulated rounds."] },
  { icon: "medkit", title: "Enter for 1 RF, or practise free", lines: [
    "0.6 RF funds the top-10 prize ladder, 0.2 RF starts as the bounty on your head, 0.1 RF is burned and 0.1 RF funds rewards for active Friends.",
    "Places 1 to 10 pay 8, 5, 4, 3, 2.5 and 1.5 RF. Bounties grow: a knockout pays you half the victim's bounty and adds the other half to yours. The biggest head is WANTED. If the storm gets a Friend, its bounty burns.",
    "Practice rounds are free: same battle, no RF in or out."] },
  { icon: "slingshot", title: "The battle", lines: [
    "Friends grab weapons and armour from crates: slingshot, hammer, bow, star wand. Armour soaks hits first.",
    "Stay inside the white circle: the purple storm outside hurts more every phase. Buildings give cover; woods block shots."] },
  { icon: "revive", title: "Sponsor anyone", lines: [
    "Send a shield or a medkit, or within 5 seconds of a knockdown a second life, to your Friend or the one on camera.",
    "Every sponsor payment burns 50% and funds 50% Friend rewards. Sponsoring closes when 25 are left, so nobody can buy the finish.",
    "The Fighters tab lists everyone still standing: tap one to follow and sponsor it. Back the winner and you are a Kingmaker."] },
  { icon: "shield", title: "Your calls, your Friend", lines: [
    "Up to 4 quick decisions per round: fight or flee, open a crate, sprint out of the storm. Keys 1 and 2.",
    "Your Friend has a teal ring, a YOU arrow and a white marker on the minimap."] },
  { icon: "armor35", title: "Locker, shouts and challenges", lines: [
    "The Locker (L) sells auras and titles for your Friend, and a shout (Y) puts your line in the arena. They never change the fight: 50% burned, 50% to Friend rewards.",
    "Challenges in the lobby unlock free titles, win or lose. After a round, replay the final 20 seconds."] },
];
const rfText = (v: bigint) => `${formatRF(v)} RF`;
const mmss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/** A Friend sprite on a small canvas. */
function Sprite({ rows, size, className }: { rows: SpriteRows | null; size: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current) paintSprite(ref.current, rows); }, [rows]);
  return <canvas ref={ref} width={size} height={size} className={`rr-sprite ${className ?? ""}`} aria-hidden="true" />;
}

/** A 7 × 7 pixel icon (weapons, gear, sponsor items). */
function Icon({ id, scale = 2 }: { id: string; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { const c = ref.current; if (!c) return; const g = c.getContext("2d")!; g.clearRect(0, 0, c.width, c.height); drawIcon(g, id, scale, scale, scale); }, [id, scale]);
  return <canvas ref={ref} width={9 * scale} height={9 * scale} className="rr-icon" aria-hidden="true" />;
}

/** The player's Friend on a lit pedestal, idling and now and then walking in place. */
function Showcase({ art, reduced }: { art: FriendArt; reduced: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const g = c.getContext("2d")!; let raf = 0;
    const draw = (now: number) => {
      g.imageSmoothingEnabled = false; g.clearRect(0, 0, c.width, c.height);
      const W = c.width, H = c.height;
      g.fillStyle = "rgba(250,199,117,.10)"; g.beginPath(); g.moveTo(W / 2 - 18, 0); g.lineTo(W / 2 + 18, 0); g.lineTo(W / 2 + 70, H - 26); g.lineTo(W / 2 - 70, H - 26); g.fill();
      g.fillStyle = "#2A2442"; g.beginPath(); g.ellipse(W / 2, H - 22, 72, 14, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#3C3489"; g.beginPath(); g.ellipse(W / 2, H - 26, 64, 10, 0, 0, Math.PI * 2); g.fill();
      const walking = !reduced && Math.floor(now / 3200) % 3 === 2, frame = reduced ? 0 : Math.floor(now / (walking ? 110 : 170)) % 8;
      const rows = walking ? art.walkRight[frame] : art.idle[frame];
      const bob = reduced ? 0 : Math.round(Math.sin(now / 400) * 1.5);
      g.drawImage(spriteCanvas(rows), W / 2 - 54, H - 132 + bob, 108, 108);
      if (!reduced) {
        g.fillStyle = "rgba(250,238,218,.8)";
        for (let i = 0; i < 6; i++) { const a = now / 900 + i, x = W / 2 + Math.cos(a) * 62, y = H - 70 + Math.sin(a * 1.3) * 40; g.fillRect(Math.round(x), Math.round(y), 2, 2); }
      }
      if (!reduced) raf = requestAnimationFrame(draw);
    };
    draw(performance.now());
    return () => cancelAnimationFrame(raf);
  }, [art, reduced]);
  return <canvas ref={ref} width={220} height={150} className="rr-showcase" aria-hidden="true" />;
}

/** The island for the coming round, with every place, how many Friends plan to drop there, and the airship line. */
function DropMap({ roundId, selected, onSelect, disabled }: { roundId: number; selected: string | null; onSelect: (poi: string | null) => void; disabled: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const map = useMemo(() => generateMap(roundSeed(roundId)), [roundId]);
  const counts = useMemo(() => {
    const drops = plannedDrops(roundSeed(roundId), lineUp(ROSTER_INITS, roundId)), out = new Map<string, number>();
    for (const d of drops) if (d.poi) out.set(d.poi, (out.get(d.poi) ?? 0) + 1);
    return out;
  }, [roundId]);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const g = c.getContext("2d")!, s = c.width / WORLD;
    g.imageSmoothingEnabled = true; g.drawImage(terrainFor(map).mini, 0, 0, c.width, c.height);
    g.strokeStyle = "rgba(240,153,123,.95)"; g.lineWidth = 2; g.setLineDash([6, 4]);
    g.beginPath(); g.moveTo(map.airship.ax * s, map.airship.ay * s); g.lineTo(map.airship.bx * s, map.airship.by * s); g.stroke(); g.setLineDash([]);
    const ang = Math.atan2(map.airship.by - map.airship.ay, map.airship.bx - map.airship.ax), mx = WORLD / 2 * s + Math.cos(ang) * 60, my = WORLD / 2 * s + Math.sin(ang) * 60;
    g.fillStyle = "#F0997B"; g.beginPath(); g.moveTo(mx + Math.cos(ang) * 8, my + Math.sin(ang) * 8); g.lineTo(mx + Math.cos(ang + 2.5) * 7, my + Math.sin(ang + 2.5) * 7); g.lineTo(mx + Math.cos(ang - 2.5) * 7, my + Math.sin(ang - 2.5) * 7); g.fill();
  }, [map]);
  return (
    <div className="rr-dropmap">
      <canvas ref={ref} width={300} height={300} aria-label="Island map for this round" />
      {map.pois.map(p => {
        const n = counts.get(p.id) ?? 0, on = selected === p.id;
        return (
          <button key={p.id} className={`rr-pin ${on ? "on" : ""}`} style={{ left: `${(p.x / WORLD) * 100}%`, top: `${(p.y / WORLD) * 100}%`, borderColor: FAMILY_COLOR[p.family] }}
            onClick={() => onSelect(on ? null : p.id)} disabled={disabled} aria-pressed={on} aria-label={`Drop at ${p.name}: ${n} Friends plan to land here`}>
            <b style={{ background: FAMILY_COLOR[p.family] }}>{n}</b><span>{p.name}</span>{on && <em>You</em>}
          </button>
        );
      })}
    </div>
  );
}

/** The round's burn as a furnace that fills with every payment, with a "+0.5" for each one. */
function Furnace({ burned, reduced }: { burned: bigint; reduced: boolean }) {
  const prev = useRef(burned);
  const [pops, setPops] = useState<readonly { key: number; text: string }[]>([]);
  useEffect(() => {
    const d = burned - prev.current; prev.current = burned;
    if (d <= 0n || reduced) return;
    const key = performance.now() + Math.random();
    setPops(p => [...p.slice(-3), { key, text: `+${formatRF(d, 2)}` }]);
    const id = window.setTimeout(() => setPops(p => p.filter(x => x.key !== key)), 1300);
    return () => window.clearTimeout(id);
  }, [burned, reduced]);
  // Full at 30 RF, a bit above an average round.
  const fill = Math.min(100, Number(burned * 100n / rf("30")));
  return (
    <div className="rr-furnace" role="status" aria-label={`${formatRF(burned, 1)} RF burned this round`}>
      <i className={`rr-flame ${reduced ? "" : "lit"}`} aria-hidden="true" />
      <div className="rr-furnace-bar" aria-hidden="true"><b style={{ width: `${fill}%` }} /></div>
      <span>{formatRF(burned, 1)} RF burned</span>
      {pops.map(p => <em key={p.key} aria-hidden="true">{p.text}</em>)}
    </div>
  );
}

/** Counts up to a value once, for the results' burn total. */
function CountUp({ value, reduced }: { value: bigint; reduced: boolean }) {
  const [shown, setShown] = useState(reduced ? value : 0n);
  useEffect(() => {
    if (reduced) { setShown(value); return; }
    let raf = 0; const t0 = performance.now();
    const tick = () => {
      const q = Math.min(1, (performance.now() - t0) / 1400), e = 1 - (1 - q) ** 3;
      setShown(value * BigInt(Math.round(e * 1000)) / 1000n);
      if (q < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);
  return <>{formatRF(shown, 1)}</>;
}

/** The last 20 seconds of a finished round, replayed from the recorded ticks with the winner on camera. */
function ReplayFinal({ frames, map, player, paid, artOf, look, reduced, paused, winner, onSounds, onClose }: {
  frames: readonly Frame[]; map: RoundRunner["battle"]["map"]; player: number; paid: readonly boolean[];
  artOf: (f: Readonly<Fighter>) => FriendArt | null; look: () => ArenaLook; reduced: boolean; paused: boolean; winner: string;
  onSounds: (view: ReturnType<ArenaView["view"]>, fs: readonly Readonly<Fighter>[], me: number, paid: readonly boolean[], events: readonly BattleEvent[]) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [run, setRun] = useState(0), [left, setLeft] = useState(20), [done, setDone] = useState(false);
  const pausedRef = useRef(paused); pausedRef.current = paused;
  useEffect(() => {
    const c = ref.current; if (!c || frames.length < 2) return;
    const last = frames.length - 1, start = Math.max(0, last - 20), champ = frames[last].snap.winner;
    const view = createArenaView(c, map, artOf, look);
    let i = start, next = performance.now() + TICK_MS, raf = 0;
    view.push(frames[i].snap, [], Date.now());
    setDone(false);
    const loop = () => {
      const now = performance.now();
      if (pausedRef.current) next = now + TICK_MS;
      else if (now >= next && i < last) {
        i += 1; next = now + TICK_MS;
        view.push(frames[i].snap, frames[i].events, Date.now());
        onSounds(view.view(), frames[i].snap.fighters, player, paid, frames[i].events);
        setLeft(last - i);
        if (i === last) setDone(true);
      }
      view.draw(Date.now(), champ >= 0 ? champ : player, player, reduced);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [run]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="rr-scrim" role="dialog" aria-label="Replay of the final">
      <div className="rr-panel rr-replay">
        <div className="rr-locker-head"><h3><span className="rr-live">Replay</span> The final 20 seconds</h3><span className="rr-muted rr-small">{done ? `${winner} wins` : `${left} s to the end`}</span></div>
        <canvas ref={ref} width={CAM_W} height={CAM_H} className="rr-cam-canvas" aria-label="Replay camera" />
        <div className="rr-row-btns">
          <button className="rr-btn" onClick={() => setRun(n => n + 1)}>Replay again</button>
          <button className="rr-btn rr-primary" onClick={onClose}>Close <kbd>Esc</kbd></button>
        </div>
      </div>
    </div>
  );
}

export default function RareRoyale({ friendId, client, paused }: GameComponentProps) {
  /* ---------- loading: SDK snapshot, the player's Friend ---------- */
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [loadError, setLoadError] = useState(""), [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    client.read().then(() => { if (alive) setReady(true); }).catch(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [client]);

  useEffect(() => {
    let alive = true;
    setMe(null); setLoadError("");
    const pub = createFriendPublicClient();
    Promise.all([
      createFriendReader().read(friendId),
      pub.readContract({ address: GENERATION_SPRITE_MANIFEST.generations, abi: GENERATION_ELIGIBILITY_ABI, functionName: "generation", args: [friendId] }).then(Number, () => 6),
    ]).then(([art, generation]) => {
      if (!alive) return;
      const family = (FAMILIES as readonly string[]).includes(art.familyName) ? art.familyName as Family : "Family";
      const rows = (clip: readonly { rows: readonly string[] }[]) => clip.map(f => f.rows);
      setMe({
        init: { tokenId: friendId, family, generation: Math.min(6, Math.max(1, generation)), seed: art.seed },
        art: { idle: rows(art.familyId === 6 ? art.clips.idle.right : art.clips.idle.down), walkLeft: rows(art.clips.walk.left), walkRight: rows(art.clips.walk.right) },
      });
    }).catch(cause => { if (alive) setLoadError(cause instanceof Error ? cause.message : "Could not load your Friend's artwork."); });
    return () => { alive = false; };
  }, [friendId, attempt]);

  /* ---------- presentation state ---------- */
  const [now, setNow] = useState(() => Date.now());
  const [sched, setSched] = useState<Sched>(() => newSched(Date.now()));
  const schedRef = useRef(sched); schedRef.current = sched;
  // The tutorial pauses the lobby countdown: `frozen` holds the time that was left.
  const [tutorial, setTutorial] = useState<number | null>(0);
  const [frozen, setFrozen] = useState<number | null>(LOBBY_MS);
  const frozenRef = useRef(frozen); frozenRef.current = frozen;
  const battleAt = frozen !== null ? now + frozen : sched.battleAt;
  const clock = { id: sched.id, battleAt, phase: now < battleAt ? "lobby" as const : "battle" as const };
  const [tactic, setTactic] = useState<Tactic>("fight");
  const [drop, setDrop] = useState<string | null>(null);
  const [entered, setEntered] = useState<number | null>(null);
  const [practice, setPractice] = useState(false);
  const [hall, setHall] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [askConfirm, setAskConfirm] = useState<null | (() => void)>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [feed, setFeed] = useState<readonly FeedLine[]>([]);
  const [announcer, setAnnouncer] = useState("Welcome to Rare Royale. Fifty real Friends, one island.");
  const [alerts, setAlerts] = useState<readonly Alert[]>([]);
  const [results, setResults] = useState<Results | null>(null);
  const [target, setTarget] = useState<"you" | "camera">("you");
  const [, setFrame] = useState(0);
  const [toast, setToast] = useState("");
  const ledger = useRef<Ledger>(createLedger(START_BALANCE));
  const session = useRef<Session>({ rounds: 0, best: 0, kos: 0, wins: 0, spent: 0n, nemesis: new Map(), kingmaker: 0, done: new Set() });
  const owned = useRef(new Set<string>());
  const [equipped, setEquipped] = useState<Equipped>({ title: null, aura: null });
  const equippedRef = useRef(equipped); equippedRef.current = equipped;
  const [locker, setLocker] = useState(false);
  const [shoutOpen, setShoutOpen] = useState(false);
  const myShout = useRef<{ text: string; until: number } | null>(null);
  const shoutSeen = useRef(0);
  const [rightTab, setRightTab] = useState<"feed" | "fighters">("feed");
  const pin = useRef(-1);
  const [replay, setReplay] = useState(false);
  const replayLeft = useRef(0);
  const replayRef = useRef(false); replayRef.current = replay;
  const runner = useRef<RoundRunner | null>(null);
  const narrator = useRef<Narrator | null>(null);
  const arena = useRef<ArenaView | null>(null);
  const camCanvas = useRef<HTMLCanvasElement>(null), miniCanvas = useRef<HTMLCanvasElement>(null);
  const focus = useRef({ index: -1, since: 0 });
  const saves = useRef(0);
  const pausedRef = useRef(paused); pausedRef.current = paused;
  const audio = useRef<RoyaleAudio | null>(null);
  const [soundMode, setSoundMode] = useState<"on" | "nomusic" | "off">("on");
  const muted = soundMode === "off";
  const mutedRef = useRef(muted); mutedRef.current = muted;
  const prevStanding = useRef(50), lastWarn = useRef(-1);
  const lastTick = useRef(0);
  const wantedSeen = useRef(-1);
  const musicOffRef = useRef(false);
  const sfx = useCallback((cue: Cue, gain = 1, pan = 0) => { audio.current?.play(cue, { gain, pan }); }, []);

  // Sound starts on the first click or key press inside the game, never before.
  useEffect(() => {
    const a = audio.current = createRoyaleAudio();
    const first = () => { if (!mutedRef.current) void a.unlock(); window.removeEventListener("pointerdown", first, true); window.removeEventListener("keydown", first, true); };
    window.addEventListener("pointerdown", first, true); window.addEventListener("keydown", first, true);
    return () => { window.removeEventListener("pointerdown", first, true); window.removeEventListener("keydown", first, true); a.dispose(); audio.current = null; };
  }, []);
  useEffect(() => { audio.current?.setPaused(paused); }, [paused]);
  /** Sound on → music off → sound off → sound on. */
  const toggleSound = useCallback(() => {
    const mode = soundModeNext(mutedRef.current ? "off" : musicOffRef.current ? "nomusic" : "on");
    setSoundMode(mode); musicOffRef.current = mode === "nomusic";
    audio.current?.setMusic(mode === "on"); audio.current?.setMuted(mode === "off");
    const next = mode === "off";
    if (!next) void audio.current?.unlock().then(() => audio.current?.play("ui"));
  }, []);

  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const upd = () => setReducedMotion(q.matches);
    upd(); q.addEventListener("change", upd);
    return () => q.removeEventListener("change", upd);
  }, []);
  useEffect(() => { void document.fonts?.load("8px Silkscreen"); }, []);
  // A new round: forget the last drop choice.
  useEffect(() => { if (clock.phase === "lobby" && entered !== clock.id) setDrop(null); }, [clock.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const flash = useCallback((text: string) => { setToast(text); window.setTimeout(() => setToast(t => (t === text ? "" : t)), 2600); }, []);
  const alert = useCallback((text: string) => {
    const key = `${Date.now()}:${Math.random()}`;
    setAlerts(a => [...a, { key, text }].slice(-3));
    window.setTimeout(() => setAlerts(a => a.filter(x => x.key !== key)), 3200);
  }, []);

  /* ---------- the round loop ---------- */
  const finishRound = useCallback((r: RoundRunner) => {
    const fighters = r.battle.fighters();
    const st = r.settlement()!;
    const paidOut = fighters.filter(f => st.payouts[f.index].paidRank >= 1 && st.payouts[f.index].paidRank <= st.ladder.length)
      .sort((a, b) => st.payouts[a.index].paidRank - st.payouts[b.index].paidRank)
      .map(f => { const p = st.payouts[f.index]; return { init: f.id, rank: p.paidRank, place: p.place, bounties: p.bounties, total: p.total, you: f.index === r.player, kos: f.kos, weapon: f.weapon }; });
    let you: Results["you"] = null;
    const winner = fighters.find(f => f.place === 1) ?? fighters[0];
    const kingmakers = [...(r.backers.get(winner.index) ?? [])];
    const top = [...r.sponsors.entries()].sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))[0];
    const youKingmaker = kingmakers.includes("You");
    if (youKingmaker) session.current.kingmaker += 1;
    const sponsoredOthers = [...r.backers.entries()].filter(([i, by]) => i !== r.player && by.has("You")).length;
    const pf = r.player >= 0 ? fighters[r.player] : null;
    const facts = {
      entered: !!pf, place: pf?.place ?? 99, kos: pf?.kos ?? 0, tactic: pf?.tactic ?? null, loots: r.log.loots,
      fanSaves: r.log.fanSaves, phaseReached: r.log.phaseReached, sponsoredOthers, won: pf?.place === 1, kingmaker: youKingmaker,
    };
    const unlocked = completedBy(facts, session.current.done).map(c => { session.current.done.add(c.id); return c.title; });
    if (r.player >= 0) {
      const f = fighters[r.player], mine = st.payouts[r.player], isPractice = !r.paid[r.player];
      const prize = mine.total;
      if (st.refunded && !isPractice) ledger.current.refund(ENTRY_PRICE);
      else if (prize > 0n) ledger.current.win(prize);
      // A practice seat: what the same battle would have paid had it been a paid entry.
      const wouldHave = isPractice ? settleRound(fighters.map(x => ({ place: x.place, paid: true, koBy: x.koBy, koCause: x.koCause }))).payouts[r.player].total : 0n;
      audio.current?.play(f.place === 1 || prize >= ENTRY_PRICE || wouldHave >= ENTRY_PRICE ? "win" : "lose");
      const koBy = f.koBy >= 0 ? fighters[f.koBy].id : null;
      const s = session.current;
      s.rounds += 1; s.kos += f.kos; if (f.place === 1) s.wins += 1;
      s.best = s.best ? Math.min(s.best, f.place) : f.place;
      let nemesis = 0;
      if (koBy) { const k = String(koBy.tokenId); nemesis = (s.nemesis.get(k) ?? 0) + 1; s.nemesis.set(k, nemesis); }
      you = {
        place: f.place, practice: isPractice, prize, placePrize: mine.place, bounties: mine.bounties, bountiesWon: mine.bountiesWon, wouldHave,
        kos: f.kos, damage: f.damage, weapon: f.weapon, koBy, koCause: f.koCause, nemesis, saves: saves.current, spent: r.tally.yours + (isPractice ? 0n : ENTRY_PRICE),
      };
    } else audio.current?.play("win", { gain: 0.5 });
    setResults({
      id: r.id, paidOut, you, tally: { ...r.tally }, winner: winner.index === r.player ? "You" : fighterName(winner.id),
      kingmakers, topSponsor: top ? { by: top[0], rf: top[1] } : null, unlocked,
    });
  }, []);

  /** Battle sounds: everything that happens to the player's Friend, plus the nearest action on camera. */
  const soundsOn = useCallback((view: ReturnType<ArenaView["view"]> | undefined, fs: readonly Readonly<Fighter>[], me: number, paid: readonly boolean[], events: readonly BattleEvent[]) => {
    const a = audio.current;
    if (!a || !view) return;
    const near = (i: number) => {
      const f = fs[i]; if (!f) return null;
      const d = Math.hypot(f.x - view.x, f.y - view.y), reach = view.halfWidth * 1.4;
      return d > reach ? null : { gain: 1 - 0.7 * (d / reach), pan: Math.max(-0.8, Math.min(0.8, (f.x - view.x) / view.halfWidth)), d, far: d / reach };
    };
    const shots = events.flatMap(e => (e.kind === "shot" ? [{ e, n: e.from === me || e.to === me ? { gain: 1, pan: 0, d: 0 } : near(e.from) }] : []))
      .filter(x => x.n).sort((x, y) => x.n!.d - y.n!.d).slice(0, 3);
    shots.forEach(({ e, n }, i) => {
      if (e.kind !== "shot") return;
      const far = "far" in n! ? n!.far : 0;
      a.play(`shot-${e.weapon}` as Cue, { gain: n!.gain * (i ? 0.6 : 0.9), pan: n!.pan, far });
      if (i === 0 && !e.blocked && e.dmg + e.armorDmg > 0 && e.to !== me) a.play("hit", { gain: n!.gain * 0.5, pan: n!.pan, far });
    });
    // Whatever reaches the viewer's own Friend, once per tick.
    const atMe = events.find(e => e.kind === "shot" && e.to === me);
    if (atMe && atMe.kind === "shot") a.play(atMe.blocked === "shield" ? "tink" : atMe.blocked ? "whiff" : "hurt", { gain: 0.8 });
    if (events.some(e => e.kind === "storm_hit" && e.who === me)) a.play("zap", { gain: 0.7 });
    let loud = 0;
    for (const e of events) {
      const mine = "who" in e && e.who === me;
      if (e.kind === "zone" && e.shrinking) a.play("zone", { gain: 0.8 });
      else if (e.kind === "jump" && mine) { a.play("jump"); a.play("parachute", { gain: 0.8 }); }
      else if (e.kind === "land" && mine) a.play("land");
      else if (e.kind === "loot" && mine) a.play(e.item === "wand" || e.item === "armor50" ? "pickup-gold" : e.item.startsWith("armor") ? "pickup-armor" : e.item === "bandages" ? "pickup-bandage" : "pickup-weapon", { gain: 0.8 });
      else if (e.kind === "heal" && mine) a.play("heal", { gain: 0.7 });
      else if (e.kind === "decision" && mine) a.play("decision");
      else if (e.kind === "out" && e.by === me && e.cause === "fight" && paid[me] && paid[e.who]) a.play("bounty");
      else if (e.kind === "sponsor" && e.by !== "You" && (mine || near(e.who))) { if (mine) a.play("airdrop"); a.play(e.item === "shield" ? "shield" : e.item === "medkit" ? "heal" : "revive", { gain: mine ? 1 : 0.5, far: mine ? 0 : near(e.who)?.far }); }
      else if ((e.kind === "downed" || e.kind === "out") && loud < 1) {
        const n = mine ? { gain: 1, pan: 0 } : near(e.who);
        if (n) { a.play(e.kind, { gain: n.gain * 0.8, pan: n.pan, far: "far" in n ? n.far : 0 }); loud += 1; }
      }
    }
  }, []);
  const soundsFor = useCallback((rr: RoundRunner, events: readonly BattleEvent[]) => {
    soundsOn(arena.current?.view(), rr.battle.fighters(), rr.player, rr.paid, events);
  }, [soundsOn]);

  /** The viewer's cosmetics as the arena draws them, and the most wanted head on the island. */
  const lookOf = useCallback((): ArenaLook => {
    const sh = myShout.current, rr = runner.current, w = rr && !rr.battle.isOver() ? wantedOf(rr) : { index: -1, head: 0n };
    return {
      aura: equippedRef.current.aura, title: equippedRef.current.title, shout: sh && Date.now() < sh.until ? sh.text : null,
      wanted: w.index, wantedText: w.index >= 0 ? `WANTED ${formatRF(w.head, 1)} RF` : undefined,
    };
  }, []);
  const artOf = useCallback((player: number) => (f: Readonly<Fighter>) => (f.index === player && me ? me.art : rosterArt(f.id.tokenId)), [me]);

  const makeArena = useCallback((rr: RoundRunner) => {
    if (!camCanvas.current) return;
    arena.current = createArenaView(camCanvas.current, rr.battle.map, artOf(rr.player), lookOf);
    arena.current.push(rr.battle.snapshot(), [], Date.now());
  }, [artOf, lookOf]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const t = Date.now(), sc = schedRef.current;
      const c = { id: sc.id, battleAt: frozenRef.current !== null ? t + frozenRef.current : sc.battleAt };
      if (t >= c.battleAt) {
        let r = runner.current;
        if (!r || r.id !== c.id) {
          const seat = entered === c.id && me ? { ...me.init, tactic, drop: drop ?? undefined } : undefined;
          r = runner.current = createRoundRunner(c.id, ROSTER_INITS, seat, practice);
          audio.current?.play("go");
          narrator.current = createNarrator(c.id, r.player, r.battle.map);
          saves.current = 0; shoutSeen.current = 0; pin.current = -1; myShout.current = null; prevStanding.current = ROUND_SIZE; wantedSeen.current = -1;
          focus.current = { index: r.player >= 0 ? r.player : 0, since: t };
          setFeed([]); setResults(null); setTarget(r.player >= 0 ? "you" : "camera");
          makeArena(r);
        }
        const tick = Math.floor((t - c.battleAt) / TICK_MS) + 1;
        const wasOver = r.battle.isOver();
        const events = r.advanceTo(tick);
        if (events.length) {
          const snap = r.battle.snapshot();
          arena.current?.push(snap, events.length > 600 ? events.slice(-300) : events, t);
          const told = narrator.current!.tick(events.length > 600 ? events.slice(-300) : events, r.battle.fighters());
          if (told.feed.length) setFeed(f => [...told.feed.reverse(), ...f].slice(0, 30));
          if (told.announcer) setAnnouncer(told.announcer);
          if (events.length <= 600) soundsFor(r, events);
          for (const e of events.length > 600 ? [] : events) {
            if (e.kind === "out" && e.by === r.player && e.cause === "fight" && r.paid[r.player] && r.paid[e.who]) alert(`Knockout on ${fighterName(r.battle.fighters()[e.who].id)}! ${formatRF(r.bounties.cash[r.player])} RF collected, ${formatRF(r.bounties.head[r.player])} RF on your head`);
            if (e.kind === "sponsor" && e.who === r.player && e.by !== "You") { saves.current += 1; alert(`${e.by} sponsored you: ${SPONSOR_ITEMS[e.item].name}!`); }
            else if (e.kind === "sponsor" && e.by.startsWith("Fan") && e.item === "revive") alert(`${e.by} burned ${formatRF((revivePrice(r.battle.fighters()[e.who].revives - 1) ?? 0n) / 2n)} RF: second life for ${fighterName(r.battle.fighters()[e.who].id)}`);
          }
        }
        // A new most-wanted Friend is announced.
        const w = wantedOf(r);
        if (w.index !== wantedSeen.current) {
          wantedSeen.current = w.index;
          if (w.index >= 0) {
            setAnnouncer(`WANTED: ${w.index === r.player ? "your Friend" : fighterName(r.battle.fighters()[w.index].id)}, ${formatRF(w.head)} RF on the head!`);
            audio.current?.play("bounty", { gain: 0.5 });
          }
        }
        // Fans' shouts go to the announcer.
        for (; shoutSeen.current < r.shouts.length; shoutSeen.current++) {
          const sh = r.shouts[shoutSeen.current];
          if (sh.by !== "You") setAnnouncer(`${sh.by} paid for a shout: "${sh.text}"`);
        }
        if (!wasOver && r.battle.isOver()) finishRound(r);
        if (r.battle.isOver() && !replayRef.current) {
          if (!sc.overAt) setSched(s => (s.id === sc.id && !s.overAt ? { ...s, overAt: t } : s));
          else if (t - sc.overAt > RESULTS_MS) setSched(newSched(t));
        }
        // Director: a Friend the viewer picked, else the player's Friend while it is in the game, else the hottest fight.
        const fs = r.battle.fighters(), cur = fs[focus.current.index];
        const pinned = pin.current >= 0 && fs[pin.current] && fs[pin.current].state !== "out" ? pin.current : -1;
        if (pinned >= 0) focus.current = { index: pinned, since: t };
        else if (r.player >= 0 && fs[r.player].state !== "out") focus.current = { index: r.player, since: t };
        else if (!cur || cur.state === "out" || (t - focus.current.since > 7000 && cur.target < 0)) {
          const score = (f: typeof fs[number]) => (f.state === "downed" ? 50 : 0) + (f.target >= 0 ? 20 : 0) + f.kos * 3 + (f.state === "air" ? -10 : 0);
          const pickF = [...fs].filter(f => f.state !== "out").sort((a, b) => score(b) - score(a))[0];
          if (pickF) focus.current = { index: pickF.index, since: t };
        }
        if (events.length) {
          const snap = r.battle.snapshot(), view = arena.current?.view(), foc = snap.fighters[focus.current.index];
          const shipNear = view && snap.ship.flying ? Math.max(0, 1 - Math.hypot(snap.ship.x - view.x, snap.ship.y - view.y) / (view.halfWidth * 2)) : 0;
          const inStorm = foc && foc.state !== "out" && foc.state !== "air" && Math.hypot(foc.x - snap.zone.cx, foc.y - snap.zone.cy) > snap.zone.r ? 1 : 0;
          audio.current?.setScene(snap.over ? "results" : "battle", 1 - snap.standing / ROUND_SIZE);
          audio.current?.setAmbience(shipNear, inStorm);
          const mine = r.player >= 0 ? snap.fighters[r.player] : null;
          audio.current?.setHeartbeat(!!mine && mine.state === "alive" && !snap.over && mine.hp < mine.maxHp * 0.3);
          // Three beeps before the storm moves; stingers for the top 10 and the final two.
          const left = snap.zone.nextChangeAt - snap.t;
          if (!snap.over && !snap.zone.shrinking && snap.zone.r > 0 && left >= 1 && left <= 3 && lastWarn.current !== snap.t) { lastWarn.current = snap.t; audio.current?.play("warn", { gain: 0.8 }); }
          if (prevStanding.current > 10 && snap.standing <= 10 && !snap.over) {
            audio.current?.play("top10");
            if (mine && mine.state !== "out") alert("Top 10! Your Friend is in the money.");
          }
          if (prevStanding.current > 2 && snap.standing === 2 && !snap.over) audio.current?.play("final");
          prevStanding.current = snap.standing;
        }
        arena.current?.draw(t, focus.current.index, r.player, reducedMotion);
        if (miniCanvas.current) arena.current?.drawMinimap(miniCanvas.current, r.player, t);
      }
      else {
        // Lobby: the last ten seconds tick down.
        audio.current?.setScene("lobby"); audio.current?.setHeartbeat(false);
        const left = Math.ceil((c.battleAt - t) / 1000);
        if (frozenRef.current === null && left !== lastTick.current && left <= 10 && left >= 1) audio.current?.play(left <= 3 ? "tick-hi" : "tick");
        lastTick.current = left;
      }
      setNow(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [entered, practice, me, tactic, drop, reducedMotion, finishRound, alert, makeArena, soundsFor]);

  const r = runner.current;
  const battleNow = clock.phase === "battle" && r?.id === clock.id;
  const screen: "lobby" | "live" | "results" = clock.phase === "lobby" ? "lobby" : battleNow && r.battle.isOver() && results?.id === clock.id ? "results" : "live";
  // The camera canvas remounts on screen changes: attach a fresh view to it.
  useEffect(() => { if (screen === "live" && runner.current) makeArena(runner.current); }, [screen, makeArena]);

  /* ---------- actions ---------- */
  const startNow = useCallback(() => setSched(s => ({ ...s, battleAt: Math.min(s.battleAt, Date.now()) })), []);
  const openTutorial = useCallback(() => {
    const left = schedRef.current.battleAt - Date.now();
    if (frozenRef.current === null && left > 0) setFrozen(left);
    setTutorial(0);
  }, []);
  const closeTutorial = useCallback(() => {
    setTutorial(null);
    const left = frozenRef.current;
    if (left !== null) { setSched(s => ({ ...s, battleAt: Date.now() + left })); setFrozen(null); }
  }, []);
  const withConfirm = useCallback((action: () => void) => {
    if (confirmed) action(); else setAskConfirm(() => action);
  }, [confirmed]);

  const enter = useCallback(() => {
    if (paused || !me || entered === clock.id || clock.phase !== "lobby") return;
    withConfirm(() => {
      if (!ledger.current.canAfford(ENTRY_PRICE)) { flash("Not enough simulated RF. Practice rounds are free."); return; }
      ledger.current.spend("entry", ENTRY_PRICE);
      session.current.spent += ENTRY_PRICE;
      setPractice(false);
      setEntered(schedRef.current.id);
      sfx("enter"); window.setTimeout(() => sfx("burn", 0.6), 350);
      flash("You're in! 0.6 RF to the ladder, 0.2 RF bounty on your head, 0.1 RF burned, 0.1 RF to Friend rewards.");
    });
  }, [paused, me, entered, clock.id, clock.phase, withConfirm, flash, sfx]);
  const enterPractice = useCallback(() => {
    if (paused || !me || entered === clock.id || clock.phase !== "lobby") return;
    setPractice(true);
    setEntered(schedRef.current.id);
    sfx("ui");
    flash("Practice round: same battle, no RF in or out.");
  }, [paused, me, entered, clock.id, clock.phase, flash, sfx]);

  /** Buys a cosmetic (a gameplay payment: 50% burned, 50% rewards) and puts it on. */
  const buyCosmetic = useCallback((c: Cosmetic) => {
    if (paused || owned.current.has(c.id)) return;
    if (!ledger.current.canAfford(c.price)) { flash("Not enough simulated RF."); return; }
    withConfirm(() => {
      ledger.current.spend("cosmetic", c.price);
      session.current.spent += c.price;
      owned.current.add(c.id);
      setEquipped(e => (c.kind === "title" ? { ...e, title: c.name } : { ...e, aura: c.id }));
      const sp = splitPayment("cosmetic", c.price);
      sfx("burn");
      flash(`${c.name}: ${formatRF(sp.burned)} RF burned, ${formatRF(sp.rewards)} RF to Friend rewards.`);
    });
  }, [paused, withConfirm, flash, sfx]);
  const shout = useCallback((text: string) => {
    const rr = runner.current;
    setShoutOpen(false);
    if (paused || !rr || rr.battle.isOver()) return;
    if (myShout.current && Date.now() < myShout.current.until) { flash("One shout at a time."); return; }
    if (!ledger.current.canAfford(SHOUT_PRICE)) { flash("Not enough simulated RF."); return; }
    withConfirm(() => {
      ledger.current.spend("cosmetic", SHOUT_PRICE);
      session.current.spent += SHOUT_PRICE;
      rr.shout(text);
      shoutSeen.current = rr.shouts.length;
      myShout.current = { text, until: Date.now() + 4000 };
      setAnnouncer(`You paid for a shout: "${text}"`);
      sfx("burn", 0.7);
      alert(`You burned ${formatRF(splitPayment("cosmetic", SHOUT_PRICE).burned)} RF on a shout`);
    });
  }, [paused, withConfirm, flash, alert, sfx]);
  /** Follows a Friend with the camera (and makes it the sponsor target); your own Friend returns to normal. */
  const follow = useCallback((i: number) => {
    const rr = runner.current;
    if (!rr) return;
    pin.current = i === rr.player ? -1 : i;
    focus.current = { index: i, since: Date.now() };
    setTarget(i === rr.player ? "you" : "camera");
    sfx("ui", 0.6);
  }, [sfx]);
  const openReplay = useCallback(() => {
    const sc = schedRef.current;
    replayLeft.current = sc.overAt ? sc.overAt + RESULTS_MS - Date.now() : RESULTS_MS;
    setReplay(true); sfx("ui");
  }, [sfx]);
  const closeReplay = useCallback(() => {
    setReplay(false);
    const left = Math.max(8000, replayLeft.current);
    setSched(s => ({ ...s, overAt: Date.now() + left - RESULTS_MS }));
  }, []);

  const targetIndex = (): number => {
    const rr = runner.current;
    if (!rr) return -1;
    return target === "you" && rr.player >= 0 && rr.battle.fighters()[rr.player].state !== "out" ? rr.player : focus.current.index;
  };
  const priceOf = (item: SponsorItemId, who: number): bigint | null => {
    const rr = runner.current;
    if (!rr || who < 0) return null;
    return item === "revive" ? revivePrice(rr.battle.fighters()[who].revives) : SPONSOR_ITEMS[item].price;
  };
  const sponsor = useCallback((item: SponsorItemId) => {
    const rr = runner.current, who = targetIndex();
    if (paused || !rr || who < 0 || rr.battle.isOver()) return;
    const price = priceOf(item, who);
    const check = rr.battle.canSponsor(who, item);
    if (!check.ok || price === null) { flash(check.ok ? "Not available." : check.reason); return; }
    if (!ledger.current.canAfford(price)) { flash("Not enough simulated RF."); return; }
    withConfirm(() => {
      if (!rr.battle.canSponsor(who, item).ok) return;
      ledger.current.spend(item, price);
      session.current.spent += price;
      rr.recordYours(item, price, who);
      rr.battle.sponsor(who, item, "You");
      const s = splitPayment(item, price);
      sfx("burn"); sfx(item === "shield" ? "shield" : item === "medkit" ? "heal" : "revive", 0.8);
      alert(`You burned ${formatRF(s.burned)} RF: ${SPONSOR_ITEMS[item].name} for ${who === rr.player ? "your Friend" : fighterName(rr.battle.fighters()[who].id)}`);
      arena.current?.push(rr.battle.snapshot(), [{ t: rr.battle.snapshot().t, kind: "sponsor", who, item, by: "You" }], Date.now());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, target, withConfirm, flash, alert, sfx]);

  const decide = useCallback((option: 0 | 1) => {
    const rr = runner.current;
    if (paused || !rr || rr.player < 0) return;
    const d = rr.battle.pendingDecision(rr.player);
    if (!d) return;
    rr.battle.decide(rr.player, DECISION_OPTIONS[d.kind][option]);
    setFrame(n => n + 1);
  }, [paused]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (pausedRef.current || e.repeat) return;
      const k = e.key.toLowerCase();
      if (tutorial !== null) {
        if (k === "arrowright" || k === "enter" || k === " ") { if (tutorial >= TUTORIAL.length - 1) closeTutorial(); else setTutorial(tutorial + 1); }
        else if (k === "arrowleft") setTutorial(Math.max(0, tutorial - 1));
        else if (k === "escape") closeTutorial();
        return;
      }
      if (askConfirm) { if (k === "enter") { setConfirmed(true); askConfirm(); setAskConfirm(null); } else if (k === "escape") setAskConfirm(null); return; }
      if (locker) { if (k === "escape" || k === "l") setLocker(false); return; }
      if (replay) { if (k === "escape") closeReplay(); return; }
      if (shoutOpen) {
        if (k === "escape" || k === "y") setShoutOpen(false);
        else if (/^[1-6]$/.test(k)) shout(SHOUTS[Number(k) - 1]);
        return;
      }
      if (k === "h") { setHall(h => !h); return; }
      if (k === "escape") { setHall(false); return; }
      if (hall) return;
      if (screen === "lobby") {
        if (k === "1" || k === "2" || k === "3") setTactic(TACTICS[Number(k) - 1]);
        else if (k === "e" || k === "enter") enter();
        else if (k === "p") enterPractice();
        else if (k === "l") setLocker(true);
      } else if (screen === "live") {
        if (k === "s") sponsor("shield"); else if (k === "m") sponsor("medkit"); else if (k === "r") sponsor("revive");
        else if (k === "t") setTarget(x => (x === "you" ? "camera" : "you"));
        else if (k === "1") decide(0); else if (k === "2") decide(1);
        else if (k === "y") setShoutOpen(true);
        else if (k === "f") setRightTab(x => (x === "feed" ? "fighters" : "feed"));
      } else if (screen === "results") {
        if (k === "v") openReplay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, hall, askConfirm, enter, enterPractice, sponsor, decide, tutorial, closeTutorial, locker, replay, closeReplay, shoutOpen, shout, openReplay]);

  /* ---------- fit the stage to the frame ---------- */
  const [scale, setScale] = useState(1), [tall, setTall] = useState(false);
  useEffect(() => {
    // A portrait frame (phones held upright, via host.css) gets the 480 × 640 portrait layout.
    const fit = () => {
      const portrait = window.innerWidth / window.innerHeight < 0.9;
      setTall(portrait);
      setScale(Math.min(window.innerWidth / (portrait ? 480 : 960), window.innerHeight / 640));
    };
    fit(); window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  /* ---------- hall of fame data ---------- */
  const [supply, setSupply] = useState<number | null | undefined>(undefined);
  const [history, setHistory] = useState<readonly PastRound[]>([]);
  useEffect(() => {
    if (!hall) return;
    let alive = true;
    createFriendPublicClient().readContract({ address: RF_TOKEN, abi: parseAbi(["function totalSupply() view returns (uint256)"]), functionName: "totalSupply" })
      .then(v => { if (alive) setSupply(Number(v / 10n ** 18n)); }, () => { if (alive) setSupply(null); });
    const last = schedRef.current.id - 1, out: PastRound[] = [];
    let i = 0;
    const step = () => {
      if (!alive || i >= HISTORY_ROUNDS) { if (alive) setHistory([...out]); return; }
      out.push(replayRound(last - i, ROSTER_INITS)); i += 1;
      setHistory([...out]);
      window.setTimeout(step, 0);
    };
    step();
    return () => { alive = false; };
  }, [hall]);

  /* ---------- render ---------- */
  const lineupPreview = useMemo(() => lineUp(ROSTER_INITS, clock.id).slice(0, 22), [clock.id]);
  const balance = ledger.current.balance();
  const receipt = ledger.current.receipt();

  if (!ready || (!me && !loadError)) {
    return <div className="rr-root rr-center"><div className="rr-loader" aria-hidden="true" /><p>Loading the island and your Friend…</p></div>;
  }
  if (loadError && !me) {
    return (
      <div className="rr-root rr-center" role="alert">
        <p>Couldn't load your Friend's artwork: {loadError}</p>
        <button className="rr-btn rr-primary" onClick={() => setAttempt(a => a + 1)}>Try again</button>
      </div>
    );
  }
  const mine = me!;
  const myStats = statsFor(mine.init), sig = signatureOf(mine.init.family);
  const snap = battleNow ? r!.battle.snapshot() : null;
  const player = battleNow ? r!.player : -1;
  const myFighter = snap && player >= 0 ? snap.fighters[player] : null;
  const tIndex = battleNow ? targetIndex() : -1;
  const tFighter = snap && tIndex >= 0 ? snap.fighters[tIndex] : null;
  const decision = battleNow && player >= 0 && snap?.fighters[player].state === "alive" ? r!.battle.pendingDecision(player) : null;
  const inRound = entered === clock.id;
  const odds = ODDS.byTactic[tactic];
  const nextIn = sched.overAt ? sched.overAt + RESULTS_MS - now : RESULTS_MS;
  const zone = snap?.zone;
  const zoneText = !snap || snap.over ? null : snap.fighters.every(f => f.state === "air") || snap.t < TUNING.airTicks ? "Drop in progress" : zone!.r <= 0 ? "Final storm" : `${zone!.shrinking ? "Storm moving" : `Circle ${zone!.phase + 1}`} · ${mmss((zone!.nextChangeAt - snap.t) * TICK_MS)}`;
  const dropName = drop ? generateMap(roundSeed(clock.id)).pois.find(p => p.id === drop)?.name : null;

  return (
    <div className={`rr-root ${reducedMotion ? "rr-reduced" : ""} ${tall ? "rr-tall" : ""}`} aria-busy={paused}>
      <div className="rr-stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        <header className="rr-top">
          {screen === "live" ? <span className="rr-live">Live</span> : <span className="rr-brand">Rare royale</span>}
          <span className="rr-round">Round {clock.id}{screen === "live" && snap ? ` · ${snap.standing} / 50 left` : ""}</span>
          <span className="rr-sim" title="Every balance, entry, prize and burn in this preview is simulated">Simulated RF · {rfText(balance)}</span>
          <span className="rr-clock">{screen === "lobby" ? (frozen !== null ? <>Drop in <b>{mmss(frozen)}</b> <small>paused</small></> : <>Drop in <b>{mmss(clock.battleAt - now)}</b></>) : zoneText ? <b className="rr-zone">{zoneText}</b> : <>Next round <b>{mmss(nextIn)}</b></>}</span>
          {screen === "lobby" && frozen === null && <button className="rr-chip" onClick={startNow} disabled={paused}>Start now</button>}
          <button className="rr-chip" onClick={openTutorial}>How to play</button>
          <button className="rr-chip rr-sound" onClick={toggleSound} aria-label={soundMode === "on" ? "Sound on. Switch the music off" : soundMode === "nomusic" ? "Music off. Switch all sound off" : "Sound off. Switch sound on"}>{soundMode === "on" ? "Sound on" : soundMode === "nomusic" ? "Music off" : "Sound off"}</button>
          <button className="rr-chip" onClick={() => setHall(true)} aria-label="Hall of fame (H)">Hall of fame</button>
        </header>

        {screen === "lobby" && (
          <section className="rr-lobby" aria-label="Lobby">
            <div className="rr-panel rr-card">
              <Showcase art={mine.art} reduced={reducedMotion} />
              <h2 className="rr-bebas">{fighterName(mine.init)}</h2>
              {equipped.title && <p className="rr-title-tag">{equipped.title}</p>}
              <p className="rr-muted rr-sub">Gen {mine.init.generation} · {PROFILES[mine.init.family].style}</p>
              {(["might", "speed", "wits"] as const).map(k => (
                <div key={k} className={`rr-stat ${k}`} title={k === "might" ? "HP and damage" : k === "speed" ? "Movement and dodging" : "Accuracy, sight and loot"}>
                  <span>{k === "might" ? "Might" : k === "speed" ? "Speed" : "Wits"}</span>
                  <i>{Array.from({ length: 16 }, (_, n) => <b key={n} className={n < myStats[k] ? "on" : ""} />)}</i><em>{myStats[k]}</em>
                </div>
              ))}
              <p className="rr-sig"><span style={{ background: FAMILY_COLOR[mine.init.family] }}>{sig.name}</span> {sig.text}</p>
              {session.current.nemesis.size > 0 && (() => { const [id, n] = [...session.current.nemesis.entries()].sort((a, b) => b[1] - a[1])[0]; return <p className="rr-nemesis">Nemesis: #{id} ({n}×)</p>; })()}
              <div className="rr-challenges" aria-label="Challenges">
                <h4>Challenges <span>{session.current.done.size} / {CHALLENGES.length}</span></h4>
                {activeChallenges(session.current.done).map(c => <p key={c.id}><i aria-hidden="true" />{c.text} <em>{c.title}</em></p>)}
              </div>
              <button className="rr-btn rr-locker-btn" onClick={() => { sfx("ui"); setLocker(true); }} disabled={paused}>Locker <kbd>L</kbd><small>{equipped.aura ? COSMETICS.find(c => c.id === equipped.aura)?.name : "auras and titles"}</small></button>
            </div>
            <div className="rr-panel rr-mapcard">
              <h3>Choose your drop <span className="rr-muted">{dropName ? `· ${dropName}` : "· or let your tactic choose"}</span></h3>
              <DropMap roundId={clock.id} selected={drop} onSelect={setDrop} disabled={paused} />
              <div className="rr-tactics" role="group" aria-label="Tactic">
                {TACTICS.map(t => (
                  <button key={t} className={`rr-tactic ${tactic === t ? "on" : ""}`} onClick={() => setTactic(t)} aria-pressed={tactic === t} disabled={paused} title={TACTIC_INFO[t].text}>
                    <b>{TACTIC_INFO[t].label}</b> <kbd>{TACTIC_INFO[t].key}</kbd><small>{TACTIC_INFO[t].text}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="rr-panel rr-entry">
              <p className="rr-muted rr-entry-head">Entry <b className="rr-bebas rr-inline">1 RF</b></p>
              <div className="rr-split"><i style={{ width: "60%" }} className="pool" /><i style={{ width: "20%" }} className="bounty" /><i style={{ width: "10%" }} className="burn" /><i style={{ width: "10%" }} className="rew" /></div>
              <p className="rr-legend"><span className="pool">0.6 ladder</span><span className="bounty">0.2 bounty</span><span className="burn">0.1 burn</span><span className="rew">0.1 rewards</span></p>
              <p className="rr-ladder" aria-label="Prize ladder">{FULL_LADDER.slice(0, 5).map((p, i) => <span key={i}><small>{ordinal(i + 1)}</small>{formatRF(p, 1)}</span>)}<span><small>6–10th</small>{formatRF(FULL_LADDER[5], 1)}</span></p>
              <p className="rr-muted rr-small rr-bounty-note">Bounties grow: a knockout pays half the head, the rest joins yours</p>
              <div className="rr-odds" title={`From ${ODDS.rounds.toLocaleString("en-US")} simulated rounds (npm run balance)`}>
                <p className="rr-muted rr-small">Your odds with {TACTIC_INFO[tactic].label}</p>
                <p><b>{pct(odds.back)}</b><small>any RF back</small></p>
                <p><b>{pct(odds.profit)}</b><small>1 RF or more</small></p>
                <p><b>{(odds.win * 100).toFixed(1)}%</b><small>win</small></p>
              </div>
              <button className="rr-btn rr-primary rr-enter" onClick={enter} disabled={paused || inRound}>{inRound ? (practice ? "Practising" : "You're in") : "Enter round · 1 RF"} {!inRound && <kbd>E</kbd>}</button>
              {!inRound && <button className="rr-btn rr-practice" onClick={enterPractice} disabled={paused}>Practice free <kbd>P</kbd></button>}
              <p className="rr-muted rr-small rr-entry-hint">{inRound ? `${TACTIC_INFO[tactic].label}${dropName ? `, dropping at ${dropName}` : ""}. You can still change both.` : "Or just watch and sponsor from the crowd."}</p>
              <div className="rr-arsenal" aria-label="Weapons on the island">
                {(["slingshot", "hammer", "bow", "wand"] as const).map(w => <span key={w} title={`${WEAPONS[w].name}: ${WEAPONS[w].dmg} damage, range ${WEAPONS[w].range}`}><Icon id={w} /></span>)}
                <span title="Armour"><Icon id="armor50" /></span><span title="Bandages"><Icon id="bandages" /></span>
              </div>
            </div>
            <div className="rr-lineup" aria-label="This round's Friends">
              <div className="rr-marquee">{[...lineupPreview, ...lineupPreview].map((f, i) => <Sprite key={`${String(f.tokenId)}:${i}`} rows={rosterArt(f.tokenId)?.idle[0] ?? null} size={36} />)}</div>
              <span className="rr-muted">50 real Friends · {inRound && practice ? 49 : 50} paid entries (simulated)</span>
            </div>
          </section>
        )}

        {screen === "live" && (
          <section className="rr-live-screen" aria-label="Live battle">
            <div className="rr-cam">
              <canvas ref={camCanvas} width={CAM_W} height={CAM_H} className="rr-cam-canvas" aria-label="Arena camera" />
              <canvas ref={miniCanvas} width={110} height={110} className="rr-mini" aria-label="Island map" />
              <span className="rr-cam-label">{pin.current >= 0 && snap?.fighters[pin.current] && snap.fighters[pin.current].state !== "out" ? `Cam 3 · following #${snap.fighters[pin.current].id.tokenId}` : myFighter && myFighter.state !== "out" ? "Cam 1 · your Friend" : "Cam 2 · the action"}</span>
              {pin.current >= 0 && snap?.fighters[pin.current]?.state !== "out" && myFighter && myFighter.state !== "out" && <button className="rr-chip rr-back" onClick={() => follow(player)}>Back to you</button>}
              {decision && (
                <div className="rr-decision" role="dialog" aria-label={DECISION_TEXT[decision.kind].title}>
                  <b>{DECISION_TEXT[decision.kind].title}</b>
                  <div>
                    <button className="rr-btn rr-primary" onClick={() => decide(0)}>{DECISION_TEXT[decision.kind].a} <kbd>1</kbd></button>
                    <button className="rr-btn" onClick={() => decide(1)}>{DECISION_TEXT[decision.kind].b} <kbd>2</kbd></button>
                  </div>
                  <small>{mmss((decision.deadline + 1 - (snap?.t ?? 0)) * TICK_MS)} to decide · otherwise your tactic decides</small>
                </div>
              )}
              <div className="rr-alerts" aria-live="polite">{alerts.map(a => <p key={a.key}>{a.text}</p>)}</div>
            </div>
            <aside className="rr-feed" aria-label={rightTab === "feed" ? "Kill feed" : "Fighters"} aria-live="off">
              <div className="rr-tabs" role="tablist">
                <button role="tab" aria-selected={rightTab === "feed"} className={rightTab === "feed" ? "on" : ""} onClick={() => { sfx("tab"); setRightTab("feed"); }}>Feed</button>
                <button role="tab" aria-selected={rightTab === "fighters"} className={rightTab === "fighters" ? "on" : ""} onClick={() => { sfx("tab"); setRightTab("fighters"); }}>Fighters {snap ? snap.standing : ""} <kbd>F</kbd></button>
              </div>
              {rightTab === "fighters" && snap && (
                <div className="rr-fighters" role="list">
                  {[...snap.fighters].filter(f => f.state !== "out").sort((a, b) => (a.index === player ? -1 : b.index === player ? 1 : 0) || (a.state === "downed" ? 1 : 0) - (b.state === "downed" ? 1 : 0) || b.kos - a.kos || b.hp - a.hp).map(f => (
                    <button key={f.index} role="listitem" className={`rr-frow ${f.index === focus.current.index ? "on" : ""} ${f.index === player ? "me" : ""}`} onClick={() => follow(f.index)} aria-label={`Follow ${f.index === player ? "your Friend" : fighterName(f.id)}`}>
                      <Sprite rows={(f.index === player ? mine.art : rosterArt(f.id.tokenId))?.idle[0] ?? null} size={18} />
                      <b>{f.index === player ? "You" : `#${f.id.tokenId}`}</b>
                      <i><b style={{ width: `${Math.max(0, f.hp / f.maxHp) * 100}%`, background: f.state === "downed" ? "var(--red)" : undefined }} /></i>
                      <em>{f.state === "downed" ? "down" : f.state === "air" ? "air" : `${f.kos} KO`}{r && r.bounties.head[f.index] > BOUNTY ? <u> {formatRF(r.bounties.head[f.index], 1)}</u> : null}</em>
                    </button>
                  ))}
                </div>
              )}
              {rightTab === "feed" && feed.slice(0, 9).map(l => (
                <p key={l.key} className={`rr-line ${l.tone}`}>
                  {l.who >= 0 && snap ? <Sprite rows={(l.who === player ? mine.art : rosterArt(snap.fighters[l.who].id.tokenId))?.idle[0] ?? null} size={22} /> : <span className="rr-dot" />}
                  <span>{l.text}</span>
                  {l.icon && <Icon id={l.icon} scale={1} />}
                </p>
              ))}
            </aside>
            <div className="rr-ticker"><span>Announcer</span><p>{announcer}</p></div>
            <div className="rr-dock">
              <button className="rr-chip rr-target" onClick={() => setTarget(x => (x === "you" ? "camera" : "you"))} disabled={player < 0} aria-label="Switch sponsor target (T)">
                For: {tFighter ? (tIndex === player ? "your Friend" : fighterName(tFighter.id)) : "—"}
              </button>
              {(["shield", "medkit", "revive"] as const).map(item => {
                const price = priceOf(item, tIndex), ok = !!r && tIndex >= 0 && r.battle.canSponsor(tIndex, item).ok;
                return (
                  <button key={item} className={`rr-btn rr-buy ${item} ${item === "revive" && tFighter?.state === "downed" ? "rr-hot" : ""}`} onClick={() => sponsor(item)} disabled={paused || !ok}>
                    <Icon id={item} scale={1} /> {SPONSOR_ITEMS[item].name} {price !== null ? formatRF(price) : "—"} <kbd>{item === "shield" ? "S" : item === "medkit" ? "M" : "R"}</kbd>
                  </button>
                );
              })}
              <button className="rr-btn rr-buy shout" onClick={() => setShoutOpen(o => !o)} disabled={paused || !r || r.battle.isOver()} aria-expanded={shoutOpen}>Shout {formatRF(SHOUT_PRICE)} <kbd>Y</kbd></button>
              {r && <Furnace burned={r.tally.burned} reduced={reducedMotion} />}
            </div>
            {shoutOpen && (
              <div className="rr-shouts" role="menu" aria-label="Pick a shout">
                {SHOUTS.map((line, i) => <button key={line} role="menuitem" className="rr-chip" onClick={() => shout(line)}>{line} <kbd>{i + 1}</kbd></button>)}
              </div>
            )}
            <p className="rr-dock-note">{snap && !snap.windowOpen ? `Sponsoring closed: the final ${TUNING.sponsorWindowMin} are on their own.` : "Every sponsor payment: 50% burned, 50% to active Friend rewards. Simulated."}</p>
            {myFighter && (
              <div className="rr-mine">
                <span>You</span>
                <i><b className="hp" style={{ width: `${Math.max(0, myFighter.hp / myFighter.maxHp) * 100}%` }} /><b className="ar" style={{ width: `${(myFighter.armor / 50) * 100}%` }} /></i>
                <em>{myFighter.state === "out" ? `Out · ${ordinal(myFighter.place)}` : myFighter.state === "downed" ? "Down!" : myFighter.state === "air" ? "In the air" : `${Math.max(0, Math.round(myFighter.hp))} HP${myFighter.armor ? ` · ${myFighter.armor} armour` : ""}`}</em>
                <small><Icon id={myFighter.weapon} scale={1} /> {WEAPONS[myFighter.weapon].name}{myFighter.bandages ? ` · ${myFighter.bandages} bandages` : ""}{myFighter.kos ? ` · ${myFighter.kos} KO` : ""}{r?.paid[player] && myFighter.state !== "out" ? ` · head ${formatRF(r.bounties.head[player], 1)} RF` : ""}{r?.paid[player] && r.bounties.cash[player] > 0n ? ` · +${formatRF(r.bounties.cash[player], 2)} RF` : ""} · {myFighter.mode}</small>
              </div>
            )}
            {!inRound && <p className="rr-spectating">Watching round {clock.id}. Enter the next one in the lobby.</p>}
            {inRound && practice && <p className="rr-spectating rr-practice-live">Practice round: no RF in or out.</p>}
          </section>
        )}

        {screen === "results" && results && (
          <section className="rr-results" aria-label="Round results">
            <div className="rr-panel rr-podium">
              <h3>Round {results.id} · final <button className="rr-chip rr-replay-btn" onClick={openReplay}>▶ Replay the final <kbd>V</kbd></button></h3>
              <div className="rr-steps">
                {[1, 0, 2].map(i => results.paidOut[i] && (
                  <div key={i} className={`rr-step p${i + 1}`}>
                    <Sprite rows={(results.paidOut[i].you ? mine.art : rosterArt(results.paidOut[i].init.tokenId))?.idle[0] ?? null} size={i === 0 ? 72 : 56} />
                    <div className="rr-block"><b>{i + 1}</b></div>
                    <p>{results.paidOut[i].you ? "You" : fighterName(results.paidOut[i].init)}</p>
                    <p className="rr-muted rr-small"><Icon id={results.paidOut[i].weapon} scale={1} /> {results.paidOut[i].kos} KO</p>
                    <p className="rr-prize">+{rfText(results.paidOut[i].total)}</p>
                  </div>
                ))}
              </div>
              <ol className="rr-rest" start={4}>
                {results.paidOut.slice(3).map(p => (
                  <li key={String(p.init.tokenId)} className={p.you ? "you" : ""}><span>{p.rank}</span><b>{p.you ? "You" : `#${p.init.tokenId}`}</b><em>+{formatRF(p.total, 1)}</em></li>
                ))}
              </ol>
            </div>
            <div className="rr-panel rr-yours">
              {results.you ? (
                <>
                  <p className="rr-muted">Your place</p>
                  <p className="rr-bebas rr-huge">{ordinal(results.you.place)} <span>of 50</span></p>
                  {results.you.practice
                    ? <p className="rr-win rr-practice-note">Practice round. As a paid entry this would have paid {rfText(results.you.wouldHave)}.</p>
                    : results.you.prize > 0n
                      ? <p className="rr-win">You won {rfText(results.you.prize)} (simulated): {[results.you.placePrize > 0n ? `${rfText(results.you.placePrize)} for ${ordinal(results.you.place)} place` : "", results.you.bounties > 0n ? `${rfText(results.you.bounties)} in bounties` : ""].filter(Boolean).join(" + ")}</p>
                      : <p className="rr-muted">No RF this time. The top 10 and every knockout pay.</p>}
                  <p>{results.you.kos} knockout{results.you.kos === 1 ? "" : "s"} · {results.you.damage} damage · {WEAPONS[results.you.weapon as keyof typeof WEAPONS]?.name ?? "Fists"} · {results.you.saves} fan saves</p>
                  {results.you.koBy && <p className="rr-nemesis">Out to {fighterName(results.you.koBy)}{results.you.nemesis > 1 ? `, ${results.you.nemesis}× this session. Nemesis!` : ""}</p>}
                  {!results.you.koBy && results.you.place > 1 && <p className="rr-muted">Out to the {results.you.koCause === "storm" ? "storm" : "arena"}.</p>}
                </>
              ) : <p className="rr-muted">You watched this round. Enter the next one in the lobby.</p>}
              {results.kingmakers.includes("You") && <p className="rr-king">Kingmaker! You sponsored {results.winner}.</p>}
              {results.unlocked.length > 0 && <p className="rr-unlocked">Title{results.unlocked.length > 1 ? "s" : ""} unlocked: {results.unlocked.join(", ")}. Put {results.unlocked.length > 1 ? "them" : "it"} on in the Locker.</p>}
            </div>
            <div className="rr-panel rr-burn">
              <p className="rr-muted">Burned this round</p>
              <p className="rr-bebas rr-mid rr-amber rr-embers"><CountUp value={results.tally.burned} reduced={reducedMotion} /> RF</p>
              <p className="rr-row"><span>Entries ({results.tally.paid} × 1 RF)</span><span>{rfText(results.tally.entries)}</span></p>
              <p className="rr-row"><span>Crowd sponsors (simulated)</span><span>{rfText(results.tally.crowd)}</span></p>
              <p className="rr-row"><span>Your sponsors</span><span>{rfText(results.tally.yours)}</span></p>
              <p className="rr-row"><span>Bounties burned by the storm</span><span>{rfText(results.tally.bountyBurned)}</span></p>
              <p className="rr-row"><span>To Friend rewards</span><span>{rfText(results.tally.rewards)}</span></p>
              {results.topSponsor && <p className="rr-row rr-row-extra"><span>Top sponsor: {results.topSponsor.by}</span><span>{rfText(results.topSponsor.rf)}</span></p>}
              <p className="rr-row rr-row-extra"><span>Kingmakers (backed the winner)</span><span>{results.kingmakers.length ? results.kingmakers.slice(0, 3).join(", ") + (results.kingmakers.length > 3 ? ` +${results.kingmakers.length - 3}` : "") : "none"}</span></p>
            </div>
            <p className="rr-next">Next lobby opens in <b>{mmss(nextIn)}</b> <button className="rr-btn rr-primary" onClick={() => { sfx("ui"); setSched(newSched(Date.now())); }}>Next round now</button></p>
          </section>
        )}

        {hall && (
          <section className="rr-hall" role="dialog" aria-label="Hall of fame">
            <header><h2 className="rr-bebas">Hall of fame</h2><button className="rr-chip" onClick={() => setHall(false)}>Close (Esc)</button></header>
            <div className="rr-tiles">
              <div className="rr-tile live"><small>RF burned to date · live on-chain</small><b>{supply === undefined ? "…" : supply === null ? "unavailable" : `${Math.round((RF_INITIAL_SUPPLY - supply) / 1e5) / 10}M`}</b><em>{supply ? `supply ${(supply / 1e6).toFixed(2)}M of 1,024M` : "totalSupply of the RF token"}</em></div>
              <div className="rr-tile"><small>Burned in the last {HISTORY_ROUNDS} rounds · simulated</small><b>{rfText(history.reduce((a, h) => a + h.burned, 0n))}</b><em>{history.length ? `${formatRF(history.reduce((a, h) => a + h.burned, 0n) / BigInt(history.length), 1)} RF per round` : "replaying…"}</em></div>
              <div className="rr-tile"><small>You burned this session</small><b>{rfText(receipt.burned)}</b><em>+{rfText(receipt.rewards)} to rewards</em></div>
              <div className="rr-tile"><small>Your session</small><b>{session.current.rounds} round{session.current.rounds === 1 ? "" : "s"}</b><em>best {session.current.best ? ordinal(session.current.best) : "—"} · {session.current.kos} KO · won {rfText(receipt.won)}{session.current.kingmaker ? ` · Kingmaker ×${session.current.kingmaker}` : ""}</em></div>
            </div>
            <div className="rr-hall-body">
              <div className="rr-panel">
                <h3>Burned per round · last {HISTORY_ROUNDS} rounds</h3>
                <div className="rr-bars">
                  {[...history].reverse().map(h => { const max = Math.max(1, ...history.map(x => Number(x.burned / 10n ** 16n))); return <i key={h.id} title={`Round ${h.id}: ${formatRF(h.burned)} RF`} style={{ height: `${(Number(h.burned / 10n ** 16n) / max) * 100}%` }} />; })}
                </div>
              </div>
              <div className="rr-panel">
                <h3>Champions · last {HISTORY_ROUNDS} rounds</h3>
                {history.slice(0, 7).map(h => (
                  <p key={h.id} className="rr-champ">
                    <Sprite rows={rosterArt(h.winner.tokenId)?.idle[0] ?? null} size={24} />
                    <span>Round {h.id}</span><b style={{ color: FAMILY_COLOR[h.winner.family] }}>{fighterName(h.winner)}</b><em>{h.winnerKos} KO · +{formatRF(h.winnerPrize, 1)}</em>
                  </p>
                ))}
              </div>
            </div>
            <p className="rr-muted rr-small">Fighters are {ROSTER.length} real hardwired Generations Friends, sampled from the chain. Past rounds replay from their seeds, the same for everyone.</p>
          </section>
        )}

        {tutorial !== null && (
          <div className="rr-scrim" role="dialog" aria-label="How to play">
            <div className="rr-panel rr-tutorial">
              <div className="rr-tut-head"><Icon id={TUTORIAL[tutorial].icon} scale={3} /><div><small>How to play · {tutorial + 1} / {TUTORIAL.length}</small><h3>{TUTORIAL[tutorial].title}</h3></div></div>
              {TUTORIAL[tutorial].lines.map(l => <p key={l}>{l}</p>)}
              <div className="rr-tut-dots" aria-hidden="true">{TUTORIAL.map((_, i) => <i key={i} className={i === tutorial ? "on" : ""} />)}</div>
              <div className="rr-row-btns">
                <button className="rr-btn" onClick={closeTutorial}>Skip</button>
                {tutorial > 0 && <button className="rr-btn" onClick={() => setTutorial(tutorial - 1)}>Back</button>}
                <button className="rr-btn rr-primary" onClick={() => { sfx("ui"); if (tutorial >= TUTORIAL.length - 1) closeTutorial(); else setTutorial(tutorial + 1); }}>{tutorial >= TUTORIAL.length - 1 ? "Let's go" : "Next"} <kbd>Enter</kbd></button>
              </div>
              <p className="rr-muted rr-small">The lobby countdown is paused while you read.</p>
            </div>
          </div>
        )}
        {locker && (
          <div className="rr-scrim" role="dialog" aria-label="Locker">
            <div className="rr-panel rr-locker">
              <div className="rr-locker-head"><h3>Locker</h3><span className="rr-sim">Simulated RF · {rfText(balance)}</span></div>
              <p className="rr-muted rr-small">Looks for your Friend. They never change the fight. Every purchase: 50% burned, 50% to active Friend rewards.</p>
              <div className="rr-locker-grid">
                <section>
                  <h4>Auras</h4>
                  {COSMETICS.filter(c => c.kind === "aura").map(c => {
                    const has = owned.current.has(c.id), on = equipped.aura === c.id;
                    return (
                      <div key={c.id} className={`rr-item ${on ? "on" : ""}`}>
                        <i className={`rr-swatch ${c.id}`} aria-hidden="true" /><div><b>{c.name}</b><small>{c.text}</small></div>
                        {has ? <button className="rr-btn" onClick={() => setEquipped(e => ({ ...e, aura: on ? null : c.id }))} aria-pressed={on}>{on ? "On ✓" : "Wear"}</button>
                          : <button className="rr-btn rr-primary" onClick={() => buyCosmetic(c)} disabled={paused}>{formatRF(c.price)} RF</button>}
                      </div>
                    );
                  })}
                </section>
                <section>
                  <h4>Titles</h4>
                  {[...COSMETICS.filter(c => c.kind === "title").map(c => ({ name: c.name, buy: c, how: "" })),
                    ...CHALLENGES.map(c => ({ name: c.title, buy: null as Cosmetic | null, how: session.current.done.has(c.id) ? "" : c.text }))].map(t => {
                    const has = t.buy ? owned.current.has(t.buy.id) : !t.how, on = equipped.title === t.name;
                    return (
                      <div key={t.name} className={`rr-item rr-titlerow ${on ? "on" : ""} ${!has && !t.buy ? "locked" : ""}`}>
                        <span className="rr-title-tag">{t.name}</span><small>{t.buy ? "" : has ? "Earned" : t.how}</small>
                        {has ? <button className="rr-btn" onClick={() => setEquipped(e => ({ ...e, title: on ? null : t.name }))} aria-pressed={on}>{on ? "On ✓" : "Wear"}</button>
                          : t.buy ? <button className="rr-btn rr-primary" onClick={() => buyCosmetic(t.buy!)} disabled={paused}>{formatRF(t.buy.price)} RF</button>
                            : <span className="rr-lock">Challenge</span>}
                      </div>
                    );
                  })}
                </section>
              </div>
              <div className="rr-row-btns"><button className="rr-btn" onClick={() => setLocker(false)}>Close <kbd>Esc</kbd></button></div>
            </div>
          </div>
        )}
        {replay && r && (
          <ReplayFinal frames={r.frames} map={r.battle.map} player={r.player} paid={r.paid} artOf={artOf(r.player)} look={lookOf}
            reduced={reducedMotion} paused={paused} winner={results?.winner ?? ""} onSounds={soundsOn} onClose={closeReplay} />
        )}
        {askConfirm && (
          <div className="rr-scrim" role="dialog" aria-label="Simulated RF">
            <div className="rr-panel rr-confirm">
              <h3>Simulated RF</h3>
              <p>This preview never asks for a transaction. Balances, entries, prizes and burns are simulated.</p>
              <p>Live, every entry would send 0.6 RF to the round's top-10 ladder and 0.2 RF to the bounty on your head, burn 0.1 RF and fund 0.1 RF of active Friend rewards. Every sponsor payment would burn 50% and fund 50% rewards. Prizes are paid only from paid entries.</p>
              <div className="rr-row-btns">
                <button className="rr-btn rr-primary" onClick={() => { setConfirmed(true); askConfirm(); setAskConfirm(null); }}>Got it <kbd>Enter</kbd></button>
                <button className="rr-btn" onClick={() => setAskConfirm(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
        {toast && <p className="rr-toast" role="status">{toast}</p>}
        <label className="rr-motion"><input type="checkbox" checked={reducedMotion} onChange={e => setReducedMotion(e.target.checked)} /> Reduced motion</label>
      </div>
    </div>
  );
}
