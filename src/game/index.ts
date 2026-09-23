/** Public surface of game/ (CLAUDE.md §6). */

export { createModeMachine, GameMode } from './mode.js';
export type { ModeListener, ModeMachine } from './mode.js';

export { MOVEMENT, validateNumbers } from './config/index.js';
export type { MovementConfig, Rule } from './config/index.js';

export type { Transform } from './components/transform.js';
export type { Velocity } from './components/velocity.js';
export type { Player } from './components/player.js';

export { createMovementSystem } from './systems/movement.js';
export type { MovementComponents } from './systems/movement.js';

export {
  aabb,
  aabbFromBox,
  collidersFromLevel,
  createMoveResult,
  moveAndCollide,
  overlaps,
} from './collision.js';
export type { Aabb, MoveResult } from './collision.js';

export { DEBUG_LEVEL } from './scenes/debug-level.js';
