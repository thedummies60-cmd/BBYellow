/**
 * Entry point. Its only jobs: check the browser can run the game, report clearly if it
 * can't, and hand off to the bootstrap. Keep game logic out of here.
 *
 * See CLAUDE.md §7 — "degrade explicitly": a player whose browser can't run this gets a
 * readable message, never a black screen.
 */

import { createApp } from '@app';

interface Capability {
  readonly name: string;
  readonly check: () => boolean;
  readonly message: string;
}

const REQUIRED: readonly Capability[] = [
  {
    name: 'webgl2',
    check: () => {
      const canvas = document.createElement('canvas');
      return canvas.getContext('webgl2') !== null;
    },
    message:
      'This game needs WebGL 2, which your browser or graphics driver does not provide. ' +
      'Try an up-to-date Chrome, Firefox, or Edge, and check that hardware acceleration is enabled.',
  },
  {
    name: 'pointer-lock',
    check: () => 'requestPointerLock' in HTMLElement.prototype,
    message: 'This game needs pointer lock for mouse look, which your browser does not support.',
  },
];

function showFallback(message: string): void {
  const canvas = document.getElementById('game');
  const el = document.getElementById('fallback');
  if (canvas) canvas.style.display = 'none';
  if (!el) return;
  el.style.display = 'block';
  const heading = document.createElement('h1');
  heading.textContent = 'This game cannot run here';
  const body = document.createElement('p');
  body.textContent = message; // textContent, not innerHTML — never inject markup
  el.replaceChildren(heading, body);
}

async function main(): Promise<void> {
  const missing = REQUIRED.filter((c) => !c.check());
  if (missing.length > 0) {
    showFallback(missing.map((c) => c.message).join(' '));
    return;
  }

  const canvas = document.getElementById('game');
  if (!(canvas instanceof HTMLCanvasElement)) {
    showFallback('The page failed to load correctly. Try a refresh.');
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const seedParam = params.get('seed');
  const showStats =
    params.get('stats') === '1' || import.meta.env['VITE_DEBUG_OVERLAY'] === 'true';

  try {
    const app = createApp(canvas, {
      showStats,
      // A seed in the URL reproduces a run exactly (CLAUDE.md §3).
      ...(seedParam !== null && seedParam !== '' ? { seed: Number(seedParam) } : {}),
    });
    app.start();

    // Exposed for the smoke test and for reading the seed off a bug report.
    Reflect.set(window, '__bbyellow', app);
  } catch (error) {
    console.error(error);
    showFallback(
      'The game could not start on this device. This usually means the graphics driver ' +
        'refused a WebGL context.',
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  showFallback('Something went wrong while starting the game. Try a refresh.');
});
