/**
 * Entity-component world (CLAUDE.md §6).
 *
 * Components are plain data, so the whole world is serializable as-is — save/load and
 * deterministic replay come out of that for free rather than needing their own machinery.
 *
 * Component *stores live in the world*, not in the component definition. That is what
 * makes `defineComponent` safe to call at module scope: the descriptor is immutable, so
 * two worlds never share state and a test can build a fresh world per case. Putting the
 * storage on the descriptor would reintroduce the mutable module-level singleton that
 * CLAUDE.md §6 bans.
 */

/**
 * An entity handle: an index packed with a generation counter.
 *
 * The generation is why this is not just an array index. Indices get recycled, so a
 * stale handle held by some system would silently address whatever entity took its
 * slot — the stalker attacking a door because both were once entity 12. A recycled
 * index carries a new generation, so a stale handle fails `alive()` instead.
 */
export type Entity = number;

/** Never a valid entity. Handles always carry a generation of at least 1. */
export const NULL_ENTITY: Entity = 0;

const INDEX_BITS = 20;
const INDEX_MASK = (1 << INDEX_BITS) - 1;
export const MAX_ENTITIES = INDEX_MASK;

/**
 * Component types per world, capped by the 32-bit signature bitmask below.
 * A loud throw beats a silent mismatch; widen to a multi-word mask if this is ever hit.
 */
export const MAX_COMPONENT_TYPES = 30;

const entityIndex = (entity: Entity): number => entity & INDEX_MASK;
const entityGeneration = (entity: Entity): number => (entity >>> INDEX_BITS) & 0xfff;
const makeEntity = (index: number, generation: number): Entity =>
  ((generation << INDEX_BITS) | index) >>> 0;

/** An immutable descriptor. Holds no data — the world does. */
export interface ComponentType<T> {
  readonly name: string;
  /** Distinguishes descriptors; the world assigns its own per-world id and bit. */
  readonly key: symbol;
  /** Phantom marker so `ComponentType<Health>` is not assignable to `ComponentType<Sanity>`. */
  readonly __data?: T;
}

export function defineComponent<T>(name: string): ComponentType<T> {
  return { name, key: Symbol(name) };
}

/**
 * A live view of the entities carrying a set of components.
 *
 * Build one per system at init, then iterate by index every frame. Iterating
 * `query.entities` allocates nothing; the result list is rebuilt only when the world's
 * structure actually changed.
 */
export interface Query {
  readonly entities: readonly Entity[];
  readonly size: number;
  /** Rebuild now if stale. `entities` and `size` do this for you. */
  refresh(): void;
}

export interface World {
  create(): Entity;
  destroy(entity: Entity): boolean;
  alive(entity: Entity): boolean;
  /** Live entity count. */
  readonly size: number;
  /** Bumped on every structural change; queries use it to skip needless rebuilds. */
  readonly version: number;

  add<T>(entity: Entity, type: ComponentType<T>, data: T): T;
  get<T>(entity: Entity, type: ComponentType<T>): T | undefined;
  has<T>(entity: Entity, type: ComponentType<T>): boolean;
  remove<T>(entity: Entity, type: ComponentType<T>): boolean;

  query(...types: readonly ComponentType<unknown>[]): Query;
  /** Drop every entity and component. Part of scene teardown (CLAUDE.md §4). */
  clear(): void;
}

interface Store {
  bit: number;
  /** Indexed by entity index, not by handle. */
  data: unknown[];
}

export function createWorld(): World {
  /** Generation per entity index. 0 means the slot has never been used. */
  const generations: number[] = [];
  /** Component signature per entity index. */
  const signatures: number[] = [];
  /**
   * Liveness per entity index.
   *
   * Distinct from the signature: a live entity that carries no components has a
   * signature of 0, which is indistinguishable from a recycled free slot. Scanning the
   * free list instead would make query rebuilds O(entities x free slots).
   */
  const live: boolean[] = [];
  const freeList: number[] = [];
  const stores = new Map<symbol, Store>();
  let nextBit = 0;
  let liveCount = 0;
  let version = 0;

  const storeFor = <T>(type: ComponentType<T>): Store => {
    let store = stores.get(type.key);
    if (store === undefined) {
      if (nextBit >= MAX_COMPONENT_TYPES) {
        throw new Error(
          `createWorld: more than ${MAX_COMPONENT_TYPES} component types ('${type.name}'). ` +
            'Widen the signature mask in core/world.ts.',
        );
      }
      store = { bit: 1 << nextBit++, data: [] };
      stores.set(type.key, store);
    }
    return store;
  };

  const isAlive = (entity: Entity): boolean => {
    const index = entityIndex(entity);
    return index < generations.length && generations[index] === entityGeneration(entity);
  };

  const world: World = {
    get size() {
      return liveCount;
    },
    get version() {
      return version;
    },

    create(): Entity {
      const recycled = freeList.pop();
      if (recycled !== undefined) {
        live[recycled] = true;
        liveCount++;
        version++;
        return makeEntity(recycled, generations[recycled] as number);
      }

      const index = generations.length;
      if (index >= MAX_ENTITIES) {
        throw new Error(`createWorld: entity limit (${MAX_ENTITIES}) reached`);
      }
      generations.push(1);
      signatures.push(0);
      live.push(true);
      liveCount++;
      version++;
      return makeEntity(index, 1);
    },

    destroy(entity: Entity): boolean {
      if (!isAlive(entity)) return false;
      const index = entityIndex(entity);

      const signature = signatures[index] as number;
      if (signature !== 0) {
        // Release references so component payloads can be collected.
        for (const store of stores.values()) {
          if ((signature & store.bit) !== 0) store.data[index] = undefined;
        }
      }
      signatures[index] = 0;

      // Generation wraps at 12 bits; skip 0, which marks an unused slot.
      const next = ((generations[index] as number) + 1) & 0xfff;
      generations[index] = next === 0 ? 1 : next;

      live[index] = false;
      freeList.push(index);
      liveCount--;
      version++;
      return true;
    },

    alive: isAlive,

    add<T>(entity: Entity, type: ComponentType<T>, data: T): T {
      if (!isAlive(entity)) {
        throw new Error(`world.add: entity is not alive (component '${type.name}')`);
      }
      const store = storeFor(type);
      const index = entityIndex(entity);
      store.data[index] = data;
      const before = signatures[index] as number;
      const after = before | store.bit;
      if (after !== before) {
        signatures[index] = after;
        version++;
      }
      return data;
    },

    get<T>(entity: Entity, type: ComponentType<T>): T | undefined {
      if (!isAlive(entity)) return undefined;
      const store = stores.get(type.key);
      if (store === undefined) return undefined;
      const index = entityIndex(entity);
      if (((signatures[index] as number) & store.bit) === 0) return undefined;
      return store.data[index] as T;
    },

    has<T>(entity: Entity, type: ComponentType<T>): boolean {
      if (!isAlive(entity)) return false;
      const store = stores.get(type.key);
      if (store === undefined) return false;
      return (((signatures[entityIndex(entity)] as number) & store.bit) as number) !== 0;
    },

    remove<T>(entity: Entity, type: ComponentType<T>): boolean {
      if (!isAlive(entity)) return false;
      const store = stores.get(type.key);
      if (store === undefined) return false;
      const index = entityIndex(entity);
      if (((signatures[index] as number) & store.bit) === 0) return false;
      signatures[index] = (signatures[index] as number) & ~store.bit;
      store.data[index] = undefined;
      version++;
      return true;
    },

    query(...types: readonly ComponentType<unknown>[]): Query {
      // Resolving stores here creates them if needed, so a query built before the first
      // entity still matches once components start being added.
      let mask = 0;
      for (const type of types) mask |= storeFor(type).bit;

      const entities: Entity[] = [];
      let seenVersion = -1;

      const refresh = (): void => {
        if (seenVersion === version) return;
        seenVersion = version;
        entities.length = 0;
        for (let index = 0; index < live.length; index++) {
          if (live[index] !== true) continue;
          if (((signatures[index] as number) & mask) !== mask) continue;
          entities.push(makeEntity(index, generations[index] as number));
        }
      };

      return {
        get entities(): readonly Entity[] {
          refresh();
          return entities;
        },
        get size(): number {
          refresh();
          return entities.length;
        },
        refresh,
      };
    },

    clear(): void {
      generations.length = 0;
      signatures.length = 0;
      live.length = 0;
      freeList.length = 0;
      for (const store of stores.values()) store.data.length = 0;
      liveCount = 0;
      version++;
    },
  };

  return world;
}
