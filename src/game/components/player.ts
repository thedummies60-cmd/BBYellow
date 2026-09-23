/**
 * Marks the entity the player controls, and the state the controller owns.
 *
 * Deliberately thin: health, sanity and inventory are their own components, so the
 * stalker can be given any of them without inheriting a controller.
 */
export interface Player {
  grounded: boolean;
  crouching: boolean;
  /** Eye offset above the feet, smoothed when crouching. */
  eyeHeight: number;
  previousEyeHeight: number;
}
