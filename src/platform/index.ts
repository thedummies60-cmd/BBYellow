/** Public surface of platform/ (CLAUDE.md §6). */

export { createFrameDriver } from './frame-driver.js';
export type { FrameDriver } from './frame-driver.js';

export { createViewport, MAX_PIXEL_RATIO } from './viewport.js';
export type { Viewport, ViewportSize } from './viewport.js';

export { createVisibilityWatcher } from './visibility.js';
export type { VisibilityWatcher } from './visibility.js';

export { createPointerLock, RELOCK_COOLDOWN_MS } from './pointer-lock.js';
export type { PointerLock, PointerLockOptions } from './pointer-lock.js';

export { gpuWarning, probeGpu } from './gpu.js';
export type { GpuInfo } from './gpu.js';
