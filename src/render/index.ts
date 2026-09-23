/** Public surface of render/ (CLAUDE.md §6). */

export { createRenderer } from './renderer.js';
export type { Renderer, RendererOptions, RendererStats } from './renderer.js';

export { createLevelView } from './level-view.js';
export type { LevelView } from './level-view.js';

export { applyCameraPose } from './camera.js';

export { createFlashlight } from './flashlight.js';
export type { Flashlight } from './flashlight.js';

export { createStalkerView } from './stalker-view.js';
export type { StalkerView } from './stalker-view.js';

export type { PostChain } from './postfx/composer.js';
