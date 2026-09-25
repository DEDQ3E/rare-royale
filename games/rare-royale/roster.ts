/** The baked roster of real, hardwired Generations Friends (scripts/roster.ts) and sprite helpers. */

import data from "./roster.json";
import { FAMILIES, type Family, type FighterInit } from "./engine/index.ts";

/** 16 rows of 16 characters, "#" for the Friend's pixels. */
export type SpriteRows = readonly string[];
export type FriendArt = Readonly<{ idle: readonly SpriteRows[]; walkLeft: readonly SpriteRows[]; walkRight: readonly SpriteRows[] }>;
export type RosterFriend = Readonly<{ init: FighterInit; art: FriendArt }>;

/** Bit 0 is the top-left pixel, bit 255 the bottom-right, as in the SDK's sprite registry. */
export function rowsFromBitmap(bitmap: bigint): SpriteRows {
  return Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => (bitmap >> BigInt(y * 16 + x)) & 1n ? "#" : ".").join(""));
}

type RawFriend = { id: string; gen: number; family: string; seed: number; frames: string[]; idle: number[]; walkLeft: number[]; walkRight: number[] };

export const ROSTER: readonly RosterFriend[] = (data.friends as RawFriend[])
  .filter(f => (FAMILIES as readonly string[]).includes(f.family))
  .map(f => {
    const frames = f.frames.map(h => rowsFromBitmap(BigInt(`0x${h}`)));
    return {
      init: { tokenId: BigInt(f.id), family: f.family as Family, generation: f.gen, seed: f.seed },
      art: { idle: f.idle.map(i => frames[i]), walkLeft: f.walkLeft.map(i => frames[i]), walkRight: f.walkRight.map(i => frames[i]) },
    };
  });

export const ROSTER_INITS: readonly FighterInit[] = ROSTER.map(f => f.init);
export const ROSTER_SOURCE = data.source;

const artById = new Map(ROSTER.map(f => [f.init.tokenId, f.art]));
export const rosterArt = (tokenId: bigint) => artById.get(tokenId) ?? null;

/** Family nameplate colours: the canonical sprites stay black and white, the plate tells families apart. */
export const FAMILY_COLOR: Readonly<Record<Family, string>> = {
  Skeleton: "#D3D1C7", Mask: "#ED93B1", Family: "#F0997B", Cellular: "#97C459", Asymmetry: "#EF9F27",
  Hoverer: "#85B7EB", Colossus: "#AFA9EC", Sparkling: "#FAC775", Hollow: "#5DCAA5",
};

export const fighterName = (init: Readonly<{ family: string; tokenId: bigint }>) => `${init.family} #${init.tokenId}`;
