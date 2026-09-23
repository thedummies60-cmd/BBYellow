/** Public surface of game/ (CLAUDE.md §6). */

export { createModeMachine, GameMode } from './mode.js';
export type { ModeListener, ModeMachine } from './mode.js';

export {
  CUES,
  FLASHLIGHT,
  MOVEMENT,
  SANITY,
  THREAT,
  validateCues,
  validateNumbers,
} from './config/index.js';
export type {
  FlashlightConfig,
  MovementConfig,
  Rule,
  SanityConfig,
  ThreatConfig,
} from './config/index.js';

export type { Transform } from './components/transform.js';
export type { Velocity } from './components/velocity.js';
export type { Player } from './components/player.js';
export type { Interactable } from './components/interactable.js';
export type { Sanity } from './components/sanity.js';
export type { Stalker, StalkerState } from './components/stalker.js';

export { createMovementSystem } from './systems/movement.js';
export type { MovementComponents } from './systems/movement.js';

export {
  createInteractionResult,
  findTarget,
  INTERACTION,
  useTarget,
} from './systems/interaction.js';
export type {
  InteractionConfig,
  InteractionOutcome,
  InteractionResult,
} from './systems/interaction.js';

export { hasLineOfSight, updateStalker } from './systems/stalker.js';
export type { StalkerDeps, StalkerEvent, StalkerSenses } from './systems/stalker.js';

export { lightAt, updateSanity } from './systems/sanity.js';
export type { SanityInput } from './systems/sanity.js';

export { spawnLevel } from './entities/spawn.js';
export type { LevelInstance } from './entities/spawn.js';

export {
  aabb,
  aabbFromBox,
  collidersFromLevel,
  createMoveResult,
  disableCollider,
  moveAndCollide,
  overlaps,
} from './collision.js';
export type { Aabb, MoveResult } from './collision.js';

export { DEBUG_LEVEL } from './scenes/debug-level.js';
