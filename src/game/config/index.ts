/**
 * Config surface, validated at import time (CLAUDE.md §5).
 *
 * The import itself is the validation: a bad value fails the module load, so the game
 * cannot reach a playable state carrying nonsense.
 */
import { MOVEMENT } from './movement.js';
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

export { MOVEMENT } from './movement.js';
export type { MovementConfig } from './movement.js';
export { validateNumbers } from './validate.js';
export type { Rule } from './validate.js';
