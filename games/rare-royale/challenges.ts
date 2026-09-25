/** Session challenges: goals for every round, win or lose. Each one unlocks a free title (no RF, no effect on
 * the fight). Progress lasts for the session, like everything else in the SDK sandbox. */

import type { Tactic } from "./engine/index.ts";

/** What the player did in one round, as the challenges need it. */
export type RoundFacts = Readonly<{
  entered: boolean; place: number; kos: number; tactic: Tactic | null; loots: number;
  fanSaves: number; phaseReached: number; sponsoredOthers: number; won: boolean; kingmaker: boolean;
}>;

export type Challenge = Readonly<{ id: string; text: string; title: string; test: (f: RoundFacts) => boolean }>;

export const CHALLENGES: readonly Challenge[] = [
  { id: "top10", text: "Finish in the top 10", title: "Contender", test: f => f.entered && f.place <= 10 },
  { id: "ko2", text: "Knock out 2 Friends in one round", title: "Brawler", test: f => f.entered && f.kos >= 2 },
  { id: "patron", text: "Sponsor another Friend", title: "Patron", test: f => f.sponsoredOthers >= 1 },
  { id: "loot5", text: "Pick up 5 items in one round", title: "Scavenger", test: f => f.entered && f.loots >= 5 },
  { id: "circle4", text: "Survive into the 4th circle", title: "Survivor", test: f => f.entered && f.phaseReached >= 3 },
  { id: "ghost", text: "Reach the top 10 with Hide", title: "Ghost", test: f => f.entered && f.tactic === "hide" && f.place <= 10 },
  { id: "saved", text: "Get saved by a fan", title: "Crowd Favourite", test: f => f.entered && f.fanSaves >= 1 },
  { id: "kingmaker", text: "Sponsor the Friend who wins", title: "Kingmaker", test: f => f.kingmaker },
  { id: "win", text: "Win a round", title: "Champion", test: f => f.entered && f.won },
];

/** The three challenges on show: the first ones not done yet, in order. */
export const activeChallenges = (done: ReadonlySet<string>, count = 3) => CHALLENGES.filter(c => !done.has(c.id)).slice(0, count);

/** Checks a finished round against every open challenge and returns the ones it completed. */
export const completedBy = (facts: RoundFacts, done: ReadonlySet<string>) => CHALLENGES.filter(c => !done.has(c.id) && c.test(facts));
