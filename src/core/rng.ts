/**
 * Seeded pseudo-random number generation (CLAUDE.md §3).
 *
 * The only sanctioned source of randomness in the codebase, and the only file allowed
 * to touch `Math.random` — enforced by `scripts/check-layers.mjs` and `eslint.config.js`.
 *
 * Every random decision the player can observe — a patrol choice, a flicker, which
 * ambient scare fires — draws from here, so "it only happened once" becomes a seed and
 * a one-line regression test.
 *
 * Algorithm: mulberry32. Fast, allocation-free, and its entire state is one 32-bit
 * integer, so a save file can restore an in-flight random stream exactly.
 */

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [minInclusive, maxExclusive). */
  int(minInclusive: number, maxExclusive: number): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** True with the given probability (default 0.5). */
  bool(probability?: number): boolean;
  /** A uniformly chosen element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T;
  /** Fisher-Yates, in place. Returns the same array. */
  shuffle<T>(items: T[]): T[];
  /**
   * A new independent stream, derived deterministically from this one.
   *
   * Give each subsystem its own fork so that adding a coin flip to the flicker system
   * cannot shift every later draw in the AI — otherwise one change invalidates every
   * recorded seed you have.
   */
  fork(): Rng;
  /** Current state. Persist this to resume an in-flight stream. */
  readonly state: number;
  setState(state: number): void;
}

/** FNV-1a. Turns a human-readable seed ("basement-run-3") into a numeric one. */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * A seed from an unpredictable source, for a fresh playthrough.
 *
 * The one legitimate `Math.random` call in the codebase: used once at startup, then
 * recorded and shown on the title screen so a player can report it with a bug.
 */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

export function createRng(seed: number | string): Rng {
  let state = (typeof seed === 'string' ? hashSeed(seed) : Math.floor(seed)) >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };

  const rng: Rng = {
    next,

    int(minInclusive: number, maxExclusive: number): number {
      if (maxExclusive <= minInclusive) return minInclusive;
      return minInclusive + Math.floor(next() * (maxExclusive - minInclusive));
    },

    range(min: number, max: number): number {
      return min + next() * (max - min);
    },

    bool(probability = 0.5): boolean {
      return next() < probability;
    },

    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('rng.pick: cannot pick from an empty array');
      // Index is provably in range, but noUncheckedIndexedAccess cannot see that.
      return items[Math.floor(next() * items.length)] as T;
    },

    shuffle<T>(items: T[]): T[] {
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = items[i] as T;
        items[i] = items[j] as T;
        items[j] = tmp;
      }
      return items;
    },

    fork(): Rng {
      return createRng(Math.floor(next() * 0x100000000));
    },

    get state() {
      return state;
    },

    setState(value: number): void {
      state = value >>> 0;
    },
  };

  return rng;
}
