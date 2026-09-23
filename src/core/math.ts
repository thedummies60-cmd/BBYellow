/**
 * Allocation-free math (CLAUDE.md §3).
 *
 * Every operation writes into a caller-supplied `out` and returns it, so nothing here
 * allocates in the frame path. This is deliberately not a fluent/immutable API:
 * `a.add(b).scale(2)` allocates twice per call, and at 60 Hz across every moving entity
 * that is what produces the GC pause that reads as the game stuttering.
 *
 * Lives in `core/` so `game/` can do vector math without importing three (CLAUDE.md §2).
 * `render/` converts to three's types at the boundary.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export function set(out: Vec3, x: number, y: number, z: number): Vec3 {
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

export function copy(out: Vec3, a: Vec3): Vec3 {
  out.x = a.x;
  out.y = a.y;
  out.z = a.z;
  return out;
}

export function add(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out.x = a.x + b.x;
  out.y = a.y + b.y;
  out.z = a.z + b.z;
  return out;
}

export function sub(out: Vec3, a: Vec3, b: Vec3): Vec3 {
  out.x = a.x - b.x;
  out.y = a.y - b.y;
  out.z = a.z - b.z;
  return out;
}

export function scale(out: Vec3, a: Vec3, s: number): Vec3 {
  out.x = a.x * s;
  out.y = a.y * s;
  out.z = a.z * s;
  return out;
}

/** out = a + b * s. The integration step, in one call and one pass. */
export function addScaled(out: Vec3, a: Vec3, b: Vec3, s: number): Vec3 {
  out.x = a.x + b.x * s;
  out.y = a.y + b.y * s;
  out.z = a.z + b.z * s;
  return out;
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function lengthSq(a: Vec3): number {
  return a.x * a.x + a.y * a.y + a.z * a.z;
}

export function length(a: Vec3): number {
  return Math.sqrt(lengthSq(a));
}

export function distanceSq(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.sqrt(distanceSq(a, b));
}

/** Zero-length input yields a zero vector rather than NaN. */
export function normalize(out: Vec3, a: Vec3): Vec3 {
  const lenSq = lengthSq(a);
  if (lenSq === 0) return set(out, 0, 0, 0);
  const inv = 1 / Math.sqrt(lenSq);
  out.x = a.x * inv;
  out.y = a.y * inv;
  out.z = a.z * inv;
  return out;
}

export function lerpVec3(out: Vec3, a: Vec3, b: Vec3, t: number): Vec3 {
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.z = a.z + (b.z - a.z) * t;
  return out;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Maps `value` from [inMin, inMax] onto [outMin, outMax], clamped to the output range. */
export function remap(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  if (inMax === inMin) return outMin;
  return clamp(outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin), outMin, outMax);
}

/**
 * Frame-rate independent smoothing toward a target.
 *
 * `a + (b - a) * rate * dt` looks equivalent but is not: it overshoots at low frame
 * rates and converges at a different speed at high ones. Since the simulation is
 * fixed-step this matters less than it would, but smoothing also runs in `render/` on
 * variable dt, where it matters a lot.
 */
export function damp(current: number, target: number, smoothing: number, dt: number): number {
  return target + (current - target) * Math.exp(-smoothing * dt);
}

export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;
