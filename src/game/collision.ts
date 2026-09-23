/**
 * Axis-aligned collision (src/game/CLAUDE.md).
 *
 * Pure and headless: no meshes, no three, no raycasting against a scene graph. The
 * player is an AABB, the world is a list of AABBs, and resolution is per-axis. That is
 * enough for corridors and boxes, and it is testable to the millimetre.
 */
import type { Vec3 } from '@core';
import type { LevelData, Vec3Data } from '@shared/level.js';

export interface Aabb {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface MoveResult {
  /** True when the player is standing on something. */
  grounded: boolean;
  hitX: boolean;
  hitY: boolean;
  hitZ: boolean;
}

export function createMoveResult(): MoveResult {
  return { grounded: false, hitX: false, hitY: false, hitZ: false };
}

export function aabb(): Aabb {
  return { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
}

export function aabbFromBox(center: Vec3Data, size: Vec3Data, out: Aabb = aabb()): Aabb {
  out.minX = center.x - size.x / 2;
  out.maxX = center.x + size.x / 2;
  out.minY = center.y - size.y / 2;
  out.maxY = center.y + size.y / 2;
  out.minZ = center.z - size.z / 2;
  out.maxZ = center.z + size.z / 2;
  return out;
}

export function overlaps(a: Aabb, b: Aabb): boolean {
  return (
    a.minX < b.maxX &&
    a.maxX > b.minX &&
    a.minY < b.maxY &&
    a.maxY > b.minY &&
    a.minZ < b.maxZ &&
    a.maxZ > b.minZ
  );
}

/**
 * Solid geometry for a level: the room shell plus its obstacles.
 *
 * Walls are modelled as thick slabs *outside* the interior rather than as planes. A
 * plane has no inside, so a step that lands beyond it reports no overlap at all; a slab
 * still contains the player and pushes them back. Combined with the substepping in
 * `moveAndCollide`, that makes leaving the room impossible rather than merely unlikely.
 */
export function collidersFromLevel(level: LevelData): Aabb[] {
  const { width, height, depth } = level.room;
  const t = 1; // slab thickness
  const halfW = width / 2;
  const halfD = depth / 2;

  const boxes: Aabb[] = [
    // floor
    { minX: -halfW - t, maxX: halfW + t, minY: -t, maxY: 0, minZ: -halfD - t, maxZ: halfD + t },
    // ceiling
    {
      minX: -halfW - t,
      maxX: halfW + t,
      minY: height,
      maxY: height + t,
      minZ: -halfD - t,
      maxZ: halfD + t,
    },
    // -X / +X walls
    { minX: -halfW - t, maxX: -halfW, minY: 0, maxY: height, minZ: -halfD - t, maxZ: halfD + t },
    { minX: halfW, maxX: halfW + t, minY: 0, maxY: height, minZ: -halfD - t, maxZ: halfD + t },
    // -Z / +Z walls
    { minX: -halfW - t, maxX: halfW + t, minY: 0, maxY: height, minZ: -halfD - t, maxZ: -halfD },
    { minX: -halfW - t, maxX: halfW + t, minY: 0, maxY: height, minZ: halfD, maxZ: halfD + t },
  ];

  for (const box of level.boxes) boxes.push(aabbFromBox(box.center, box.size));
  return boxes;
}

/**
 * Makes a collider stop colliding, in place.
 *
 * Collapsed to a degenerate box rather than spliced out, so every index already handed
 * to an interactable stays valid. `overlaps` uses strict comparisons, so a zero-volume
 * box can never intersect anything.
 */
export function disableCollider(boxes: Aabb[], index: number): void {
  const box = boxes[index];
  if (box === undefined) return;
  box.minX = 0;
  box.maxX = 0;
  box.minY = 0;
  box.maxY = 0;
  box.minZ = 0;
  box.maxZ = 0;
}

/** Scratch, reused every call — this runs per entity per frame (CLAUDE.md §3). */
const probe: Aabb = aabb();
const step: Vec3 = { x: 0, y: 0, z: 0 };
const substepResult: MoveResult = createMoveResult();

function fillProbe(position: Vec3, radius: number, height: number): void {
  probe.minX = position.x - radius;
  probe.maxX = position.x + radius;
  probe.minY = position.y;
  probe.maxY = position.y + height;
  probe.minZ = position.z - radius;
  probe.maxZ = position.z + radius;
}

/**
 * Longest distance resolved in one pass.
 *
 * Discrete collision only sees where you land, so a step longer than a collider is thick
 * passes straight through it. At walking speed a step is ~0.073 m and this never binds,
 * but a teleport, a knockback or a debug speed multiplier would drop the player out of
 * the world — a silent, unreproducible bug. Substepping removes the class entirely for
 * the cost of a loop that almost always runs once.
 *
 * Must stay below the thinnest collider in any level (currently 0.4 m).
 */
export const MAX_SUBSTEP = 0.15;

function resolveStep(
  position: Vec3,
  radius: number,
  height: number,
  delta: Vec3,
  boxes: readonly Aabb[],
  result: MoveResult,
): void {
  // Clear on entry, not at the caller: `result` may be reused scratch, and a stale
  // `grounded` from a previous step reads as standing on nothing.
  result.grounded = false;
  result.hitX = false;
  result.hitY = false;
  result.hitZ = false;

  if (delta.x !== 0) {
    position.x += delta.x;
    fillProbe(position, radius, height);
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i] as Aabb;
      if (!overlaps(probe, box)) continue;
      position.x = delta.x > 0 ? box.minX - radius : box.maxX + radius;
      result.hitX = true;
      fillProbe(position, radius, height);
    }
  }

  if (delta.z !== 0) {
    position.z += delta.z;
    fillProbe(position, radius, height);
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i] as Aabb;
      if (!overlaps(probe, box)) continue;
      position.z = delta.z > 0 ? box.minZ - radius : box.maxZ + radius;
      result.hitZ = true;
      fillProbe(position, radius, height);
    }
  }

  if (delta.y !== 0) {
    position.y += delta.y;
    fillProbe(position, radius, height);
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i] as Aabb;
      if (!overlaps(probe, box)) continue;
      if (delta.y > 0) {
        position.y = box.minY - height; // bumped the ceiling
      } else {
        position.y = box.maxY;
        result.grounded = true;
      }
      result.hitY = true;
      fillProbe(position, radius, height);
    }
  }
}

/**
 * Moves `position` by `delta`, resolving against `boxes` one axis at a time.
 *
 * `position` is the player's **feet**, centred horizontally. Resolving per axis is what
 * lets you slide along a wall instead of stopping dead against it: the blocked axis is
 * cancelled and the others still apply.
 *
 * Horizontal axes resolve before the vertical one so `grounded` reflects where the
 * player actually ended up, not where they were before sliding.
 *
 * Long moves are split into substeps of at most `MAX_SUBSTEP`; see that constant.
 */
export function moveAndCollide(
  position: Vec3,
  radius: number,
  height: number,
  delta: Vec3,
  boxes: readonly Aabb[],
  result: MoveResult,
): MoveResult {
  result.grounded = false;
  result.hitX = false;
  result.hitY = false;
  result.hitZ = false;

  const longest = Math.max(Math.abs(delta.x), Math.abs(delta.y), Math.abs(delta.z));
  const steps = longest > MAX_SUBSTEP ? Math.ceil(longest / MAX_SUBSTEP) : 1;

  if (steps === 1) {
    resolveStep(position, radius, height, delta, boxes, result);
    return result;
  }

  step.x = delta.x / steps;
  step.y = delta.y / steps;
  step.z = delta.z / steps;

  for (let i = 0; i < steps; i++) {
    resolveStep(position, radius, height, step, boxes, substepResult);
    // Any contact during the move counts: a step that lands then rises is still grounded
    // for this frame, and a wall touched partway still cancels that axis.
    result.hitX = result.hitX || substepResult.hitX;
    result.hitY = result.hitY || substepResult.hitY;
    result.hitZ = result.hitZ || substepResult.hitZ;
    result.grounded = result.grounded || substepResult.grounded;
  }

  return result;
}
