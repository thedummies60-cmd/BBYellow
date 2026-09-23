/**
 * The threat (docs/horror-design-principles.md).
 *
 * Four states, one job each. A player who dies should be able to say why: it heard me
 * sprint, it came to look, it saw me, it caught me. If explaining a death needs three
 * systems and a timer, the design is wrong, not the explanation.
 *
 * Pure and seeded: a death reproduces from a seed and becomes a regression test.
 */
import { vec3 } from '@core';
import type { Vec3 } from '@core';
import type { Aabb } from '../collision.js';
import { overlaps } from '../collision.js';
import type { Stalker } from '../components/stalker.js';
import type { ThreatConfig } from '../config/threat.js';

export interface StalkerSenses {
  /** Where the player is. */
  readonly player: Vec3;
  /** How far the player's movement carries this step: 0 when crouched or still. */
  readonly noiseRadius: number;
}

export type StalkerEvent = 'none' | 'heard' | 'spotted' | 'lost' | 'caught';

/** Scratch, reused every step (CLAUDE.md §3). */
const ray: Aabb = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };

/**
 * Line of sight by marching a small probe between two points.
 *
 * Not a true raycast — `game/` has no scene to cast against — but against axis-aligned
 * boxes a fine enough march is equivalent, and it stays testable and deterministic.
 * The step is smaller than the thinnest wall in any level.
 */
export function hasLineOfSight(
  from: Vec3,
  to: Vec3,
  boxes: readonly Aabb[],
  step = 0.25,
): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance === 0) return true;

  const steps = Math.ceil(distance / step);
  // Probe at chest height, a small box rather than a point: a point can thread the seam
  // between two boxes that a body could never fit through.
  const half = 0.06;

  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = from.x + dx * t;
    const y = from.y + dy * t;
    const z = from.z + dz * t;
    ray.minX = x - half;
    ray.maxX = x + half;
    ray.minY = y - half;
    ray.maxY = y + half;
    ray.minZ = z - half;
    ray.maxZ = z + half;
    for (let b = 0; b < boxes.length; b++) {
      if (overlaps(ray, boxes[b] as Aabb)) return false;
    }
  }
  return true;
}

const goalDirection: Vec3 = vec3();

export interface StalkerDeps {
  readonly config: ThreatConfig;
  readonly patrol: readonly { x: number; y: number; z: number }[];
  readonly colliders: readonly Aabb[];
}

/**
 * Advances the stalker one fixed step. Returns what changed, so the caller can play a
 * cue — the system itself knows nothing about audio.
 */
export function updateStalker(
  stalker: Stalker,
  senses: StalkerSenses,
  deps: StalkerDeps,
  dt: number,
): StalkerEvent {
  const { config, patrol, colliders } = deps;

  stalker.previousPosition.x = stalker.position.x;
  stalker.previousPosition.y = stalker.position.y;
  stalker.previousPosition.z = stalker.position.z;
  stalker.previousYaw = stalker.yaw;

  const toPlayerX = senses.player.x - stalker.position.x;
  const toPlayerZ = senses.player.z - stalker.position.z;
  const playerDistance = Math.hypot(toPlayerX, toPlayerZ);

  let event: StalkerEvent = 'none';

  // --- senses ------------------------------------------------------------------
  // Eye height on both ends: a crouching player behind a crate really is hidden.
  const eye = vec3(stalker.position.x, stalker.position.y + 1.6, stalker.position.z);
  const target = vec3(senses.player.x, senses.player.y + 1.2, senses.player.z);

  const facingX = -Math.sin(stalker.yaw);
  const facingZ = -Math.cos(stalker.yaw);
  const facing = playerDistance > 0 ? (toPlayerX * facingX + toPlayerZ * facingZ) / playerDistance : 1;

  const canSee =
    playerDistance <= config.sightRange &&
    facing >= config.sightCone &&
    hasLineOfSight(eye, target, colliders);

  if (canSee) {
    stalker.awareness += dt;
  } else {
    stalker.awareness = Math.max(0, stalker.awareness - dt * 1.5);
  }

  const heard = senses.noiseRadius > 0 && playerDistance <= senses.noiseRadius;

  // --- transitions --------------------------------------------------------------
  if (canSee && stalker.awareness >= config.awarenessToHunt) {
    if (stalker.state !== 'hunt') event = 'spotted';
    stalker.state = 'hunt';
    stalker.timer = config.searchDuration;
    stalker.goal.x = senses.player.x;
    stalker.goal.z = senses.player.z;
  } else if (stalker.state === 'hunt') {
    // Lost sight: keep the last known position and search around it, rather than
    // magically tracking. Being able to break line of sight is the whole game.
    stalker.timer -= dt;
    if (stalker.timer <= 0) {
      stalker.state = 'patrol';
      event = 'lost';
    } else {
      stalker.state = 'search';
    }
  } else if (heard && stalker.state !== 'search') {
    if (stalker.state !== 'investigate') event = 'heard';
    stalker.state = 'investigate';
    stalker.timer = config.investigateDuration;
    stalker.goal.x = senses.player.x;
    stalker.goal.z = senses.player.z;
  } else if (stalker.state === 'investigate' || stalker.state === 'search') {
    stalker.timer -= dt;
    if (stalker.timer <= 0) {
      stalker.state = 'patrol';
      event = 'lost';
    }
  }

  if (stalker.state === 'patrol') {
    const point = patrol[stalker.patrolIndex % patrol.length];
    if (point !== undefined) {
      stalker.goal.x = point.x;
      stalker.goal.z = point.z;
    }
  }

  // --- move --------------------------------------------------------------------
  const speed =
    stalker.state === 'hunt'
      ? config.huntSpeed
      : stalker.state === 'patrol'
        ? config.patrolSpeed
        : config.investigateSpeed;

  goalDirection.x = stalker.goal.x - stalker.position.x;
  goalDirection.z = stalker.goal.z - stalker.position.z;
  const goalDistance = Math.hypot(goalDirection.x, goalDirection.z);

  if (goalDistance > config.arriveRadius) {
    const stepX = (goalDirection.x / goalDistance) * speed * dt;
    const stepZ = (goalDirection.z / goalDistance) * speed * dt;
    stalker.position.x += stepX;
    stalker.position.z += stepZ;
    // Face where it is going. atan2 matches the game's yaw convention: 0 faces -Z.
    stalker.yaw = Math.atan2(-goalDirection.x, -goalDirection.z);
  } else if (stalker.state === 'patrol') {
    stalker.patrolIndex = (stalker.patrolIndex + 1) % patrol.length;
  }

  // --- catch ---------------------------------------------------------------------
  if (playerDistance <= config.catchRadius) return 'caught';

  return event;
}
