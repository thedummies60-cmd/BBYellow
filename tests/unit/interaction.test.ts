import { beforeEach, describe, expect, it } from 'vitest';
import { createWorld, defineComponent, vec3 } from '@core';
import type { Entity, World } from '@core';
import {
  createInteractionResult,
  DEBUG_LEVEL,
  findTarget,
  INTERACTION,
  lightAt,
  SANITY,
  spawnLevel,
  updateSanity,
  useTarget,
} from '@game';
import type { Interactable, LevelInstance, Sanity, Transform } from '@game';

const Transform = defineComponent<Transform>('Transform');
const Interactable = defineComponent<Interactable>('Interactable');

describe('interaction', () => {
  let world: World;
  let instance: LevelInstance;
  let player: Entity;
  const result = createInteractionResult();
  const inventory = new Set<string>();

  const look = (x: number, z: number, yaw: number, pitch = 0): void => {
    const transform = world.get(player, Transform);
    if (transform === undefined) throw new Error('no transform');
    transform.position.x = x;
    transform.position.z = z;
    transform.yaw = yaw;
    transform.pitch = pitch;
    findTarget(
      world,
      Transform,
      Interactable,
      player,
      instance.interactables,
      (item) => inventory.has(item),
      INTERACTION,
      result,
    );
  };

  const idOf = (entity: Entity): string => world.get(entity, Interactable)?.id ?? '';

  beforeEach(() => {
    world = createWorld();
    instance = spawnLevel(world, Interactable, DEBUG_LEVEL);
    inventory.clear();
    player = world.create();
    world.add(player, Transform, {
      position: vec3(0, 0, 0),
      previousPosition: vec3(0, 0, 0),
      yaw: 0,
      previousYaw: 0,
      pitch: 0,
      previousPitch: 0,
    });
  });

  it('spawns one entity per interactable in the level', () => {
    expect(instance.interactables).toHaveLength(DEBUG_LEVEL.interactables.length);
  });

  it('targets nothing when there is nothing in reach', () => {
    look(0, 0, 0);
    expect(result.target).toBe(0);
    expect(result.prompt).toBe('');
  });

  it('targets the exit when standing at it and looking at it', () => {
    // Exit sits at z = 12.8; stand just short and look down +Z (yaw = pi faces +Z).
    look(0, 11.2, Math.PI, -0.2);
    expect(idOf(result.target)).toBe('exit');
  });

  it('will not target something behind the player', () => {
    look(0, 11.2, 0); // facing away, -Z
    expect(result.target).toBe(0);
  });

  it('will not target something out of reach', () => {
    look(0, 11.2 - INTERACTION.range - 1, Math.PI, -0.2);
    expect(result.target).toBe(0);
  });

  it('reports the exit as locked without the key', () => {
    look(0, 11.2, Math.PI, -0.2);
    expect(result.locked).toBe(true);
    expect(result.prompt).toMatch(/needs a key/i);
  });

  it('reports the exit as usable once the key is carried', () => {
    inventory.add('key');
    look(0, 11.2, Math.PI, -0.2);
    expect(result.locked).toBe(false);
    expect(result.prompt).toMatch(/leave/i);
  });

  it('refuses to open a locked exit', () => {
    look(0, 11.2, Math.PI, -0.2);
    const outcome = useTarget(world, Interactable, result, () => {}, () => {});
    expect(outcome).toBe('locked');
    expect(world.get(result.target, Interactable)?.used).toBe(false);
  });

  it('escapes through the exit with the key', () => {
    inventory.add('key');
    look(0, 11.2, Math.PI, -0.2);
    const opened: number[] = [];
    const outcome = useTarget(world, Interactable, result, () => {}, (i) => opened.push(i));
    expect(outcome).toBe('escaped');
    expect(opened).toHaveLength(1); // the exit's collider stops blocking
  });

  it('takes a pickup and puts it in the inventory', () => {
    const key = DEBUG_LEVEL.interactables.find((spec) => spec.id === 'key');
    if (key === undefined) throw new Error('level has no key');
    // The key is at more-negative z, so the player faces -Z: yaw 0.
    look(key.position.x, key.position.z + 1.2, 0, -0.1);
    expect(idOf(result.target)).toBe('key');

    const outcome = useTarget(world, Interactable, result, (item) => inventory.add(item), () => {});
    expect(outcome).toBe('taken');
    expect(inventory.has('key')).toBe(true);
  });

  it('cannot take the same pickup twice', () => {
    const key = DEBUG_LEVEL.interactables.find((spec) => spec.id === 'key');
    if (key === undefined) throw new Error('level has no key');
    look(key.position.x, key.position.z + 1.2, 0, -0.1);
    useTarget(world, Interactable, result, (item) => inventory.add(item), () => {});

    look(key.position.x, key.position.z + 1.2, 0, -0.1);
    expect(result.target).toBe(0); // used targets stop being targetable
  });

  it('does nothing when there is no target', () => {
    look(0, 0, 0);
    expect(useTarget(world, Interactable, result, () => {}, () => {})).toBe('none');
  });

  it('opening a door stops it blocking', () => {
    const door = DEBUG_LEVEL.interactables.find((spec) => spec.id === 'store-door');
    if (door === undefined) throw new Error('level has no store door');
    look(door.position.x, door.position.z + 1.4, 0, -0.1);
    expect(idOf(result.target)).toBe('store-door');

    const index = world.get(result.target, Interactable)?.colliderIndex ?? -1;
    expect(index).toBeGreaterThanOrEqual(0);
    const before = instance.colliders[index];
    expect(before?.maxX).toBeGreaterThan(before?.minX ?? 0);

    useTarget(world, Interactable, result, () => {}, (i) => instance.openCollider(i));
    const after = instance.colliders[index];
    expect(after?.maxX).toBe(after?.minX);
  });
});

describe('sanity', () => {
  const make = (value: number): Sanity => ({ value, previousValue: value });
  const STEP = 1 / 60;

  it('drains in darkness', () => {
    const sanity = make(100);
    for (let i = 0; i < 60; i++) updateSanity(sanity, { light: 0, hunted: false }, SANITY, STEP);
    expect(sanity.value).toBeCloseTo(100 - SANITY.drainInDarkness, 4);
  });

  it('recovers in light', () => {
    const sanity = make(50);
    for (let i = 0; i < 60; i++) updateSanity(sanity, { light: 1, hunted: false }, SANITY, STEP);
    expect(sanity.value).toBeCloseTo(50 + SANITY.recoverInLight, 4);
  });

  it('drains faster while hunted, even in the light', () => {
    const safe = make(80);
    const hunted = make(80);
    for (let i = 0; i < 60; i++) {
      updateSanity(safe, { light: 1, hunted: false }, SANITY, STEP);
      updateSanity(hunted, { light: 1, hunted: true }, SANITY, STEP);
    }
    expect(hunted.value).toBeLessThan(safe.value);
  });

  it('never leaves the 0-100 range', () => {
    const low = make(1);
    for (let i = 0; i < 600; i++) updateSanity(low, { light: 0, hunted: true }, SANITY, STEP);
    expect(low.value).toBe(0);

    const high = make(99);
    for (let i = 0; i < 600; i++) updateSanity(high, { light: 1, hunted: false }, SANITY, STEP);
    expect(high.value).toBe(100);
  });

  it('records the previous value for interpolation', () => {
    const sanity = make(100);
    updateSanity(sanity, { light: 0, hunted: false }, SANITY, STEP);
    expect(sanity.previousValue).toBe(100);
    expect(sanity.value).toBeLessThan(100);
  });

  it('holds roughly steady at the edge of a light', () => {
    // Partial light should feel like holding on, not like winning.
    const sanity = make(50);
    const balance = SANITY.drainInDarkness / (SANITY.recoverInLight + SANITY.drainInDarkness);
    for (let i = 0; i < 600; i++) {
      updateSanity(sanity, { light: balance, hunted: false }, SANITY, STEP);
    }
    expect(sanity.value).toBeCloseTo(50, 5);
  });
});

describe('lightAt', () => {
  const lights = [{ position: { x: 0, y: 3, z: 0 }, distance: 10 }];

  it('is brightest under a light', () => {
    expect(lightAt(0, 0, lights, 5, false)).toBeCloseTo(1, 5);
  });

  it('falls off with distance', () => {
    const near = lightAt(2, 0, lights, 5, false);
    const far = lightAt(6, 0, lights, 5, false);
    expect(near).toBeGreaterThan(far);
  });

  it('is dark beyond every light', () => {
    expect(lightAt(100, 100, lights, 5, false)).toBe(0);
  });

  it('counts the flashlight as light', () => {
    expect(lightAt(100, 100, lights, 5, true)).toBeGreaterThan(0.5);
  });

  it('takes the brightest source rather than summing them', () => {
    // Two dim lamps must not add up to a floodlight.
    const two = [
      { position: { x: -3, y: 3, z: 0 }, distance: 10 },
      { position: { x: 3, y: 3, z: 0 }, distance: 10 },
    ];
    expect(lightAt(0, 0, two, 5, false)).toBeLessThanOrEqual(1);
    expect(lightAt(0, 0, two, 5, false)).toBeCloseTo(lightAt(0, 0, [two[0]!], 5, false), 6);
  });

  it('stays within 0-1 with no lights at all', () => {
    expect(lightAt(0, 0, [], 5, false)).toBe(0);
  });
});
