/**
 * Flashlight tuning (CLAUDE.md §5).
 *
 * The battery is the tension: light is safety, and safety is finite. The numbers below
 * are the whole bargain, which is why they are data.
 */
export interface FlashlightConfig {
  /** Seconds of continuous use from full. */
  readonly batterySeconds: number;
  /** Fraction below which it starts to flicker, as a warning. */
  readonly flickerBelow: number;
  readonly coneAngle: number;
  /**
   * Candela. Three uses physical light units, so this is much larger than the
   * 0-1-ish figure older examples use — at 22 the cone was invisible against the
   * level's own lights, which is how the smoke test caught it.
   */
  readonly intensity: number;
  readonly range: number;
}

export const FLASHLIGHT: FlashlightConfig = Object.freeze({
  batterySeconds: 95,
  flickerBelow: 0.2,
  coneAngle: Math.PI / 7,
  intensity: 120,
  range: 18,
});
