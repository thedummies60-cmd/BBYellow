/**
 * Frame instrumentation, as plain data.
 *
 * Lives in `shared/` so `ui/` can display it without importing `render/` — under the
 * layering in CLAUDE.md §2, `ui/` sits above `render/` and may not reach down into it.
 * `render/` produces these numbers; the overlay only formats them.
 */
export interface FrameStats {
  /** Smoothed frames per second, measured from the frame interval. */
  fps: number;
  /**
   * CPU work per frame in milliseconds: simulation + scene update + draw submission.
   *
   * Not the frame interval, and not GPU time — the GPU runs asynchronously and needs
   * timer queries to measure. Read this against the 16.6 ms budget as "how much of the
   * frame we spend on the main thread", and `fps` for whether we are actually hitting 60.
   */
  frameMs: number;
  /** Time inside fixed-step simulation. Budget: 4. */
  simMs: number;
  /** Time submitting draw calls — CPU-side, not GPU execution. Budget: 8. */
  renderMs: number;
  /** Budget: 300. */
  drawCalls: number;
  /** Budget: 1.5M. */
  triangles: number;
  /** Fixed steps run this frame. Usually 0-2; a spike means a hitch. */
  steps: number;
  /** Simulation seconds discarded to the loop's clamp. Non-zero means a stall. */
  droppedTime: number;
  /** Live entities in the world. */
  entities: number;
}

export function createFrameStats(): FrameStats {
  return {
    fps: 0,
    frameMs: 0,
    simMs: 0,
    renderMs: 0,
    drawCalls: 0,
    triangles: 0,
    steps: 0,
    droppedTime: 0,
    entities: 0,
  };
}
