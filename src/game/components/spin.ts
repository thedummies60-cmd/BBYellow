/**
 * A prop rotating at a constant rate.
 *
 * Bring-up content: it exists so the interpolation path has something to interpolate.
 * Note the shape, though — it is the pattern every interpolated component follows.
 * `previousAngle` is the state at the end of the last fixed step; the renderer blends
 * between it and `angle` using the loop's alpha. Without that pair, motion is locked to
 * the simulation rate and reads as judder on a 144 Hz display.
 */
export interface Spin {
  angle: number;
  previousAngle: number;
  /** Radians per simulation second. */
  speed: number;
}
