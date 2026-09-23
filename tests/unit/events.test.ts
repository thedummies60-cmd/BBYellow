import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '@core/events';

interface Events extends Record<string, unknown> {
  StalkerSpotted: { entity: number };
  DoorOpened: { id: string };
}

describe('createEventBus', () => {
  it('delivers a payload to a subscriber', () => {
    const bus = createEventBus<Events>();
    const handler = vi.fn();
    bus.on('StalkerSpotted', handler);
    bus.emit('StalkerSpotted', { entity: 7 });
    expect(handler).toHaveBeenCalledWith({ entity: 7 });
  });

  it('runs identically with no subscribers', () => {
    const bus = createEventBus<Events>();
    expect(() => bus.emit('DoorOpened', { id: 'cellar' })).not.toThrow();
  });

  it('does not cross event types', () => {
    const bus = createEventBus<Events>();
    const handler = vi.fn();
    bus.on('DoorOpened', handler);
    bus.emit('StalkerSpotted', { entity: 1 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('delivers to every subscriber in subscription order', () => {
    const bus = createEventBus<Events>();
    const order: number[] = [];
    bus.on('DoorOpened', () => order.push(1));
    bus.on('DoorOpened', () => order.push(2));
    bus.on('DoorOpened', () => order.push(3));
    bus.emit('DoorOpened', { id: 'a' });
    expect(order).toEqual([1, 2, 3]);
  });

  it('stops delivering after unsubscribe', () => {
    const bus = createEventBus<Events>();
    const handler = vi.fn();
    const off = bus.on('DoorOpened', handler);
    off();
    bus.emit('DoorOpened', { id: 'a' });
    expect(handler).not.toHaveBeenCalled();
    expect(bus.count()).toBe(0);
  });

  it('is idempotent on repeated unsubscribe', () => {
    const bus = createEventBus<Events>();
    const off = bus.on('DoorOpened', vi.fn());
    off();
    expect(() => off()).not.toThrow();
  });

  it('unsubscribes only the subscription that owns the disposer', () => {
    const bus = createEventBus<Events>();
    const handler = vi.fn();
    const first = bus.on('DoorOpened', handler);
    bus.on('DoorOpened', handler); // same function, second subscription
    first();
    bus.emit('DoorOpened', { id: 'a' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('fires a once handler exactly once', () => {
    const bus = createEventBus<Events>();
    const handler = vi.fn();
    bus.once('DoorOpened', handler);
    bus.emit('DoorOpened', { id: 'a' });
    bus.emit('DoorOpened', { id: 'b' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(bus.count()).toBe(0);
  });

  it('survives a handler unsubscribing itself mid-dispatch', () => {
    const bus = createEventBus<Events>();
    const later = vi.fn();
    const off = bus.on('DoorOpened', () => off());
    bus.on('DoorOpened', later);
    expect(() => bus.emit('DoorOpened', { id: 'a' })).not.toThrow();
    expect(later).toHaveBeenCalledTimes(1);
    expect(bus.count()).toBe(1);
  });

  it('survives a handler unsubscribing a later one mid-dispatch', () => {
    const bus = createEventBus<Events>();
    const second = vi.fn();
    let off = (): void => {};
    bus.on('DoorOpened', () => off());
    off = bus.on('DoorOpened', second);
    bus.emit('DoorOpened', { id: 'a' });
    expect(second).not.toHaveBeenCalled();
  });

  it('does not deliver to a handler subscribed during the same dispatch', () => {
    const bus = createEventBus<Events>();
    const added = vi.fn();
    bus.on('DoorOpened', () => {
      bus.on('DoorOpened', added);
    });
    bus.emit('DoorOpened', { id: 'a' });
    expect(added).not.toHaveBeenCalled();

    bus.emit('DoorOpened', { id: 'b' });
    expect(added).toHaveBeenCalledTimes(1);
  });

  it('supports re-entrant emit', () => {
    const bus = createEventBus<Events>();
    const inner = vi.fn();
    bus.on('DoorOpened', () => bus.emit('StalkerSpotted', { entity: 1 }));
    bus.on('StalkerSpotted', inner);
    bus.emit('DoorOpened', { id: 'a' });
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it('drops every subscription on clear, for scene teardown', () => {
    const bus = createEventBus<Events>();
    bus.on('DoorOpened', vi.fn());
    bus.on('StalkerSpotted', vi.fn());
    expect(bus.count()).toBe(2);
    bus.clear();
    expect(bus.count()).toBe(0);
  });

  it('counts per type', () => {
    const bus = createEventBus<Events>();
    bus.on('DoorOpened', vi.fn());
    bus.on('DoorOpened', vi.fn());
    bus.on('StalkerSpotted', vi.fn());
    expect(bus.count('DoorOpened')).toBe(2);
    expect(bus.count('StalkerSpotted')).toBe(1);
  });
});
