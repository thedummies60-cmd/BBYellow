/**
 * Fixed-timestep loop with interpolated rendering (CLAUDE.md §3).
 *
 * Pure: takes time as an argument rather than reading a clock, so it has no DOM
 * dependency and steps deterministically in tests. `platform/` feeds it `performance.now()`.
 */

/** Simulation step. 60 Hz. Gameplay timing is expressed in these, never in frames. */
export const FIXED_DT = 1 / 60;

/**
 * Longest real-time gap we will simulate from one frame to the next.
 *
 * A backgrounded tab, a breakpoint, or a long GC pause produces a gap of seconds. Fed
 * in raw that becomes hundreds of catch-up steps at once: the player teleports, movement
 * tunnels through walls, and every encounter timer fires simultaneously. We clamp and
 * accept that sim time falls behind wall time — nothing in a single-player game depends
 * on the two agreeing.
 */
export const MAX_FRAME_TIME = 0.1;

/** Catch-up steps per frame. Guards the spiral of death when a machine can't keep up. */
export const MAX_CATCH_UP_STEPS = 5;

export interface LoopOptions {
  readonly fixedDt?: number;
  readonly maxFrameTime?: number;
  readonly maxCatchUpSteps?: number;
}

export interface LoopStats {
  /** Fixed steps run during the last `advance`. Usually 0–2. */
  readonly steps: number;
  /** Sim seconds discarded to the clamp or the catch-up cap. Non-zero means a hitch. */
  readonly droppedTime: number;
}

export interface Loop {
  /**
   * Advance by the real time elapsed since the previous call, running as many fixed
   * steps as fit.
   *
   * @param now Monotonic time in **seconds**.
   * @returns `alpha` in [0, 1) — how far between the last two sim states the renderer
   *          should interpolate. The renderer must not simulate; it only blends.
   */
  advance(now: number): number;
  /** Re-anchor to `now`, discarding the pending gap. Call after a pause or a scene load. */
  reset(now: number): void;
  readonly stats: LoopStats;
}

export function createLoop(onFixedUpdate: (dt: number) => void, options: LoopOptions = {}): Loop {
  const fixedDt = options.fixedDt ?? FIXED_DT;
  const maxFrameTime = options.maxFrameTime ?? MAX_FRAME_TIME;
  const maxSteps = options.maxCatchUpSteps ?? MAX_CATCH_UP_STEPS;

  if (fixedDt <= 0) throw new Error('createLoop: fixedDt must be positive');

  let accumulator = 0;
  let lastTime: number | null = null;
  let steps = 0;
  let droppedTime = 0;

  const stats: LoopStats = {
    get steps() {
      return steps;
    },
    get droppedTime() {
      return droppedTime;
    },
  };

  return {
    stats,

    reset(now: number): void {
      lastTime = now;
      accumulator = 0;
      steps = 0;
      droppedTime = 0;
    },

    advance(now: number): number {
      steps = 0;
      droppedTime = 0;

      if (lastTime === null) {
        // First frame: anchor only. There is no previous state to step from.
        lastTime = now;
        return 0;
      }

      let elapsed = now - lastTime;
      lastTime = now;

      // A non-monotonic clock would otherwise rewind the simulation.
      if (elapsed < 0) elapsed = 0;

      if (elapsed > maxFrameTime) {
        droppedTime += elapsed - maxFrameTime;
        elapsed = maxFrameTime;
      }

      accumulator += elapsed;

      while (accumulator >= fixedDt && steps < maxSteps) {
        onFixedUpdate(fixedDt);
        accumulator -= fixedDt;
        steps++;
      }

      // Still behind after the cap: this machine cannot keep up. Shed the backlog
      // rather than compounding it into a spiral.
      if (accumulator >= fixedDt) {
        droppedTime += accumulator;
        accumulator = 0;
      }

      return accumulator / fixedDt;
    },
  };
}
