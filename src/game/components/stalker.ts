import type { Vec3 } from '@core';

/**
 * The threat's state machine.
 *
 * Kept legible on purpose (docs/horror-design-principles.md): a player must be able to
 * reconstruct their death from one system. Each state has one job and one way out.
 */
export type StalkerState =
  /** Walking the patrol route, unaware. */
  | 'patrol'
  /** Heard something; heading to where it came from. */
  | 'investigate'
  /** Can see the player; closing. */
  | 'hunt'
  /** Lost them; searching the last known position before giving up. */
  | 'search';

export interface Stalker {
  state: StalkerState;
  position: Vec3;
  previousPosition: Vec3;
  /** Facing, for the model and for the sight cone. */
  yaw: number;
  previousYaw: number;
  /** Index into the level's patrol route. */
  patrolIndex: number;
  /** Where it is heading — a patrol point, a noise, or the player. */
  goal: Vec3;
  /** Seconds left in the current state before it gives up or moves on. */
  timer: number;
  /** How long the player has been visible, so a glimpse is not instant detection. */
  awareness: number;
}
