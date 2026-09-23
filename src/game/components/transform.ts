/**
 * Position and orientation, with the previous step's values alongside.
 *
 * The pairing is what makes interpolated rendering possible: `app/` blends previous into
 * current using the loop's alpha (CLAUDE.md §3). Without it, motion is locked to the
 * 60 Hz simulation and reads as judder on a faster display.
 *
 * `position` is the entity's **feet**, centred horizontally — the same convention the
 * collision code uses.
 */
import type { Vec3 } from '@core';

export interface Transform {
  position: Vec3;
  previousPosition: Vec3;
  /** Radians. 0 faces -Z; positive turns left. */
  yaw: number;
  previousYaw: number;
  /** Radians. Positive looks up. */
  pitch: number;
  previousPitch: number;
}
