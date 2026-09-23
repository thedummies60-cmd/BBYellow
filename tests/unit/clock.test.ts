import { describe, expect, it, vi } from 'vitest';
import { createClock } from '@core/clock';

const STEP = 1 / 60;

describe('createClock', () => {
  it('accumulates simulation time', () => {
    const clock = createClock();
    clock.advance(STEP);
    clock.advance(STEP);
    expect(clock.now).toBeCloseTo(STEP * 2, 10);
    expect(clock.frame).toBe(2);
  });

  it('freezes time at scale 0 but still counts frames', () => {
    const clock = createClock();
    clock.scale = 0;
    clock.advance(STEP);
    expect(clock.now).toBe(0);
    expect(clock.frame).toBe(1);
  });

  it('scales time for slow motion', () => {
    const clock = createClock();
    clock.scale = 0.5;
    clock.advance(1);
    expect(clock.now).toBeCloseTo(0.5, 10);
  });

  it('refuses a negative timescale rather than running backwards', () => {
    const clock = createClock();
    clock.scale = -2;
    expect(clock.scale).toBe(0);
  });

  it('fires a timer once its delay has elapsed', () => {
    const clock = createClock();
    const fired = vi.fn();
    clock.schedule(0.1, fired);

    clock.advance(0.05);
    expect(fired).not.toHaveBeenCalled();

    clock.advance(0.06);
    expect(fired).toHaveBeenCalledTimes(1);
  });

  it('never fires a timer synchronously, even at zero delay', () => {
    const clock = createClock();
    const fired = vi.fn();
    clock.schedule(0, fired);
    expect(fired).not.toHaveBeenCalled();
    clock.advance(STEP);
    expect(fired).toHaveBeenCalledTimes(1);
  });

  it('fires each timer only once', () => {
    const clock = createClock();
    const fired = vi.fn();
    clock.schedule(0.01, fired);
    clock.advance(0.02);
    clock.advance(0.02);
    expect(fired).toHaveBeenCalledTimes(1);
  });

  it('does not fire while paused — the scare waits for the player', () => {
    const clock = createClock();
    const fired = vi.fn();
    clock.schedule(0.1, fired);

    clock.scale = 0; // pause menu
    for (let i = 0; i < 100; i++) clock.advance(STEP);
    expect(fired).not.toHaveBeenCalled();

    clock.scale = 1;
    for (let i = 0; i < 10; i++) clock.advance(STEP);
    expect(fired).toHaveBeenCalledTimes(1);
  });

  it('fires timers due in the same step in time order', () => {
    const clock = createClock();
    const order: string[] = [];
    clock.schedule(0.03, () => order.push('third'));
    clock.schedule(0.01, () => order.push('first'));
    clock.schedule(0.02, () => order.push('second'));
    clock.advance(0.05);
    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('breaks ties by scheduling order', () => {
    const clock = createClock();
    const order: number[] = [];
    clock.schedule(0.01, () => order.push(1));
    clock.schedule(0.01, () => order.push(2));
    clock.advance(0.02);
    expect(order).toEqual([1, 2]);
  });

  it('cancels a pending timer', () => {
    const clock = createClock();
    const fired = vi.fn();
    const handle = clock.schedule(0.1, fired);
    expect(clock.cancel(handle)).toBe(true);
    clock.advance(0.2);
    expect(fired).not.toHaveBeenCalled();
  });

  it('reports cancelling an unknown or spent timer', () => {
    const clock = createClock();
    expect(clock.cancel(999)).toBe(false);
    const handle = clock.schedule(0.01, () => {});
    clock.advance(0.02);
    expect(clock.cancel(handle)).toBe(false);
  });

  it('lets a timer cancel another timer due in the same step', () => {
    const clock = createClock();
    const second = vi.fn();
    let handle = 0;
    clock.schedule(0.01, () => clock.cancel(handle));
    handle = clock.schedule(0.02, second);
    clock.advance(0.05);
    expect(second).not.toHaveBeenCalled();
  });

  it('defers a timer scheduled from inside a callback to the next step', () => {
    const clock = createClock();
    const inner = vi.fn();
    clock.schedule(0.01, () => clock.schedule(0, inner));
    clock.advance(0.02);
    expect(inner).not.toHaveBeenCalled(); // would otherwise spin forever
    clock.advance(STEP);
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it('drops pending timers on teardown', () => {
    const clock = createClock();
    const fired = vi.fn();
    clock.schedule(0.1, fired);
    expect(clock.pendingTimers).toBe(1);
    clock.clearTimers();
    expect(clock.pendingTimers).toBe(0);
    clock.advance(0.2);
    expect(fired).not.toHaveBeenCalled();
  });

  it('does not leak spent timers', () => {
    const clock = createClock();
    for (let i = 0; i < 100; i++) clock.schedule(0.01, () => {});
    clock.advance(0.02);
    expect(clock.pendingTimers).toBe(0);
  });

  it('is deterministic across identical runs', () => {
    const run = (): number[] => {
      const clock = createClock();
      const log: number[] = [];
      clock.schedule(0.05, () => log.push(clock.frame));
      clock.schedule(0.12, () => log.push(clock.frame));
      for (let i = 0; i < 20; i++) clock.advance(STEP);
      return log;
    };
    expect(run()).toEqual(run());
  });
});
