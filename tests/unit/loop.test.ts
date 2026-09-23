import { describe, expect, it, vi } from 'vitest';
import { createLoop, FIXED_DT, MAX_CATCH_UP_STEPS, MAX_FRAME_TIME } from '@core/loop';

describe('createLoop', () => {
  it('anchors on the first advance without stepping', () => {
    const update = vi.fn();
    const loop = createLoop(update);
    expect(loop.advance(100)).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });

  it('runs one step per elapsed fixed interval', () => {
    const update = vi.fn();
    const loop = createLoop(update);
    loop.advance(0);
    loop.advance(FIXED_DT * 3);
    expect(update).toHaveBeenCalledTimes(3);
    expect(update).toHaveBeenCalledWith(FIXED_DT);
  });

  it('always steps with the fixed dt, never the frame delta', () => {
    const deltas: number[] = [];
    const loop = createLoop((dt) => deltas.push(dt));
    loop.advance(0);
    loop.advance(0.031); // an irregular ~32 ms frame
    expect(deltas.every((d) => d === FIXED_DT)).toBe(true);
  });

  it('returns interpolation alpha in [0, 1)', () => {
    const loop = createLoop(() => {});
    loop.advance(0);
    const alpha = loop.advance(FIXED_DT * 1.5);
    expect(alpha).toBeGreaterThanOrEqual(0);
    expect(alpha).toBeLessThan(1);
    expect(alpha).toBeCloseTo(0.5, 5);
  });

  it('clamps a long gap so a backgrounded tab cannot teleport the player', () => {
    const update = vi.fn();
    const loop = createLoop(update);
    loop.advance(0);
    loop.advance(30); // tab was hidden for 30 s

    // Without the clamp this would be 1800 steps.
    expect(update.mock.calls.length).toBeLessThanOrEqual(MAX_CATCH_UP_STEPS);
    expect(loop.stats.droppedTime).toBeGreaterThan(30 - MAX_FRAME_TIME - 1);
  });

  it('caps catch-up steps per frame to avoid the spiral of death', () => {
    const update = vi.fn();
    const loop = createLoop(update);
    loop.advance(0);
    loop.advance(MAX_FRAME_TIME); // 0.1 s = 6 steps' worth, capped at 5
    expect(update.mock.calls.length).toBe(MAX_CATCH_UP_STEPS);
    expect(loop.stats.droppedTime).toBeGreaterThan(0);
  });

  it('does not rewind when the clock goes backwards', () => {
    const update = vi.fn();
    const loop = createLoop(update);
    loop.advance(10);
    expect(() => loop.advance(5)).not.toThrow();
    expect(update).not.toHaveBeenCalled();
  });

  it('discards the pending gap on reset', () => {
    // Without the reset, a 10 s gap is clamped and reported as dropped time.
    const stalled = createLoop(() => {});
    stalled.advance(0);
    stalled.advance(10);
    expect(stalled.stats.droppedTime).toBeGreaterThan(0);

    // With it, the gap is gone and the next frame is an ordinary one.
    const update = vi.fn();
    const loop = createLoop(update);
    loop.advance(0);
    loop.reset(10); // e.g. resuming from a pause menu
    loop.advance(10.02);
    expect(loop.stats.droppedTime).toBe(0);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('is deterministic: identical time sequences produce identical step counts', () => {
    const run = (): number => {
      let steps = 0;
      const loop = createLoop(() => steps++);
      let t = 0;
      loop.advance(t);
      for (const frame of [0.016, 0.021, 0.009, 0.033, 0.017]) {
        t += frame;
        loop.advance(t);
      }
      return steps;
    };
    expect(run()).toBe(run());
  });

  it('rejects a non-positive fixed dt', () => {
    expect(() => createLoop(() => {}, { fixedDt: 0 })).toThrow();
  });
});
