/**
 * One frame of input, as plain data.
 *
 * Lives in `shared/` so `game/` can act on input without knowing a keyboard exists, and
 * so a movement test can pass a literal object instead of faking a browser. `input/`
 * produces it; nothing else writes it.
 *
 * The same object is reused every frame (CLAUDE.md §3), so consumers must read it within
 * the frame rather than holding a reference.
 */
export interface InputSnapshot {
  /** -1 (back) to 1 (forward). */
  readonly forward: number;
  /** -1 (left) to 1 (right). */
  readonly strafe: number;
  readonly sprint: boolean;
  readonly crouch: boolean;
  readonly jump: boolean;
  readonly interact: boolean;
  /**
   * Yaw delta accumulated this frame, in radians. Positive turns left.
   *
   * Accumulated across every mousemove in the frame and consumed once — several events
   * fire per frame, and applying each one separately makes look speed depend on frame
   * rate (docs/browser-integration.md).
   */
  readonly lookYaw: number;
  /** Pitch delta this frame, in radians. Positive looks up. */
  readonly lookPitch: number;
}

/** A snapshot with nothing pressed. Useful as a test baseline and while paused. */
export const IDLE_INPUT: InputSnapshot = Object.freeze({
  forward: 0,
  strafe: 0,
  sprint: false,
  crouch: false,
  jump: false,
  interact: false,
  lookYaw: 0,
  lookPitch: 0,
});
