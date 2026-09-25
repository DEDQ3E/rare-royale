/** Broadcast text: the kill feed and the announcer, in each family's voice. Presentation only. */

import { hash32, WEAPONS, type BattleEvent, type Family, type Fighter, type GameMap, type LootId } from "./engine/index.ts";
import { fighterName } from "./roster.ts";

export type FeedTone = "ko" | "sponsor" | "loot" | "info" | "you" | "win" | "zone";
export type FeedLine = Readonly<{ key: string; t: number; who: number; text: string; tone: FeedTone; icon?: string }>;

const TAUNT: Readonly<Record<Family, readonly string[]>> = {
  Skeleton: ["Rattle rattle.", "Bone dry.", "Night shift's over."],
  Mask: ["Take a bow!", "Encore!", "And scene."],
  Family: ["Nothing personal, cousin.", "Home team wins.", "Dinner's on me."],
  Cellular: ["Divide and conquer.", "Still hungry.", "Nom."],
  Asymmetry: ["Zig! Zag! Gotcha!", "Too slow!", "Wheee!"],
  Hoverer: ["Floating like a dream.", "Sweet dreams.", "Up and away."],
  Colossus: ["Slow and steady.", "Big paws.", "Sit down, little one."],
  Sparkling: ["Dazzled, darling?", "Shine on.", "Fabulous."],
  Hollow: ["...Quietly done.", "Shh.", "Back to my corner."],
};
const LOOT_TEXT: Readonly<Record<LootId, string>> = {
  fists: "fists", slingshot: "a slingshot", hammer: "a hammer", bow: "a bow", wand: "a star wand",
  armor20: "light armour", armor35: "armour", armor50: "heavy armour", bandages: "bandages",
};
const pick = <T,>(items: readonly T[], ...key: (string | number)[]) => items[hash32(...key) % items.length];

export type Narrator = Readonly<{
  tick(events: readonly BattleEvent[], fighters: readonly Readonly<Fighter>[]): { feed: FeedLine[]; announcer: string | null };
}>;

export function createNarrator(round: number, player: number, map: GameMap): Narrator {
  const name = (f: Readonly<Fighter>) => (f.index === player ? "You" : fighterName(f.id));
  const poiName = (id: string | null) => map.pois.find(p => p.id === id)?.name ?? "the wilds";
  const landed = new Map<string, number>();
  let n = 0;
  return {
    tick(events, fighters) {
      const feed: FeedLine[] = [];
      let say: { p: number; text: string } | null = null;
      const announce = (p: number, text: string) => { if (!say || p > say.p) say = { p, text }; };
      const line = (t: number, who: number, text: string, tone: FeedTone, icon?: string) =>
        feed.push({ key: `${round}:${n++}`, t, who, text, tone: who === player && tone !== "win" && tone !== "sponsor" ? "you" : tone, icon });
      for (const e of events) {
        switch (e.kind) {
          case "jump": if (e.who === player) { line(e.t, e.who, "You jumped from the airship!", "info"); announce(7, "You're in the air! Gliding down…"); } break;
          case "land": {
            const k = e.poi ?? "wild", c = (landed.get(k) ?? 0) + 1;
            landed.set(k, c);
            if (e.poi && c === 6) announce(6, `Hot drop! ${c} Friends landed at ${poiName(e.poi)}.`);
            if (e.who === player) { line(e.t, e.who, `You landed at ${poiName(e.poi)}`, "info"); announce(7.5, `You landed at ${poiName(e.poi)}. Find a weapon!`); }
            break;
          }
          case "zone":
            if (e.shrinking) { line(e.t, -1, `The storm is moving: circle ${e.phase + 1} closes in`, "zone"); announce(5, e.nr > 0 ? "The storm is moving! Get inside the white circle." : "Final circle! Nowhere left to hide."); }
            else if (e.phase > 0) line(e.t, -1, `Next circle revealed`, "zone");
            break;
          case "downed": {
            const f = fighters[e.who], by = e.by >= 0 ? fighters[e.by] : null;
            if (e.cause === "storm") line(e.t, e.who, `${name(f)} fell to the storm`, "ko");
            else line(e.t, e.who, `${by ? name(by) : "Someone"} knocked down ${name(f)}`, "ko", e.weapon ?? undefined);
            if (by && by.state === "alive" && by.kos >= 2) announce(by.kos >= 5 ? 6.5 : 3, `${fighterName(by.id)}: "${pick(TAUNT[by.id.family], round, e.t, e.by)}"${by.kos >= 4 ? ` ${by.kos} knockouts!` : ""}`);
            if (e.who === player) announce(9, "You're down! A second life brings you back. Hurry!");
            if (e.by === player) announce(8, `You knocked down ${fighterName(f.id)}!`);
            break;
          }
          case "out":
            if (e.place <= 5 && e.who !== player) announce(4 + (6 - e.place) * 0.1, `${fighterName(fighters[e.who].id)} is out in ${ordinal(e.place)} place.`);
            if (e.who === player) announce(9.5, `You're out in ${ordinal(e.place)} place.`);
            break;
          case "revived": line(e.t, e.who, `${name(fighters[e.who])} got a second life!`, "sponsor", "revive"); announce(e.who === player ? 9 : 5, `Second life! ${name(fighters[e.who])} is back in the fight!`); break;
          case "last_stand": line(e.t, e.who, `${name(fighters[e.who])} splits in two and survives!`, "info"); announce(6, `${fighterName(fighters[e.who].id)} refuses to go down!`); break;
          case "sponsor": if (e.item !== "revive") line(e.t, e.who, `${e.by} sent ${e.item === "shield" ? "a shield" : "a medkit"} to ${name(fighters[e.who])}`, "sponsor", e.item); break;
          case "loot":
            if (e.who === player) line(e.t, e.who, `You found ${LOOT_TEXT[e.item]}`, "loot", e.item);
            else if (e.item === "wand" || e.item === "armor50") line(e.t, e.who, `${name(fighters[e.who])} found ${LOOT_TEXT[e.item]}`, "loot", e.item);
            break;
          case "heal": if (e.who === player) line(e.t, e.who, `You patched up (+${e.hp} HP)`, "info", "bandages"); break;
          case "window_closed": line(e.t, -1, `Sponsoring closed. The final ${e.alive} are on their own.`, "zone"); announce(8, `Final ${e.alive}! No more help from the crowd.`); break;
          case "winner": line(e.t, e.who, `${name(fighters[e.who])} ${e.who === player ? "win" : "wins"} round ${round}!`, "win"); announce(10, `${fighterName(fighters[e.who].id)} wins the round! "${pick(TAUNT[fighters[e.who].id.family], round, "win")}"`); break;
          default: break;
        }
      }
      return { feed, announcer: (say as { p: number; text: string } | null)?.text ?? null };
    },
  };
}

export const weaponName = (id: string) => (id in WEAPONS ? WEAPONS[id as keyof typeof WEAPONS].name : id);
export const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;
