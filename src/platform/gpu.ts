/**
 * Which GPU the browser gave us, and whether it gave us one at all
 * (CLAUDE.md §7, "degrade explicitly").
 *
 * WebGL is the hardware-accelerated path, but "supported" does not mean "accelerated".
 * A browser with graphics acceleration switched off, a blocklisted driver, or a headless
 * environment still reports WebGL2 — it just runs it on the CPU through SwiftShader or
 * llvmpipe, at a tenth of the speed. The player sees a stuttering game and concludes it
 * is broken, which is exactly the silent failure §7 exists to prevent.
 */

export interface GpuInfo {
  /** Whether a WebGL2 context could be created at all. */
  readonly available: boolean;
  /** The unmasked renderer string, or '' when the browser withholds it. */
  readonly renderer: string;
  /** True when we are confident the GPU is being emulated on the CPU. */
  readonly softwareRendered: boolean;
}

/**
 * Names used by the CPU rasterisers browsers fall back to.
 *
 * Matched case-insensitively against the unmasked renderer string. Deliberately narrow:
 * a false positive nags a player whose machine is fine, which is worse than missing an
 * unusual fallback.
 */
const SOFTWARE_MARKERS = [
  'swiftshader', // Chrome's fallback
  'llvmpipe', // Mesa's, on Linux
  'softpipe',
  'software rasterizer',
  'microsoft basic render driver',
  'generic renderer',
];

export function probeGpu(): GpuInfo {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');

  if (gl === null) {
    return { available: false, renderer: '', softwareRendered: false };
  }

  // Some browsers withhold this for fingerprinting reasons (Firefox with
  // resistFingerprinting, for one). An empty string means "cannot tell", not "software".
  let renderer = '';
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  if (debugInfo !== null) {
    const value: unknown = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    if (typeof value === 'string') renderer = value;
  }

  // Release the probe context immediately: browsers cap how many a page may hold, and
  // leaking this one can cost the real renderer its context.
  gl.getExtension('WEBGL_lose_context')?.loseContext();

  const lower = renderer.toLowerCase();
  const softwareRendered = SOFTWARE_MARKERS.some((marker) => lower.includes(marker));

  return { available: true, renderer, softwareRendered };
}

/**
 * What to tell the player, or '' when nothing is wrong.
 *
 * Phrased as something they can act on: the usual cause is a browser setting they can
 * switch back on, not a machine they need to replace.
 */
export function gpuWarning(info: GpuInfo): string {
  if (!info.available || !info.softwareRendered) return '';
  return (
    'Your browser is rendering this without a GPU, so it will run slowly. ' +
    'Turn on hardware acceleration in your browser settings and reload.'
  );
}
