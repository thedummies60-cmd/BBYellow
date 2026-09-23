/**
 * Config surface, validated at import time (CLAUDE.md §5).
 *
 * The import itself is the validation: a bad value fails the module load, so the game
 * cannot reach a playable state carrying nonsense.
 */
import { CUES, validateCues } from './cues.js';
import { FLASHLIGHT } from './flashlight.js';
import { MOVEMENT } from './movement.js';
import { SANITY, THREAT } from './threat.js';
import { validateNumbers } from './validate.js';

validateNumbers('MOVEMENT', MOVEMENT, {
  walkSpeed: 'positive',
  sprintSpeed: 'positive',
  crouchSpeed: 'positive',
  groundAcceleration: 'positive',
  airControl: 'nonNegative',
  gravity: 'positive',
  jumpSpeed: 'positive',
  maxFallSpeed: 'positive',
  eyeHeight: 'positive',
  crouchEyeHeight: 'positive',
  playerRadius: 'positive',
  playerHeight: 'positive',
  lookSensitivity: 'positive',
  maxPitch: 'positive',
});

validateNumbers('THREAT', THREAT, {
  patrolSpeed: 'positive',
  investigateSpeed: 'positive',
  huntSpeed: 'positive',
  sightRange: 'positive',
  sightCone: 'finite',
  awarenessToHunt: 'positive',
  searchDuration: 'positive',
  investigateDuration: 'positive',
  catchRadius: 'positive',
  arriveRadius: 'positive',
  hearWalk: 'positive',
  hearSprint: 'positive',
  breathRange: 'positive',
});

validateNumbers('SANITY', SANITY, {
  drainInDarkness: 'positive',
  recoverInLight: 'positive',
  drainWhileHunted: 'positive',
  panicThreshold: 'positive',
  litRadius: 'positive',
});

validateNumbers('FLASHLIGHT', FLASHLIGHT, {
  batterySeconds: 'positive',
  flickerBelow: 'positive',
  coneAngle: 'positive',
  intensity: 'positive',
  range: 'positive',
});

validateCues(CUES);

/**
 * The stalker must be outrunnable. A threat faster than a sprinting player turns every
 * mistake into a death and teaches the player to stop taking risks, which is the
 * opposite of what a horror game wants (docs/horror-design-principles.md).
 */
if (THREAT.huntSpeed >= MOVEMENT.sprintSpeed) {
  throw new Error(
    `THREAT.huntSpeed (${THREAT.huntSpeed}) must stay below MOVEMENT.sprintSpeed ` +
      `(${MOVEMENT.sprintSpeed}) — the player has to be able to escape`,
  );
}

export { CUES, validateCues } from './cues.js';
export { FLASHLIGHT } from './flashlight.js';
export type { FlashlightConfig } from './flashlight.js';
export { SANITY, THREAT } from './threat.js';
export type { SanityConfig, ThreatConfig } from './threat.js';
export { MOVEMENT } from './movement.js';
export type { MovementConfig } from './movement.js';
export { validateNumbers } from './validate.js';
export type { Rule } from './validate.js';
