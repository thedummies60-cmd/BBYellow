/**
 * Simulation clock (CLAUDE.md §11).
 *
 * The replacement for `setTimeout` in gameplay code. Sim time pauses with the game,
 * scales for slow-motion, steps deterministically in tests, and does not advance while
 * the tab is hidden — none of which wall-clock timers do. A scare scheduled on
 * `setTimeout` fires while the player is in the pause menu.
 *
 * Fed the fixed `dt` from `core/loop.ts`.
 */

export type TimerHandle = number;

export interface Clock {
  /** Simulation seconds elapsed. Not wall time. */
  readonly now: number;
  /** Fixed steps advanced. */
  readonly frame: number;
  /** Time multiplier. 0 freezes the simulation; 0.3 is slow motion. */
  scale: number;
  /** Advance by one fixed step. `dt` is scaled before being applied. */
  advance(dt: number): void;
  /**
   * Run `callback` after `delay` simulation seconds.
   *
   * Fires during `advance`, so it is subject to pause and timescale like everything
   * else. A delay of 0 or less fires on the next advance, never synchronously.
   */
  schedule(delay: number, callback: () => void): TimerHandle;
  cancel(handle: TimerHandle): boolean;
  /** Drop every pending timer. Part of scene teardown (CLAUDE.md §4). */
  clearTimers(): void;
  readonly pendingTimers: number;
}

interface Timer {
  handle: TimerHandle;
  due: number;
  /** Creation order — fires timers deterministically when two come due together. */
  seq: number;
  callback: (() => void) | null;
}

export function createClock(): Clock {
  let now = 0;
  let frame = 0;
  let scale = 1;
  let nextHandle = 1;
  let nextSeq = 0;
  const timers: Timer[] = [];

  const removeDead = (): void => {
    let write = 0;
    for (let read = 0; read < timers.length; read++) {
      const timer = timers[read] as Timer;
      if (timer.callback !== null) timers[write++] = timer;
    }
    timers.length = write;
  };

  return {
    get now() {
      return now;
    },
    get frame() {
      return frame;
    },
    get scale() {
      return scale;
    },
    set scale(value: number) {
      scale = value < 0 ? 0 : value;
    },
    get pendingTimers() {
      let count = 0;
      for (const timer of timers) if (timer.callback !== null) count++;
      return count;
    },

    advance(dt: number): void {
      now += dt * scale;
      frame++;

      if (timers.length === 0) return;

      // Only timers that existed when this step began are eligible. A callback that
      // schedules a zero-delay timer would otherwise be due immediately and spin forever.
      const cutoff = nextSeq;
      let fired = false;

      // Repeatedly take the earliest due timer, so callbacks observe them in time order
      // even when several come due in the same step. No allocation: no sorting, no
      // intermediate array.
      for (;;) {
        let earliest: Timer | null = null;
        for (const timer of timers) {
          if (timer.callback === null || timer.seq >= cutoff || timer.due > now) continue;
          if (
            earliest === null ||
            timer.due < earliest.due ||
            (timer.due === earliest.due && timer.seq < earliest.seq)
          ) {
            earliest = timer;
          }
        }
        if (earliest === null) break;

        const callback = earliest.callback;
        earliest.callback = null; // before invoking, so a throw cannot re-fire it
        fired = true;
        if (callback !== null) callback();
      }

      if (fired) removeDead();
    },

    schedule(delay: number, callback: () => void): TimerHandle {
      const handle = nextHandle++;
      timers.push({ handle, due: now + Math.max(0, delay), seq: nextSeq++, callback });
      return handle;
    },

    cancel(handle: TimerHandle): boolean {
      for (const timer of timers) {
        if (timer.handle === handle && timer.callback !== null) {
          timer.callback = null;
          return true;
        }
      }
      return false;
    },

    clearTimers(): void {
      timers.length = 0;
    },
  };
}
