/**
 * requestAnimationFrame, behind an interface (CLAUDE.md §2).
 *
 * `core/loop.ts` takes time as an argument precisely so it never touches this. The
 * driver is the one place that reads a real clock, which is what keeps the simulation
 * steppable from a test.
 */

export interface FrameDriver {
  start(): void;
  stop(): void;
  readonly running: boolean;
  /** Stops the driver and releases the callback. */
  dispose(): void;
}

/** @param onFrame receives monotonic time in **seconds**, matching `core/loop.ts`. */
export function createFrameDriver(onFrame: (nowSeconds: number) => void): FrameDriver {
  let handle = 0;
  let running = false;

  const tick = (nowMs: number): void => {
    if (!running) return;
    // Schedule before the callback: a throw in game code must not kill the loop
    // outright, or a single bad frame ends the session.
    handle = requestAnimationFrame(tick);
    onFrame(nowMs / 1000);
  };

  return {
    get running() {
      return running;
    },

    start(): void {
      if (running) return;
      running = true;
      handle = requestAnimationFrame(tick);
    },

    stop(): void {
      if (!running) return;
      running = false;
      cancelAnimationFrame(handle);
      handle = 0;
    },

    dispose(): void {
      this.stop();
    },
  };
}
