import { describe, expect, it } from 'vitest';
import { createWorld, defineComponent, NULL_ENTITY } from '@core/world';

interface Transform {
  x: number;
  y: number;
  z: number;
}
interface Health {
  current: number;
}
interface Sanity {
  value: number;
}

const Transform = defineComponent<Transform>('Transform');
const Health = defineComponent<Health>('Health');
const Sanity = defineComponent<Sanity>('Sanity');

describe('createWorld', () => {
  it('creates live entities', () => {
    const world = createWorld();
    const entity = world.create();
    expect(world.alive(entity)).toBe(true);
    expect(world.size).toBe(1);
  });

  it('never issues the null entity', () => {
    const world = createWorld();
    for (let i = 0; i < 10; i++) expect(world.create()).not.toBe(NULL_ENTITY);
    expect(world.alive(NULL_ENTITY)).toBe(false);
  });

  it('issues distinct handles', () => {
    const world = createWorld();
    const handles = new Set(Array.from({ length: 100 }, () => world.create()));
    expect(handles.size).toBe(100);
  });

  it('destroys entities', () => {
    const world = createWorld();
    const entity = world.create();
    expect(world.destroy(entity)).toBe(true);
    expect(world.alive(entity)).toBe(false);
    expect(world.size).toBe(0);
  });

  it('reports a repeated destroy rather than double-counting', () => {
    const world = createWorld();
    const entity = world.create();
    world.destroy(entity);
    expect(world.destroy(entity)).toBe(false);
    expect(world.size).toBe(0);
  });

  describe('stale handles', () => {
    it('does not resurrect a destroyed handle when its index is recycled', () => {
      const world = createWorld();
      const first = world.create();
      world.destroy(first);
      const second = world.create(); // same index, new generation

      expect(world.alive(first)).toBe(false);
      expect(world.alive(second)).toBe(true);
      expect(first).not.toBe(second);
    });

    it('does not read the new occupant through a stale handle', () => {
      const world = createWorld();
      const door = world.create();
      world.add(door, Health, { current: 50 });
      world.destroy(door);

      const stalker = world.create();
      world.add(stalker, Health, { current: 100 });

      // The bug this prevents: the stalker taking the door's damage.
      expect(world.get(door, Health)).toBeUndefined();
      expect(world.get(stalker, Health)).toEqual({ current: 100 });
    });

    it('refuses to add a component to a dead entity', () => {
      const world = createWorld();
      const entity = world.create();
      world.destroy(entity);
      expect(() => world.add(entity, Health, { current: 1 })).toThrow(/not alive/);
    });
  });

  describe('components', () => {
    it('stores and retrieves data', () => {
      const world = createWorld();
      const entity = world.create();
      world.add(entity, Transform, { x: 1, y: 2, z: 3 });
      expect(world.get(entity, Transform)).toEqual({ x: 1, y: 2, z: 3 });
      expect(world.has(entity, Transform)).toBe(true);
    });

    it('returns the stored reference so systems can mutate in place', () => {
      const world = createWorld();
      const entity = world.create();
      const transform = world.add(entity, Transform, { x: 0, y: 0, z: 0 });
      transform.x = 5; // no allocation in the frame path
      expect(world.get(entity, Transform)?.x).toBe(5);
    });

    it('reports a missing component', () => {
      const world = createWorld();
      const entity = world.create();
      expect(world.get(entity, Health)).toBeUndefined();
      expect(world.has(entity, Health)).toBe(false);
    });

    it('keeps component types independent', () => {
      const world = createWorld();
      const entity = world.create();
      world.add(entity, Health, { current: 10 });
      expect(world.has(entity, Sanity)).toBe(false);
    });

    it('overwrites on re-add', () => {
      const world = createWorld();
      const entity = world.create();
      world.add(entity, Health, { current: 10 });
      world.add(entity, Health, { current: 3 });
      expect(world.get(entity, Health)).toEqual({ current: 3 });
    });

    it('removes a component', () => {
      const world = createWorld();
      const entity = world.create();
      world.add(entity, Health, { current: 10 });
      expect(world.remove(entity, Health)).toBe(true);
      expect(world.has(entity, Health)).toBe(false);
      expect(world.remove(entity, Health)).toBe(false);
    });

    it('drops components when the entity dies', () => {
      const world = createWorld();
      const entity = world.create();
      world.add(entity, Health, { current: 10 });
      world.destroy(entity);
      expect(world.get(entity, Health)).toBeUndefined();
    });

    it('does not share stores between worlds', () => {
      // The reason stores live on the world, not on the component descriptor.
      const a = createWorld();
      const b = createWorld();
      const entityA = a.create();
      a.add(entityA, Health, { current: 99 });

      const entityB = b.create();
      expect(entityB).toBe(entityA); // same handle, different world
      expect(b.get(entityB, Health)).toBeUndefined();
    });
  });

  describe('queries', () => {
    it('matches entities carrying every requested component', () => {
      const world = createWorld();
      const both = world.create();
      world.add(both, Transform, { x: 0, y: 0, z: 0 });
      world.add(both, Health, { current: 1 });

      const onlyTransform = world.create();
      world.add(onlyTransform, Transform, { x: 0, y: 0, z: 0 });

      const query = world.query(Transform, Health);
      expect(query.size).toBe(1);
      expect(query.entities[0]).toBe(both);
    });

    it('matches every live entity for an empty query', () => {
      const world = createWorld();
      world.create();
      world.create();
      expect(world.query().size).toBe(2);
    });

    it('excludes destroyed entities', () => {
      const world = createWorld();
      const a = world.create();
      world.add(a, Health, { current: 1 });
      const b = world.create();
      world.add(b, Health, { current: 1 });

      const query = world.query(Health);
      expect(query.size).toBe(2);
      world.destroy(a);
      expect(query.size).toBe(1);
      expect(query.entities[0]).toBe(b);
    });

    it('excludes a recycled slot that has not been re-populated', () => {
      const world = createWorld();
      const a = world.create();
      world.add(a, Health, { current: 1 });
      world.destroy(a);
      world.create(); // recycles the index, carries no components

      expect(world.query(Health).size).toBe(0);
    });

    it('sees components added after the query was built', () => {
      const world = createWorld();
      const query = world.query(Sanity); // built at system init, before any entity
      const entity = world.create();
      expect(query.size).toBe(0);
      world.add(entity, Sanity, { value: 100 });
      expect(query.size).toBe(1);
    });

    it('drops entities that lose a required component', () => {
      const world = createWorld();
      const entity = world.create();
      world.add(entity, Transform, { x: 0, y: 0, z: 0 });
      world.add(entity, Health, { current: 1 });

      const query = world.query(Transform, Health);
      expect(query.size).toBe(1);
      world.remove(entity, Health);
      expect(query.size).toBe(0);
    });

    it('reuses its result array rather than allocating per frame', () => {
      const world = createWorld();
      const entity = world.create();
      world.add(entity, Health, { current: 1 });

      const query = world.query(Health);
      const first = query.entities;
      const second = query.entities; // no structural change between reads
      expect(second).toBe(first);
    });

    it('rebuilds only when the world structure changed', () => {
      const world = createWorld();
      const entity = world.create();
      world.add(entity, Health, { current: 10 });

      const query = world.query(Health);
      const before = world.version;
      query.refresh();
      query.refresh();
      expect(world.version).toBe(before);

      // Mutating component data is not a structural change.
      const health = world.get(entity, Health);
      if (health !== undefined) health.current = 5;
      expect(world.version).toBe(before);
    });
  });

  it('clears every entity and component on teardown', () => {
    const world = createWorld();
    const entity = world.create();
    world.add(entity, Health, { current: 1 });
    world.clear();

    expect(world.size).toBe(0);
    expect(world.alive(entity)).toBe(false);
    expect(world.query(Health).size).toBe(0);
  });

  it('recycles indices rather than growing without bound', () => {
    const world = createWorld();
    for (let cycle = 0; cycle < 50; cycle++) {
      const entities = Array.from({ length: 20 }, () => world.create());
      for (const entity of entities) {
        world.add(entity, Transform, { x: 0, y: 0, z: 0 });
      }
      expect(world.size).toBe(20);
      for (const entity of entities) world.destroy(entity);
      expect(world.size).toBe(0);
    }
    expect(world.query(Transform).size).toBe(0);
  });

  it('survives generation wrap-around on a heavily recycled slot', () => {
    const world = createWorld();
    let previous = world.create();
    // The generation field is 12 bits; wrap it several times over.
    for (let i = 0; i < 10_000; i++) {
      world.destroy(previous);
      const next = world.create();
      expect(world.alive(next)).toBe(true);
      previous = next;
    }
    expect(world.size).toBe(1);
  });

  it('throws a readable error past the component-type limit', () => {
    const world = createWorld();
    const entity = world.create();
    expect(() => {
      for (let i = 0; i < 40; i++) {
        world.add(entity, defineComponent<{ n: number }>(`C${i}`), { n: i });
      }
    }).toThrow(/component types/);
  });
});
