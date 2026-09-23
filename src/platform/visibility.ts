/**
 * Tab visibility (docs/browser-integration.md).
 *
 * A backgrounded tab stops firing rAF, so the gap on return is seconds long. The loop's
 * clamp keeps that from teleporting the player, but the game should also pause: a
 * stalker that kept hunting while the tab was hidden is exactly the unfairness
 * docs/horror-design-principles.md rules out.
 */

export interface VisibilityWatcher {
  readonly visible: boolean;
  dispose(): void;
}

export function createVisibilityWatcher(
  onChange: (visible: boolean) => void,
): VisibilityWatcher {
  let visible = !document.hidden;

  const handle = (): void => {
    const next = !document.hidden;
    if (next === visible) return;
    visible = next;
    onChange(visible);
  };

  document.addEventListener('visibilitychange', handle);

  return {
    get visible() {
      return visible;
    },
    dispose(): void {
      document.removeEventListener('visibilitychange', handle);
    },
  };
}
