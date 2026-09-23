/**
 * Advances rotating props (src/game/CLAUDE.md).
 *
 * A system is a function over state, stepped with the fixed dt. It knows nothing about
 * meshes, three, or how a rotation is drawn.
 */
import type { ComponentType, Entity, World } from '@core';
import type { Spin } from '../components/spin.js';

export function createSpinSystem(world: World, Spin: ComponentType<Spin>) {
  const query = world.query(Spin); // built once, reused every step

  return (dt: number): void => {
    const entities = query.entities;
    for (let i = 0; i < entities.length; i++) {
      const spin = world.get(entities[i] as Entity, Spin);
      if (spin === undefined) continue;
      spin.previousAngle = spin.angle;
      spin.angle += spin.speed * dt;
    }
  };
}
