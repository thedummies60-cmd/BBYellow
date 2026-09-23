/**
 * Stalker and sanity tuning (CLAUDE.md §5).
 *
 * These are the numbers that decide whether the game is tense or unfair, which is
 * exactly why they are data a designer can change without reading a system.
 */
export interface ThreatConfig {
  readonly patrolSpeed: number;
  readonly investigateSpeed: number;
  readonly huntSpeed: number;
  /** How far it can see, in metres. */
  readonly sightRange: number;
  /** Half-angle of the sight cone, as a cosine. 0.45 is roughly 63 degrees. */
  readonly sightCone: number;
  /** Seconds of unbroken sight before it commits to a hunt. */
  readonly awarenessToHunt: number;
  /** Seconds it keeps hunting after losing sight. */
  readonly searchDuration: number;
  /** Seconds it spends investigating a noise before returning to patrol. */
  readonly investigateDuration: number;
  /** How close it must get to catch you. */
  readonly catchRadius: number;
  /** How close it must get to a goal to consider it reached. */
  readonly arriveRadius: number;
  /** Hearing range in metres, per movement mode. Crouching is silent. */
  readonly hearWalk: number;
  readonly hearSprint: number;
  /** Distance at which the player starts hearing it breathe. */
  readonly breathRange: number;
}

export const THREAT: ThreatConfig = Object.freeze({
  patrolSpeed: 1.15,
  investigateSpeed: 1.9,
  // Deliberately below the player's sprint (4.4): it must be escapable, or a mistake
  // becomes a death sentence and the player stops taking risks.
  huntSpeed: 3.6,
  sightRange: 14,
  sightCone: 0.45,
  awarenessToHunt: 0.35,
  searchDuration: 9,
  investigateDuration: 6,
  catchRadius: 1.1,
  arriveRadius: 0.9,
  hearWalk: 7,
  hearSprint: 15,
  breathRange: 12,
});

export interface SanityConfig {
  /** Points per second lost in darkness. */
  readonly drainInDarkness: number;
  /** Points per second regained in light. */
  readonly recoverInLight: number;
  /** Extra drain per second while the stalker is hunting you. */
  readonly drainWhileHunted: number;
  /** Below this, the heartbeat starts. */
  readonly panicThreshold: number;
  /** Distance from a light source that counts as lit. */
  readonly litRadius: number;
}

export const SANITY: SanityConfig = Object.freeze({
  drainInDarkness: 2.4,
  recoverInLight: 4,
  drainWhileHunted: 6,
  panicThreshold: 45,
  litRadius: 5,
});
