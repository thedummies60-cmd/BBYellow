import type { Vec3 } from '@core';

/** Metres per second. Integrated by the movement system at the fixed step. */
export interface Velocity {
  linear: Vec3;
}
