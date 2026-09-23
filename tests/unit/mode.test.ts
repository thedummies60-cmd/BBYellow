import { describe, expect, it, vi } from 'vitest';
import { createModeMachine, GameMode } from '@game/mode';

describe('createModeMachine', () => {
  it('starts in the menu', () => {
    expect(createModeMachine().current).toBe(GameMode.Menu);
  });

  it('allows a designed transition', () => {
    const mode = createModeMachine();
    expect(mode.enter(GameMode.Loading)).toBe(true);
    expect(mode.is(GameMode.Loading)).toBe(true);
  });

  it('rejects an undesigned transition and changes nothing', () => {
    const mode = createModeMachine();
    expect(mode.enter(GameMode.Paused)).toBe(false); // cannot pause from the menu
    expect(mode.current).toBe(GameMode.Menu);
  });

  it('treats re-entering the current mode as a no-op success', () => {
    const mode = createModeMachine();
    const listener = vi.fn();
    mode.onChange(listener);
    expect(mode.enter(GameMode.Menu)).toBe(true);
    expect(listener).not.toHaveBeenCalled();
  });

  it('simulates only while playing', () => {
    const mode = createModeMachine();
    expect(mode.simulating).toBe(false);

    mode.enter(GameMode.Loading);
    expect(mode.simulating).toBe(false);

    mode.enter(GameMode.Playing);
    expect(mode.simulating).toBe(true);

    mode.enter(GameMode.Paused);
    expect(mode.simulating).toBe(false);

    mode.enter(GameMode.Playing);
    mode.enter(GameMode.GameOver);
    expect(mode.simulating).toBe(false);
  });

  it('cannot pause once dead', () => {
    const mode = createModeMachine();
    mode.enter(GameMode.Loading);
    mode.enter(GameMode.Playing);
    mode.enter(GameMode.GameOver);
    expect(mode.enter(GameMode.Paused)).toBe(false);
    expect(mode.current).toBe(GameMode.GameOver);
  });

  it('notifies listeners with both modes', () => {
    const mode = createModeMachine();
    const listener = vi.fn();
    mode.onChange(listener);
    mode.enter(GameMode.Loading);
    expect(listener).toHaveBeenCalledWith(GameMode.Loading, GameMode.Menu);
  });

  it('stops notifying after unsubscribe', () => {
    const mode = createModeMachine();
    const listener = vi.fn();
    const off = mode.onChange(listener);
    off();
    mode.enter(GameMode.Loading);
    expect(listener).not.toHaveBeenCalled();
  });

  it('survives a listener unsubscribing during dispatch', () => {
    const mode = createModeMachine();
    const second = vi.fn();
    const off = mode.onChange(() => off());
    mode.onChange(second);
    expect(() => mode.enter(GameMode.Loading)).not.toThrow();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('reports reachability without transitioning', () => {
    const mode = createModeMachine();
    expect(mode.canEnter(GameMode.Loading)).toBe(true);
    expect(mode.canEnter(GameMode.Playing)).toBe(false);
    expect(mode.current).toBe(GameMode.Menu);
  });
});
