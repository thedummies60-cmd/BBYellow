/**
 * Typed event bus (CLAUDE.md §2) — the sanctioned channel for talking *upward*.
 *
 * `game/` emits `StalkerSpotted`; `render/`, `audio/` and `ui/` subscribe. The
 * simulation does not know they exist and runs identically with no subscribers at all,
 * which is exactly how the headless tests run it.
 *
 * Dispatch is allocation-free: handlers live in a plain array walked by index, and
 * removals during dispatch are tombstoned and compacted afterwards rather than copying
 * the list on every emit.
 */

/** Event map: `{ StalkerSpotted: { entity: number }, DoorOpened: { id: string } }`. */
export type EventMap = Record<string, unknown>;

export type Handler<T> = (payload: T) => void;

export type Unsubscribe = () => void;

export interface EventBus<M extends EventMap> {
  /** Subscribe. Returns an unsubscribe function — call it on teardown (CLAUDE.md §4). */
  on<K extends keyof M & string>(type: K, handler: Handler<M[K]>): Unsubscribe;
  /** Subscribe for a single dispatch. */
  once<K extends keyof M & string>(type: K, handler: Handler<M[K]>): Unsubscribe;
  off<K extends keyof M & string>(type: K, handler: Handler<M[K]>): void;
  emit<K extends keyof M & string>(type: K, payload: M[K]): void;
  /** Number of live handlers, for leak assertions in tests. */
  count(type?: string): number;
  /** Drop every subscription. Part of scene teardown. */
  clear(): void;
}

interface Slot {
  /** Null once removed; compacted after dispatch finishes. */
  handler: ((payload: never) => void) | null;
  once: boolean;
}

export function createEventBus<M extends EventMap>(): EventBus<M> {
  const slots = new Map<string, Slot[]>();
  /** Dispatch depth; compaction is deferred while non-zero (emit can be re-entrant). */
  let dispatching = 0;
  const dirty = new Set<string>();

  const compact = (type: string): void => {
    const list = slots.get(type);
    if (list === undefined) return;
    let write = 0;
    for (let read = 0; read < list.length; read++) {
      const slot = list[read] as Slot;
      if (slot.handler !== null) list[write++] = slot;
    }
    list.length = write;
    if (write === 0) slots.delete(type);
  };

  const remove = (type: string, handler: unknown): void => {
    const list = slots.get(type);
    if (list === undefined) return;
    for (let i = 0; i < list.length; i++) {
      const slot = list[i] as Slot;
      if (slot.handler === handler) {
        slot.handler = null;
        break;
      }
    }
    if (dispatching > 0) dirty.add(type);
    else compact(type);
  };

  const subscribe = (type: string, handler: (payload: never) => void, once: boolean): Unsubscribe => {
    let list = slots.get(type);
    if (list === undefined) {
      list = [];
      slots.set(type, list);
    }
    const slot: Slot = { handler, once };
    list.push(slot);

    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      // Clear this exact slot, not the first matching handler: the same function may
      // be subscribed more than once, and each subscription owns its own disposer.
      slot.handler = null;
      if (dispatching > 0) dirty.add(type);
      else compact(type);
    };
  };

  return {
    on<K extends keyof M & string>(type: K, handler: Handler<M[K]>): Unsubscribe {
      return subscribe(type, handler as (payload: never) => void, false);
    },

    once<K extends keyof M & string>(type: K, handler: Handler<M[K]>): Unsubscribe {
      return subscribe(type, handler as (payload: never) => void, true);
    },

    off<K extends keyof M & string>(type: K, handler: Handler<M[K]>): void {
      remove(type, handler);
    },

    emit<K extends keyof M & string>(type: K, payload: M[K]): void {
      const list = slots.get(type);
      if (list === undefined) return;

      dispatching++;
      // Length is snapshotted: a handler that subscribes during dispatch is not called
      // by the dispatch that added it, which would otherwise recurse indefinitely.
      const end = list.length;
      for (let i = 0; i < end; i++) {
        const slot = list[i] as Slot;
        const handler = slot.handler;
        if (handler === null) continue;
        if (slot.once) {
          slot.handler = null;
          dirty.add(type);
        }
        (handler as Handler<M[K]>)(payload);
      }
      dispatching--;

      if (dispatching === 0 && dirty.size > 0) {
        for (const t of dirty) compact(t);
        dirty.clear();
      }
    },

    count(type?: string): number {
      let total = 0;
      for (const [key, list] of slots) {
        if (type !== undefined && key !== type) continue;
        for (const slot of list) if (slot.handler !== null) total++;
      }
      return total;
    },

    clear(): void {
      slots.clear();
      dirty.clear();
    },
  };
}
