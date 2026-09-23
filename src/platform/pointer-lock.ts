/**
 * Pointer lock (docs/browser-integration.md).
 *
 * Mouse look uses deltas, not coordinates: a cursor stops at the screen edge and a
 * locked pointer does not. The gotchas this wraps are the ones that cost real debugging
 * time — the required user gesture, the browser's re-lock cooldown, and the fact that
 * losing lock is the only reliable pause signal when the window is not focused.
 */

export interface PointerLock {
  readonly locked: boolean;
  /** Must be called from inside a user gesture, or the browser rejects it. */
  request(): void;
  release(): void;
  dispose(): void;
}

/**
 * Chrome rejects a re-lock within roughly a second of an ESC exit. Retrying inside that
 * window fails silently and, if you loop on it, never recovers — so we do not retry at
 * all and wait for another click instead.
 */
export const RELOCK_COOLDOWN_MS = 1250;

export interface PointerLockOptions {
  onChange?: (locked: boolean) => void;
  onError?: () => void;
}

export function createPointerLock(
  element: HTMLElement,
  options: PointerLockOptions = {},
): PointerLock {
  let locked = false;
  let lastExitMs = -Infinity;

  const handleChange = (): void => {
    const next = document.pointerLockElement === element;
    if (next === locked) return;
    locked = next;
    if (!locked) lastExitMs = performance.now();
    options.onChange?.(locked);
  };

  // Fires when the document is not focused or the element is detached. Assuming the
  // request succeeded leaves the game waiting for movement that never arrives.
  const handleError = (): void => {
    lastExitMs = performance.now();
    options.onError?.();
  };

  document.addEventListener('pointerlockchange', handleChange);
  document.addEventListener('pointerlockerror', handleError);

  return {
    get locked() {
      return locked;
    },

    request(): void {
      if (locked) return;
      if (performance.now() - lastExitMs < RELOCK_COOLDOWN_MS) return;
      // Older Safari returns undefined rather than a promise, hence the guard.
      const result: unknown = element.requestPointerLock();
      if (result instanceof Promise) result.catch(() => handleError());
    },

    release(): void {
      if (locked) document.exitPointerLock();
    },

    dispose(): void {
      document.removeEventListener('pointerlockchange', handleChange);
      document.removeEventListener('pointerlockerror', handleError);
      if (locked) document.exitPointerLock();
    },
  };
}
