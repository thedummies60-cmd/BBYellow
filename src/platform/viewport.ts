/**
 * Canvas sizing and device pixel ratio.
 *
 * Kept out of `render/` so the renderer is handed dimensions rather than reading the
 * DOM for them — that is what lets it be driven at a fixed size in a test.
 */

export interface ViewportSize {
  /** Drawing-buffer width in physical pixels. */
  width: number;
  height: number;
  /** CSS pixels, for the camera's aspect ratio. */
  cssWidth: number;
  cssHeight: number;
  pixelRatio: number;
}

export interface Viewport {
  readonly size: Readonly<ViewportSize>;
  /** Re-measure now. Returns true if anything changed. */
  measure(): boolean;
  dispose(): void;
}

/**
 * Above 2x the pixel cost stops buying visible quality and starts costing frames —
 * a 3x display would quadruple fragment work against the 16.6 ms budget.
 */
export const MAX_PIXEL_RATIO = 2;

export function createViewport(
  canvas: HTMLCanvasElement,
  onResize: (size: Readonly<ViewportSize>) => void,
): Viewport {
  const size: ViewportSize = {
    width: 0,
    height: 0,
    cssWidth: 0,
    cssHeight: 0,
    pixelRatio: 1,
  };

  const measure = (): boolean => {
    const rect = canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.round(rect.width));
    const cssHeight = Math.max(1, Math.round(rect.height));
    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const width = Math.max(1, Math.round(cssWidth * pixelRatio));
    const height = Math.max(1, Math.round(cssHeight * pixelRatio));

    if (width === size.width && height === size.height) return false;

    size.width = width;
    size.height = height;
    size.cssWidth = cssWidth;
    size.cssHeight = cssHeight;
    size.pixelRatio = pixelRatio;
    onResize(size);
    return true;
  };

  const observer = new ResizeObserver(() => measure());
  observer.observe(canvas);
  measure();

  return {
    size,
    measure,
    dispose(): void {
      observer.disconnect();
    },
  };
}
