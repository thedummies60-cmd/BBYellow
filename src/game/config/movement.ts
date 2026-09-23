/**
 * Player movement tuning (CLAUDE.md §5).
 *
 * Data, not code: these are the numbers that decide how the game *feels*, and they are
 * meant to be edited without touching a system. Frozen so a system cannot quietly
 * mutate shared balance data at runtime.
 *
 * Units are metres, seconds and radians throughout.
 */
export interface MovementConfig {
  readonly walkSpeed: number;
  readonly sprintSpeed: number;
  readonly crouchSpeed: number;
  /** How fast the player reaches target speed on the ground. Higher is twitchier. */
  readonly groundAcceleration: number;
  /** Control authority in the air, as a fraction of ground acceleration. */
  readonly airControl: number;
  readonly gravity: number;
  readonly jumpSpeed: number;
  /** Terminal velocity, so a long fall cannot tunnel through the floor. */
  readonly maxFallSpeed: number;
  readonly eyeHeight: number;
  readonly crouchEyeHeight: number;
  readonly playerRadius: number;
  readonly playerHeight: number;
  /** Radians of yaw per unit of raw pointer movement. */
  readonly lookSensitivity: number;
  /** Pitch limit. Just under a right angle, or the camera gimbals at the poles. */
  readonly maxPitch: number;
}

export const MOVEMENT: MovementConfig = Object.freeze({
  walkSpeed: 2.6,
  sprintSpeed: 4.4,
  crouchSpeed: 1.2,
  groundAcceleration: 28,
  airControl: 0.25,
  gravity: 18,
  jumpSpeed: 5,
  maxFallSpeed: 40,
  eyeHeight: 1.65,
  crouchEyeHeight: 1.0,
  playerRadius: 0.32,
  playerHeight: 1.8,
  lookSensitivity: 0.0022,
  maxPitch: Math.PI / 2 - 0.02,
});
