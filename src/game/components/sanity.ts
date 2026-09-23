/**
 * Composure, drained by darkness and by being hunted.
 *
 * Drives the grain and vignette in `render/postfx` and the heartbeat in `audio/`, but
 * knows about neither — it is a number the presentation layers read.
 */
export interface Sanity {
  /** 0-100. */
  value: number;
  previousValue: number;
}
