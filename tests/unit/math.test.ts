import { describe, expect, it } from 'vitest';
import {
  add,
  addScaled,
  clamp,
  copy,
  damp,
  distance,
  dot,
  length,
  lerp,
  lerpVec3,
  normalize,
  remap,
  scale,
  set,
  sub,
  vec3,
} from '@core/math';

describe('vec3 operations', () => {
  it('writes into out and returns it', () => {
    const out = vec3();
    const result = add(out, vec3(1, 2, 3), vec3(4, 5, 6));
    expect(result).toBe(out); // same object: nothing allocated
    expect(out).toEqual({ x: 5, y: 7, z: 9 });
  });

  it('does not mutate its inputs', () => {
    const a = vec3(1, 2, 3);
    const b = vec3(4, 5, 6);
    add(vec3(), a, b);
    expect(a).toEqual({ x: 1, y: 2, z: 3 });
    expect(b).toEqual({ x: 4, y: 5, z: 6 });
  });

  it('allows the output to alias an input', () => {
    // Systems integrate in place: add(position, position, delta).
    const position = vec3(1, 1, 1);
    add(position, position, vec3(2, 0, 0));
    expect(position).toEqual({ x: 3, y: 1, z: 1 });
  });

  it('subtracts', () => {
    expect(sub(vec3(), vec3(5, 5, 5), vec3(1, 2, 3))).toEqual({ x: 4, y: 3, z: 2 });
  });

  it('scales', () => {
    expect(scale(vec3(), vec3(1, 2, 3), 2)).toEqual({ x: 2, y: 4, z: 6 });
  });

  it('integrates with addScaled', () => {
    const position = vec3(0, 10, 0);
    const velocity = vec3(0, -9.81, 0);
    addScaled(position, position, velocity, 0.5);
    expect(position.y).toBeCloseTo(10 - 4.905, 10);
  });

  it('copies and sets', () => {
    const out = vec3();
    expect(copy(out, vec3(7, 8, 9))).toEqual({ x: 7, y: 8, z: 9 });
    expect(set(out, 1, 2, 3)).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('computes dot and length', () => {
    expect(dot(vec3(1, 2, 3), vec3(4, 5, 6))).toBe(32);
    expect(length(vec3(3, 4, 0))).toBe(5);
  });

  it('computes distance', () => {
    expect(distance(vec3(0, 0, 0), vec3(3, 4, 0))).toBe(5);
  });

  it('normalizes to unit length', () => {
    const out = normalize(vec3(), vec3(0, 3, 4));
    expect(length(out)).toBeCloseTo(1, 10);
    expect(out.y).toBeCloseTo(0.6, 10);
  });

  it('returns zero rather than NaN for a zero-length vector', () => {
    // A stationary entity normalizing its velocity would otherwise poison its position.
    const out = normalize(vec3(), vec3(0, 0, 0));
    expect(out).toEqual({ x: 0, y: 0, z: 0 });
    expect(Number.isNaN(out.x)).toBe(false);
  });

  it('interpolates between vectors', () => {
    const out = lerpVec3(vec3(), vec3(0, 0, 0), vec3(10, 20, 30), 0.5);
    expect(out).toEqual({ x: 5, y: 10, z: 15 });
  });
});

describe('scalar helpers', () => {
  it('clamps', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it('lerps', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.25)).toBe(2.5);
  });

  it('remaps and clamps to the output range', () => {
    // Sanity 0-100 mapped onto a grain intensity.
    expect(remap(50, 0, 100, 0, 1)).toBe(0.5);
    expect(remap(150, 0, 100, 0, 1)).toBe(1);
    expect(remap(-10, 0, 100, 0, 1)).toBe(0);
  });

  it('survives a degenerate remap range', () => {
    expect(remap(5, 10, 10, 0, 1)).toBe(0);
  });

  it('damps toward a target without overshooting', () => {
    let value = 0;
    for (let i = 0; i < 100; i++) value = damp(value, 10, 5, 1 / 60);
    expect(value).toBeGreaterThan(9.9);
    expect(value).toBeLessThanOrEqual(10);
  });

  it('damps consistently regardless of step size', () => {
    // The property naive lerp smoothing does not have.
    let fine = 0;
    for (let i = 0; i < 120; i++) fine = damp(fine, 10, 4, 1 / 120);

    let coarse = 0;
    for (let i = 0; i < 30; i++) coarse = damp(coarse, 10, 4, 1 / 30);

    expect(fine).toBeCloseTo(coarse, 6);
  });
});
