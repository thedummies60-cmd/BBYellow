/**
 * The WebGL renderer (src/render/CLAUDE.md).
 *
 * Owns the GPU: the context, the frame submission, and every resource on it. The only
 * layer permitted to import three.
 */
import {
  ACESFilmicToneMapping,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import type { ViewportSize } from '@platform/viewport.js';

export interface RendererStats {
  drawCalls: number;
  triangles: number;
}

export interface Renderer {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  /** Draw one frame. `alpha` is the loop's interpolation factor, for the caller's use. */
  render(): void;
  resize(size: Readonly<ViewportSize>): void;
  /** Counts from the last frame, for the budget overlay. */
  readonly stats: Readonly<RendererStats>;
  /** True while the GPU context is lost; drawing is skipped until it is restored. */
  readonly contextLost: boolean;
  dispose(): void;
}

export interface RendererOptions {
  /** Called when the driver restores the context and GPU resources must be rebuilt. */
  onContextRestored?: () => void;
}

export function createRenderer(
  canvas: HTMLCanvasElement,
  options: RendererOptions = {},
): Renderer {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    // The depth-only prepass and post chain do not read the default buffer back, and
    // keeping it opaque lets the compositor skip blending the page behind it.
    alpha: false,
    powerPreference: 'high-performance',
  });

  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  // Darkness is the mechanic: tone mapping decides how much of the shadow end survives.
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;

  const scene = new Scene();
  const camera = new PerspectiveCamera(70, 1, 0.1, 200);

  const stats: RendererStats = { drawCalls: 0, triangles: 0 };
  let contextLost = false;

  /**
   * Without preventDefault the browser never fires `webglcontextrestored`, and a
   * recoverable blip becomes a dead canvas mid-scare.
   */
  const handleLost = (event: Event): void => {
    event.preventDefault();
    contextLost = true;
  };

  const handleRestored = (): void => {
    contextLost = false;
    options.onContextRestored?.();
  };

  canvas.addEventListener('webglcontextlost', handleLost);
  canvas.addEventListener('webglcontextrestored', handleRestored);

  return {
    scene,
    camera,
    stats,

    get contextLost() {
      return contextLost;
    },

    render(): void {
      if (contextLost) return;
      renderer.render(scene, camera);
      const info = renderer.info.render;
      stats.drawCalls = info.calls;
      stats.triangles = info.triangles;
    },

    resize(size: Readonly<ViewportSize>): void {
      // false: the canvas is sized by CSS, so the renderer must not write style back.
      renderer.setPixelRatio(size.pixelRatio);
      renderer.setSize(size.cssWidth, size.cssHeight, false);
      camera.aspect = size.cssWidth / size.cssHeight;
      camera.updateProjectionMatrix();
    },

    dispose(): void {
      canvas.removeEventListener('webglcontextlost', handleLost);
      canvas.removeEventListener('webglcontextrestored', handleRestored);
      renderer.dispose();
      // Frees the GPU context immediately rather than waiting for GC — a reload that
      // leaks contexts hits the browser's per-page limit within a few iterations.
      renderer.forceContextLoss();
    },
  };
}
