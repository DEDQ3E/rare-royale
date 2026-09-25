/** Round schedule and line-ups. Round numbers come from the clock, so every viewer is in the same round, sees the
 * same 50 Friends from the baked roster and the same base battle, with no server. */

import { hash32, createRng } from "./rng.ts";
import type { FighterInit } from "./battle.ts";

/** A new round every five minutes: 60 s lobby, then the battle, then results until the next lobby. */
export const ROUND_MS = 300_000;
export const LOBBY_MS = 60_000;
export const ROUND_SIZE = 50;
/** Round 0 starts at the vibeathon's opening. */
export const EPOCH_MS = Date.UTC(2026, 8, 20, 0, 0, 0);

export type RoundPhase = "lobby" | "battle";
export type RoundClock = Readonly<{ id: number; startsAt: number; battleAt: number; nextAt: number; phase: RoundPhase }>;

export function roundAt(nowMs: number): RoundClock {
  const id = Math.floor((nowMs - EPOCH_MS) / ROUND_MS);
  const startsAt = EPOCH_MS + id * ROUND_MS, battleAt = startsAt + LOBBY_MS;
  return { id, startsAt, battleAt, nextAt: startsAt + ROUND_MS, phase: nowMs < battleAt ? "lobby" : "battle" };
}

export const roundSeed = (id: number) => hash32("rare-royale", 1, id);

/** Rounds start from the viewer's arrival: a 60 s lobby, then the drop. The round is named after the minute of its
 * drop, so viewers whose drops fall in the same minute get the same island, line-up and base battle. */
export const SLOT_MS = 60_000;
export const slotId = (dropAtMs: number) => Math.floor((dropAtMs - EPOCH_MS) / SLOT_MS);

/** The round's line-up: ROUND_SIZE Friends from the roster in a seeded order, tactics included. */
export function lineUp(roster: readonly FighterInit[], id: number, size = ROUND_SIZE): FighterInit[] {
  const rng = createRng(roundSeed(id)).fork("lineup");
  const tactics = ["fight", "hide", "loot"] as const;
  return rng.shuffle(roster).slice(0, size).map(f => ({ ...f, tactic: rng.pick(tactics) }));
}

/** Puts the player's Friend into the line-up: its own seat if it is already there, else a seeded seat.
 * Returns the line-up and the player's fighter index. */
export function withPlayer(line: readonly FighterInit[], player: FighterInit, id: number): { fighters: FighterInit[]; index: number } {
  const fighters = [...line];
  let index = fighters.findIndex(f => f.tokenId === player.tokenId);
  if (index < 0) index = createRng(roundSeed(id)).fork("player-seat").int(fighters.length);
  fighters[index] = player;
  return { fighters, index };
}
