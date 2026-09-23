/** Public surface of game/ (CLAUDE.md §6). */

export { createModeMachine, GameMode } from './mode.js';
export type { ModeListener, ModeMachine } from './mode.js';

export type { Spin } from './components/spin.js';
export { createSpinSystem } from './systems/spin.js';
