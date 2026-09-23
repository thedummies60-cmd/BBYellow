import { describe, expect, it } from 'vitest';
import { createWorld, defineComponent } from '@core';
import { createSpinSystem } from '@game';
import type { Spin } from '@game';

const Spin = defineComponent<Spin>('Spin');
const STEP = 1 / 60;

describe('spin system', () => {
  it('advances the angle at the configured rate', () => {
    const world = createWorld();
    const update = createSpinSystem(world, Spin);

    const entity = world.create();
    world.add(entity, Spin, { angle: 0, previousAngle: 0, speed: Math.PI });

    for (let i = 0; i < 60; i++) update(STEP);

    expect(world.get(entity, Spin)?.angle).toBeCloseTo(Math.PI, 6);
  });

  it('keeps the previous angle one step behind, for interpolation', () => {
    const world = createWorld();
    const update = createSpinSystem(world, Spin);

    const entity = world.create();
    world.add(entity, Spin, { angle: 0, previousAngle: 0, speed: 1 });

    update(STEP);
    const spin = world.get(entity, Spin);
    expect(spin?.previousAngle).toBe(0);
    expect(spin?.angle).toBeCloseTo(STEP, 10);

    update(STEP);
    expect(world.get(entity, Spin)?.previousAngle).toBeCloseTo(STEP, 10);
  });

  it('is frame-rate independent for a given number of simulated seconds', () => {
    const run = (steps: number, dt: number): number => {
      const world = createWorld();
      const update = createSpinSystem(world, Spin);
      const entity = world.create();
      world.add(entity, Spin, { angle: 0, previousAngle: 0, speed: 2 });
      for (let i = 0; i < steps; i++) update(dt);
      return world.get(entity, Spin)?.angle ?? -1;
    };

    expect(run(60, 1 / 60)).toBeCloseTo(run(120, 1 / 120), 10);
  });

  it('ignores entities without the component', () => {
    const world = createWorld();
    const update = createSpinSystem(world, Spin);
    world.create(); // bare entity
    expect(() => update(STEP)).not.toThrow();
  });

  it('picks up entities spawned after the system was built', () => {
    const world = createWorld();
    const update = createSpinSystem(world, Spin);

    const entity = world.create();
    world.add(entity, Spin, { angle: 0, previousAngle: 0, speed: 1 });
    update(STEP);

    expect(world.get(entity, Spin)?.angle).toBeGreaterThan(0);
  });

  it('stops touching an entity once it is destroyed', () => {
    const world = createWorld();
    const update = createSpinSystem(world, Spin);
    const entity = world.create();
    world.add(entity, Spin, { angle: 0, previousAngle: 0, speed: 1 });

    update(STEP);
    world.destroy(entity);
    expect(() => update(STEP)).not.toThrow();
    expect(world.get(entity, Spin)).toBeUndefined();
  });
});
