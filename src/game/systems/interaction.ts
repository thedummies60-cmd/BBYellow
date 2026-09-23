/**
 * What the player is looking at, and what happens when they use it
 * (src/game/CLAUDE.md).
 *
 * Targeting is proximity plus facing, not a raycast. `game/` may not import three, so
 * there is no scene to cast against — and the simpler test is the better one anyway: it
 * is deterministic, it costs nothing, and it is honest about what the player can reach.
 *
 * The consequence to know: a target behind a thin wall within reach still counts. At
 * these ranges, in this layout, that never comes up; if it ever does, the fix is a
 * line-of-sight check against the colliders, which `stalker.ts` already implements.
 */
import { vec3 } from '@core';
import type { ComponentType, Entity, Vec3, World } from '@core';
import type { Interactable } from '../components/interactable.js';
import type { Transform } from '../components/transform.js';

export interface InteractionConfig {
  /** How far the player can reach, in metres. */
  readonly range: number;
  /**
   * How closely they must be facing it: the minimum cosine between look direction and
   * the direction to the target. 0.6 is roughly a 53-degree cone.
   */
  readonly minFacing: number;
}

export const INTERACTION: InteractionConfig = Object.freeze({
  range: 2.4,
  minFacing: 0.6,
});

export interface InteractionResult {
  /** The entity currently targeted, or 0 for none. */
  target: Entity;
  /** The prompt to show, or '' when there is nothing to show. */
  prompt: string;
  /** True when the target needs something the player does not have. */
  locked: boolean;
}

export function createInteractionResult(): InteractionResult {
  return { target: 0, prompt: '', locked: false };
}

/** Scratch, reused every frame (CLAUDE.md §3). */
const toTarget: Vec3 = vec3();

/**
 * Finds the best target in front of the player and writes it into `out`.
 *
 * "Best" is the most directly faced, not the nearest: when two things are in reach, the
 * one you are looking straight at is the one you meant.
 */
export function findTarget(
  world: World,
  Transform: ComponentType<Transform>,
  Interactable: ComponentType<Interactable>,
  player: Entity,
  candidates: readonly Entity[],
  has: (itemId: string) => boolean,
  config: InteractionConfig,
  out: InteractionResult,
): InteractionResult {
  out.target = 0;
  out.prompt = '';
  out.locked = false;

  const transform = world.get(player, Transform);
  if (transform === undefined) return out;

  // Look direction from yaw and pitch. Yaw 0 faces -Z.
  const cosPitch = Math.cos(transform.pitch);
  const lookX = -Math.sin(transform.yaw) * cosPitch;
  const lookY = Math.sin(transform.pitch);
  const lookZ = -Math.cos(transform.yaw) * cosPitch;

  // Eye position, not feet: looking down at a floor pickup must still reach it.
  const eyeY = transform.position.y + 1.65;

  let bestFacing = config.minFacing;

  for (let i = 0; i < candidates.length; i++) {
    const entity = candidates[i] as Entity;
    const target = world.get(entity, Interactable);
    if (target === undefined || target.used) continue;

    toTarget.x = target.position.x - transform.position.x;
    toTarget.y = target.position.y - eyeY;
    toTarget.z = target.position.z - transform.position.z;

    const distance = Math.hypot(toTarget.x, toTarget.y, toTarget.z);
    if (distance > config.range || distance === 0) continue;

    const facing = (toTarget.x * lookX + toTarget.y * lookY + toTarget.z * lookZ) / distance;
    if (facing <= bestFacing) continue;

    bestFacing = facing;
    out.target = entity;
    out.locked = target.requires !== '' && !has(target.requires);
    out.prompt = out.locked ? target.lockedLabel : target.label;
  }

  return out;
}

export type InteractionOutcome = 'none' | 'opened' | 'taken' | 'locked' | 'escaped';

/**
 * Uses the current target. Returns what happened so the caller can play the right cue
 * and update the HUD — the system itself emits nothing and knows nothing about audio.
 */
export function useTarget(
  world: World,
  Interactable: ComponentType<Interactable>,
  result: InteractionResult,
  take: (itemId: string) => void,
  openCollider: (index: number) => void,
): InteractionOutcome {
  if (result.target === 0) return 'none';
  if (result.locked) return 'locked';

  const target = world.get(result.target, Interactable);
  if (target === undefined || target.used) return 'none';

  target.used = true;

  if (target.kind === 'pickup') {
    take(target.id);
    return 'taken';
  }

  if (target.colliderIndex >= 0) openCollider(target.colliderIndex);
  return target.kind === 'exit' ? 'escaped' : 'opened';
}
