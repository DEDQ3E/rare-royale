/** Deterministic randomness. The same round seed gives every viewer the same roster and the same base battle,
 * without a server. Browser randomness is presentation only: it never settles a paid outcome on chain. */

export type Rng = Readonly<{
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
  /** Uniform float in [lo, hi). */
  range(lo: number, hi: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
  /** An independent stream derived from this seed and a label. */
  fork(label: string | number): Rng;
}>;

/** murmur3's 32-bit finalizer. */
export function fmix32(h: number): number {
  h ^= h >>> 16; h = Math.imul(h, 0x85EBCA6B);
  h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Stable 32-bit hash of any mix of strings and numbers (FNV-1a, then fmix). */
export function hash32(...parts: readonly (string | number | bigint)[]): number {
  let h = 0x811C9DC5;
  for (const part of parts) {
    const s = `${String(part)}\u0001`;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  }
  return fmix32(h);
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int: n => Math.floor(next() * n),
    range: (lo, hi) => lo + next() * (hi - lo),
    chance: p => next() < p,
    pick: items => items[Math.floor(next() * items.length)],
    shuffle: items => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
      return out;
    },
    fork: label => createRng(hash32(seed, label)),
  };
  return rng;
}
