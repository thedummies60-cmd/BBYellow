/**
 * Public surface of core/ (CLAUDE.md §6).
 *
 * Other layers import from '@core', not from deep paths inside it.
 */

export { createLoop, FIXED_DT, MAX_CATCH_UP_STEPS, MAX_FRAME_TIME } from './loop.js';
export type { Loop, LoopOptions, LoopStats } from './loop.js';

export { createClock } from './clock.js';
export type { Clock, TimerHandle } from './clock.js';

export { createEventBus } from './events.js';
export type { EventBus, EventMap, Handler, Unsubscribe } from './events.js';

export { createRng, hashSeed, randomSeed } from './rng.js';
export type { Rng } from './rng.js';

export {
  createWorld,
  defineComponent,
  MAX_COMPONENT_TYPES,
  MAX_ENTITIES,
  NULL_ENTITY,
} from './world.js';
export type { ComponentType, Entity, Query, World } from './world.js';

export * from './math.js';
