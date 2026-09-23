import { describe, expect, it } from 'vitest';
import { createRng, hashSeed } from '@core/rng';

describe('createRng', () => {
  it('produces the same sequence from the same seed', () => {
    const a = createRng(1234);
    const b = createRng(1234);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences from different seeds', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it('accepts a human-readable seed', () => {
    expect(createRng('basement-run-3').next()).toBe(createRng(hashSeed('basement-run-3')).next());
  });

  it('stays within [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 10_000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('is roughly uniform', () => {
    const rng = createRng(99);
    const buckets = new Array<number>(10).fill(0);
    const samples = 100_000;
    for (let i = 0; i < samples; i++) {
      const bucket = Math.floor(rng.next() * 10);
      buckets[bucket] = (buckets[bucket] as number) + 1;
    }
    // Each bucket within 10% of the expected tenth.
    for (const count of buckets) {
      expect(count).toBeGreaterThan(samples / 10 - samples / 100);
      expect(count).toBeLessThan(samples / 10 + samples / 100);
    }
  });

  it('keeps int() within bounds', () => {
    const rng = createRng(5);
    for (let i = 0; i < 1000; i++) {
      const value = rng.int(3, 7);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThan(7);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('returns the lower bound for an empty int range', () => {
    expect(createRng(1).int(5, 5)).toBe(5);
  });

  it('throws rather than returning undefined when picking from nothing', () => {
    expect(() => createRng(1).pick([])).toThrow(/empty/);
  });

  it('shuffles a permutation, not a new set of values', () => {
    const rng = createRng(42);
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = rng.shuffle([...items]);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
    expect(shuffled).not.toEqual(items); // vanishingly unlikely with this seed
  });

  it('restores an in-flight stream from saved state', () => {
    const rng = createRng(11);
    rng.next();
    rng.next();
    const saved = rng.state;
    const expected = [rng.next(), rng.next()];

    const restored = createRng(0);
    restored.setState(saved);
    expect([restored.next(), restored.next()]).toEqual(expected);
  });

  it('forks independent but deterministic streams', () => {
    const makeForks = (): number[] => {
      const parent = createRng('seed');
      return [parent.fork().next(), parent.fork().next()];
    };
    const [a, b] = makeForks();
    expect(a).not.toBe(b);
    expect(makeForks()).toEqual([a, b]);
  });

  it('isolates subsystems: extra draws in one fork do not shift another', () => {
    const parent = createRng('run-1');
    const flicker = parent.fork();
    const ai = parent.fork();
    const aiBefore = ai.next();

    const parent2 = createRng('run-1');
    const flicker2 = parent2.fork();
    const ai2 = parent2.fork();
    flicker2.next(); // the flicker system gains an extra coin flip
    flicker2.next();

    expect(ai2.next()).toBe(aiBefore);
    expect(flicker).toBeDefined();
  });
});
