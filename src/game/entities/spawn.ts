/**
 * Turns level data into live entities (src/game/CLAUDE.md).
 *
 * Spawn functions compose components and return handles; they hold no behaviour. This
 * is also where the level's colliders and its interactables are tied together, so a
 * door that opens visually is the same door that stops blocking you.
 */
import { vec3 } from '@core';
import type { ComponentType, Entity, World } from '@core';
import type { LevelData } from '@shared/level.js';
import { aabbFromBox, collidersFromLevel, disableCollider } from '../collision.js';
import type { Aabb } from '../collision.js';
import type { Interactable } from '../components/interactable.js';

export interface LevelInstance {
  /** Static geometry plus one entry per blocking interactable. */
  readonly colliders: Aabb[];
  readonly interactables: readonly Entity[];
  /** Stops a door blocking. Safe to call more than once. */
  openCollider(index: number): void;
}

export function spawnLevel(
  world: World,
  Interactable: ComponentType<Interactable>,
  level: LevelData,
): LevelInstance {
  const colliders = collidersFromLevel(level);
  const interactables: Entity[] = [];

  for (const spec of level.interactables) {
    let colliderIndex = -1;
    if (spec.blocks !== undefined) {
      colliderIndex = colliders.length;
      colliders.push(aabbFromBox(spec.blocks.center, spec.blocks.size));
    }

    const entity = world.create();
    world.add(entity, Interactable, {
      id: spec.id,
      kind: spec.kind,
      position: vec3(spec.position.x, spec.position.y, spec.position.z),
      label: spec.label,
      lockedLabel: spec.lockedLabel ?? spec.label,
      requires: spec.requires ?? '',
      used: false,
      colliderIndex,
    });
    interactables.push(entity);
  }

  return {
    colliders,
    interactables,
    openCollider(index: number): void {
      disableCollider(colliders, index);
    },
  };
}
