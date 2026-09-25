/** Simulated RF economy. Every RF amount is a bigint in base units (1 RF = 10n ** 18n), like the SDK.
 *
 * Entry: 1 RF. 60% goes to the round's placement ladder (top 10 paid entrants), 20% is the bounty on the entrant's
 * head (paid to whoever knocks them out, burned if the storm or a wild Friend does) and 20% is a gameplay payment.
 * Prizes are funded only by paid entries: seats nobody paid for are filled by wild Friends, who never take prizes.
 * Gameplay payments follow the Rare Friends protocol rule (rarefriends.com/docs/economy):
 * 50% is burned and 50% funds RF rewards for active Friends.
 * Sponsor items and cosmetics are gameplay payments in full. Nothing here is sent on chain. */

export const RF = 10n ** 18n;
/** Parses "0.5" style decimal RF strings into base units. */
export function rf(value: string): bigint {
  const [whole, frac = ""] = value.split(".");
  return BigInt(whole) * RF + BigInt((frac + "0".repeat(18)).slice(0, 18));
}
export function formatRF(amount: bigint, digits = 2): string {
  const neg = amount < 0n, a = neg ? -amount : amount;
  const whole = a / RF, frac = (a % RF).toString().padStart(18, "0").slice(0, digits).replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole.toLocaleString("en-US")}${frac ? `.${frac}` : ""}`;
}

export const BPS = 10_000n;
export const ENTRY_PRICE = rf("1");
/** Share of each entry that funds the placement ladder. */
export const ENTRY_POOL_BPS = 6_000n;
/** Share of each entry that rides on the entrant's head as a knockout bounty. */
export const ENTRY_BOUNTY_BPS = 2_000n;
export const BOUNTY = ENTRY_PRICE * ENTRY_BOUNTY_BPS / BPS;
/** Share of each gameplay payment that is burned; the rest funds active-Friend rewards. */
export const GAMEPLAY_BURN_BPS = 5_000n;
/** Placement ladder weights for the best paid entrants. With 50 paid entries the pool is 30 RF:
 * 8, 5, 4, 3 and 2.5 RF for places 1 to 5 and 1.5 RF for places 6 to 10. */
export const LADDER_WEIGHTS: readonly bigint[] = [16n, 10n, 8n, 6n, 5n, 3n, 3n, 3n, 3n, 3n];
/** One paid place per five paid entries (rounded up), at most ten. */
export const paidPlaces = (paidEntries: number) => Math.min(LADDER_WEIGHTS.length, Math.ceil(paidEntries / 5));
/** Below this many paid entries a round is a free round: entries are refunded and nothing is paid out. */
export const MIN_PAID_ENTRIES = 5;

export const SPONSOR_ITEMS = {
  shield: { id: "shield", name: "Shield", price: rf("1"), text: "A bubble that soaks the next 30 damage. One at a time." },
  medkit: { id: "medkit", name: "Medkit", price: rf("1"), text: "Restores 45 HP." },
  revive: { id: "revive", name: "Second life", price: rf("2"), text: "Brings a downed Friend back with 50% HP and 3 s of protection." },
} as const;
export type SponsorItemId = keyof typeof SPONSOR_ITEMS;
/** Second life gets pricier for the same Friend within a round: 2, then 4, then 8 RF. Three at most. */
export const REVIVE_PRICES: readonly bigint[] = [rf("2"), rf("4"), rf("8")];
export const revivePrice = (usedThisRound: number): bigint | null => REVIVE_PRICES[usedThisRound] ?? null;

/** Cosmetics: pure gameplay payments (50% burned, 50% rewards). They never change the fight. */
export type CosmeticKind = "title" | "aura";
export type Cosmetic = Readonly<{ id: string; kind: CosmeticKind; name: string; price: bigint; text: string }>;
export const COSMETICS: readonly Cosmetic[] = [
  { id: "title-underdog", kind: "title", name: "Underdog", price: rf("1"), text: "A title under your Friend's name." },
  { id: "title-showrunner", kind: "title", name: "Showrunner", price: rf("3"), text: "A title under your Friend's name." },
  { id: "title-highroller", kind: "title", name: "High Roller", price: rf("5"), text: "A gold title under your Friend's name." },
  { id: "aura-ember", kind: "aura", name: "Ember aura", price: rf("2"), text: "Embers rise around your Friend in the arena." },
  { id: "aura-frost", kind: "aura", name: "Frost aura", price: rf("2"), text: "Snowflakes circle your Friend in the arena." },
  { id: "aura-starfall", kind: "aura", name: "Starfall aura", price: rf("5"), text: "Golden stars fall around your Friend in the arena." },
];
/** An arena shout: one line in the announcer's ticker and over your Friend. */
export const SHOUT_PRICE = rf("1");
export const SHOUTS: readonly string[] = ["Dinner's on me!", "Catch me if you can!", "Storm? What storm?", "For the Friends!", "Burn it all!", "GG, see you next round!"];

export type SpendKind = "entry" | "shield" | "medkit" | "revive" | "cosmetic";
export const SPEND_KINDS: readonly SpendKind[] = ["entry", "shield", "medkit", "revive", "cosmetic"];

export type Split = Readonly<{ pool: bigint; bounty: bigint; burned: bigint; rewards: bigint }>;

/** Where one payment goes. The parts always add up to the amount. */
export function splitPayment(kind: SpendKind, amount: bigint): Split {
  const pool = kind === "entry" ? amount * ENTRY_POOL_BPS / BPS : 0n;
  const bounty = kind === "entry" ? amount * ENTRY_BOUNTY_BPS / BPS : 0n;
  const gameplay = amount - pool - bounty;
  const burned = gameplay * GAMEPLAY_BURN_BPS / BPS;
  return { pool, bounty, burned, rewards: gameplay - burned };
}

/** The placement ladder for a pool shared by `paidEntries` entrants; rounding dust goes to first place so the pool
 * is always paid out exactly. */
export function ladderPrizes(pool: bigint, paidEntries: number): readonly bigint[] {
  const w = LADDER_WEIGHTS.slice(0, paidPlaces(paidEntries));
  if (!w.length) return [];
  const total = w.reduce((a, b) => a + b, 0n);
  const prizes = w.map(x => pool * x / total);
  prizes[0] += pool - prizes.reduce((a, b) => a + b, 0n);
  return prizes;
}

/** What one seat did in a finished round, as the settlement needs it. */
export type SeatResult = Readonly<{ place: number; paid: boolean; koBy: number; koCause: "" | "fight" | "storm" }>;
export type Payout = Readonly<{ place: bigint; bounties: bigint; bountiesWon: number; total: bigint; paidRank: number }>;
export type Settlement = Readonly<{ refunded: boolean; payouts: readonly Payout[]; ladder: readonly bigint[]; bountyBurned: bigint; paidEntries: number }>;

/** Settles a round. Paid entrants are ranked among themselves by place and paid the ladder. Each paid entrant's
 * bounty goes to the paid entrant who knocked them out; a knockout by the storm or a wild Friend burns it.
 * The winner keeps its own bounty. Wild Friends never receive RF. Every RF in is paid out, burned or refunded. */
export function settleRound(seats: readonly SeatResult[]): Settlement {
  const paidEntries = seats.filter(s => s.paid).length;
  const zero: Payout = { place: 0n, bounties: 0n, bountiesWon: 0, total: 0n, paidRank: 0 };
  if (paidEntries < MIN_PAID_ENTRIES) {
    return { refunded: true, ladder: [], bountyBurned: 0n, paidEntries,
      payouts: seats.map(s => (s.paid ? { ...zero, total: ENTRY_PRICE } : zero)) };
  }
  const ladder = ladderPrizes(ENTRY_PRICE * BigInt(paidEntries) * ENTRY_POOL_BPS / BPS, paidEntries);
  const place = seats.map(() => 0n), bounties = seats.map(() => 0n), won = seats.map(() => 0), rank = seats.map(() => 0);
  seats.map((s, i) => ({ s, i })).filter(x => x.s.paid).sort((a, b) => a.s.place - b.s.place).forEach(({ i }, j) => {
    rank[i] = j + 1; place[i] = ladder[j] ?? 0n;
  });
  let bountyBurned = 0n;
  seats.forEach((s, i) => {
    if (!s.paid) return;
    if (s.place === 1) { bounties[i] += BOUNTY; return; }
    const killer = s.koCause === "fight" && s.koBy >= 0 && s.koBy !== i ? s.koBy : -1;
    if (killer >= 0 && seats[killer]?.paid) { bounties[killer] += BOUNTY; won[killer] += 1; }
    else bountyBurned += BOUNTY;
  });
  return {
    refunded: false, ladder, bountyBurned, paidEntries,
    payouts: seats.map((_, i) => ({ place: place[i], bounties: bounties[i], bountiesWon: won[i], total: place[i] + bounties[i], paidRank: rank[i] })),
  };
}

export type Receipt = Readonly<{
  spent: Readonly<Record<SpendKind, bigint>>;
  count: Readonly<Record<SpendKind, number>>;
  /** Entry RF sent to prize ladders and bounties. */
  toPool: bigint;
  burned: bigint;
  rewards: bigint;
  won: bigint;
}>;

export type Ledger = Readonly<{
  balance(): bigint;
  canAfford(amount: bigint): boolean;
  /** Takes a simulated payment and returns where it went. Throws if the balance is short. */
  spend(kind: SpendKind, amount: bigint): Split;
  /** Credits a simulated prize. */
  win(amount: bigint): void;
  /** Returns an entry from a round that did not run as a paid round. */
  refund(amount: bigint): void;
  receipt(): Receipt;
}>;

export function createLedger(start: bigint = rf("20")): Ledger {
  let balance = start, toPool = 0n, burned = 0n, rewards = 0n, won = 0n;
  const spent = Object.fromEntries(SPEND_KINDS.map(k => [k, 0n])) as Record<SpendKind, bigint>;
  const count = Object.fromEntries(SPEND_KINDS.map(k => [k, 0])) as Record<SpendKind, number>;
  return {
    balance: () => balance,
    canAfford: amount => amount <= balance,
    spend(kind, amount) {
      if (amount <= 0n) throw new RangeError("A payment must be positive.");
      if (amount > balance) throw new RangeError("Not enough simulated RF.");
      const split = splitPayment(kind, amount);
      balance -= amount; spent[kind] += amount; count[kind] += 1;
      toPool += split.pool + split.bounty; burned += split.burned; rewards += split.rewards;
      return split;
    },
    win(amount) { if (amount < 0n) throw new RangeError("A prize cannot be negative."); balance += amount; won += amount; },
    refund(amount) { if (amount < 0n) throw new RangeError("A refund cannot be negative."); balance += amount; toPool -= amount; },
    receipt: () => ({ spent: { ...spent }, count: { ...count }, toPool, burned, rewards, won }),
  };
}
