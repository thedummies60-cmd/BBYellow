/**
 * Keyboard and mouse to one immutable snapshot per frame (src/game/CLAUDE.md).
 *
 * The single place the game learns that a keyboard exists. Everything downstream reads
 * plain numbers, which is why the movement controller is testable without a browser.
 */
import { clamp } from '@core';
import type { InputSnapshot } from '@shared/input.js';

export interface InputDevice {
  /** The current frame's input. The same object every frame — read it, do not hold it. */
  readonly snapshot: InputSnapshot;
  /** Call after the frame's systems have run, to clear accumulated look deltas. */
  endFrame(): void;
  /** Drop held keys. Call when focus or pointer lock is lost. */
  clear(): void;
  dispose(): void;
}

export interface InputDeviceOptions {
  /** Radians per unit of raw pointer movement. */
  readonly lookSensitivity: number;
  /** Invert vertical look. */
  readonly invertY?: boolean;
  /** Only accumulate mouse movement while this returns true. */
  readonly shouldCaptureLook?: () => boolean;
}

/**
 * A single event carrying a huge delta — after a stall, or from a driver quirk — snaps
 * the camera through 180 degrees. Same reasoning as the loop's frame clamp.
 */
const MAX_DELTA_PER_EVENT = 200;

/** Physical keys, so WASD stays under the same fingers on AZERTY (`code`, not `key`). */
const BINDINGS = Object.freeze({
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  crouch: ['ControlLeft', 'KeyC'],
  jump: ['Space'],
  interact: ['KeyE'],
});

export function createInputDevice(
  target: HTMLElement,
  options: InputDeviceOptions,
): InputDevice {
  const held = new Set<string>();
  const invert = options.invertY === true ? -1 : 1;

  const state = {
    forward: 0,
    strafe: 0,
    sprint: false,
    crouch: false,
    jump: false,
    interact: false,
    lookYaw: 0,
    lookPitch: 0,
  };

  const anyHeld = (codes: readonly string[]): boolean => {
    for (const code of codes) if (held.has(code)) return true;
    return false;
  };

  const refreshAxes = (): void => {
    state.forward = (anyHeld(BINDINGS.forward) ? 1 : 0) - (anyHeld(BINDINGS.back) ? 1 : 0);
    state.strafe = (anyHeld(BINDINGS.right) ? 1 : 0) - (anyHeld(BINDINGS.left) ? 1 : 0);
    state.sprint = anyHeld(BINDINGS.sprint);
    state.crouch = anyHeld(BINDINGS.crouch);
    state.jump = anyHeld(BINDINGS.jump);
    state.interact = anyHeld(BINDINGS.interact);
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    held.add(event.code);
    // Space scrolls the page and the arrows move the caret; neither belongs in a game.
    if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
    refreshAxes();
  };

  const handleKeyUp = (event: KeyboardEvent): void => {
    held.delete(event.code);
    refreshAxes();
  };

  /**
   * Held keys must be dropped on blur. Alt-tabbing mid-sprint otherwise leaves the key
   * stuck down forever: the keyup lands in another window and never reaches us.
   */
  const handleBlur = (): void => {
    held.clear();
    refreshAxes();
  };

  const handleMouseMove = (event: MouseEvent): void => {
    if (options.shouldCaptureLook?.() === false) return;
    const dx = clamp(event.movementX, -MAX_DELTA_PER_EVENT, MAX_DELTA_PER_EVENT);
    const dy = clamp(event.movementY, -MAX_DELTA_PER_EVENT, MAX_DELTA_PER_EVENT);
    // Accumulated, not applied: several events fire per frame, and applying each
    // separately makes look speed depend on frame rate.
    state.lookYaw -= dx * options.lookSensitivity;
    state.lookPitch -= dy * options.lookSensitivity * invert;
  };

  // Right-click is aim/lean, not a context menu.
  const handleContextMenu = (event: Event): void => event.preventDefault();

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('blur', handleBlur);
  window.addEventListener('mousemove', handleMouseMove);
  target.addEventListener('contextmenu', handleContextMenu);

  return {
    snapshot: state,

    endFrame(): void {
      state.lookYaw = 0;
      state.lookPitch = 0;
    },

    clear(): void {
      held.clear();
      refreshAxes();
      state.lookYaw = 0;
      state.lookPitch = 0;
    },

    dispose(): void {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('mousemove', handleMouseMove);
      target.removeEventListener('contextmenu', handleContextMenu);
      held.clear();
    },
  };
}
