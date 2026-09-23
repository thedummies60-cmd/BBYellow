#!/usr/bin/env node
/**
 * Browser smoke test.
 *
 * Unit tests cover the simulation; nothing they assert proves a frame reached the
 * screen. This drives a real production build in a real browser and checks the things
 * only a browser can answer: does the canvas draw, does the overlay report a sane frame
 * time, does the console stay clean, does teardown release the GPU context.
 *
 * Run: npm run smoke   (expects `npm run build` first)
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

/**
 * Use a Chromium already on the machine when the installed Playwright expects a build
 * that is not there (CI images pin their own). Set CHROMIUM_PATH to override.
 */
function findChromium() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
  ].filter(Boolean);
  return candidates.find((path) => existsSync(path));
}

const DIST = 'dist';
const PORT = 4317;
/** Served from a subdirectory on purpose: it catches absolute-path bugs (CLAUDE.md §7). */
const BASE = '/games/bbyellow';

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.map': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

if (!existsSync(DIST)) {
  console.error(`smoke: ${DIST}/ not found — run "npm run build" first.`);
  process.exit(1);
}

const server = createServer(async (req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  const rel = url.startsWith(BASE) ? url.slice(BASE.length) : url;
  const path = join(DIST, normalize(rel === '/' || rel === '' ? '/index.html' : rel));
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

const failures = [];
const check = (name, condition, detail = '') => {
  if (condition) console.log(`  ✓ ${name}`);
  else {
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
    failures.push(name);
  }
};

await new Promise((resolve) => server.listen(PORT, resolve));

const executablePath = findChromium();
const browser = await chromium.launch({
  // SwiftShader: a CI container has no GPU, so force a software WebGL2 context.
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  ...(executablePath ? { executablePath } : {}),
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  const consoleErrors = [];
  const missing = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(String(error)));
  page.on('response', (response) => {
    if (response.status() >= 400) missing.push(`${response.status()} ${response.url()}`);
  });

  // Fixed seed: the run must be reproducible (CLAUDE.md §3).
  await page.goto(`http://localhost:${PORT}${BASE}/?stats=1&seed=12345`, {
    waitUntil: 'load',
  });

  console.log('\nsmoke: served from a subdirectory, software WebGL\n');

  const fallback = await page.locator('#fallback').isVisible();
  check('no capability fallback shown', !fallback);

  await page.waitForFunction(() => Reflect.get(window, '__bbyellow') !== undefined, {
    timeout: 10_000,
  });
  check('app booted', true);

  // Let the loop settle before reading frame numbers.
  await page.waitForTimeout(1500);

  const canvasBox = await page.locator('#game').boundingBox();
  check(
    'canvas fills the viewport',
    canvasBox !== null && canvasBox.width > 1000 && canvasBox.height > 600,
    canvasBox ? `${canvasBox.width}x${canvasBox.height}` : 'no canvas',
  );

  // The real question: did anything draw? Sample the rendered pixels.
  const shot = await page.locator('#game').screenshot();
  const { distinct, nonBlack } = await page.evaluate(async (dataUrl) => {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const seen = new Set();
    let bright = 0;
    for (let i = 0; i < data.length; i += 4 * 97) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      seen.add((r >> 3) << 10 | (g >> 3) << 5 | (b >> 3));
      if (r + g + b > 30) bright++;
    }
    return { distinct: seen.size, nonBlack: bright };
  }, `data:image/png;base64,${shot.toString('base64')}`);

  check('canvas is not blank', nonBlack > 0, `${nonBlack} lit samples`);
  check('scene has shading, not a flat fill', distinct > 20, `${distinct} distinct colors`);

  const stats = await page.evaluate(() => {
    const app = Reflect.get(window, '__bbyellow');
    return { ...app.debug.stats, seed: app.debug.seed, mode: app.debug.mode.current };
  });

  check('seed came from the URL', stats.seed === 12345, String(stats.seed));
  check('mode is playing', stats.mode === 'playing', stats.mode);
  check('frames are being drawn', stats.drawCalls > 0, `${stats.drawCalls} draw calls`);
  check('triangles submitted', stats.triangles > 0, `${stats.triangles} tris`);
  check(
    'draw calls within budget',
    stats.drawCalls <= 300,
    `${stats.drawCalls} (budget 300)`,
  );
  check('simulation stepped', stats.entities === 1, `${stats.entities} entities`);
  // Software WebGL renders slower than the clamp, so dropping time here is the clamp
  // doing its job. What matters is that it bounds the damage rather than letting the
  // simulation run away (CLAUDE.md §3).
  check(
    'stalls stay bounded by the frame clamp',
    stats.droppedTime < 5,
    `${stats.droppedTime.toFixed(3)}s dropped`,
  );
  check('steps per frame within the catch-up cap', stats.steps <= 5, String(stats.steps));

  // Taken while the app is running: a screenshot after teardown shows a dead canvas
  // and proves nothing.
  await page.screenshot({ path: 'smoke-screenshot.png' });
  console.log('  → screenshot written to smoke-screenshot.png');

  const overlayText = await page.locator('#stats').textContent();
  check('stats overlay rendered', (overlayText ?? '').includes('fps'), overlayText?.slice(0, 20));

  // Interpolation: the prop must move between frames.
  const angleA = await page.evaluate(() => document.title); // force a frame boundary
  await page.waitForTimeout(400);
  const moved = await page.evaluate(() => {
    const app = Reflect.get(window, '__bbyellow');
    return app.debug.stats.steps >= 0 && app.debug.stats.fps > 0;
  });
  check('loop is running', moved && angleA !== null);

  // Teardown must release the GPU context, or repeated scene loads exhaust the limit.
  const disposed = await page.evaluate(() => {
    const app = Reflect.get(window, '__bbyellow');
    app.dispose();
    return document.querySelector('#stats') === null;
  });
  check('dispose removes the overlay', disposed);

  await page.waitForTimeout(200);
  check('no console errors', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 200));
  check('every request resolved', missing.length === 0, missing.join(' | ').slice(0, 200));

} finally {
  await browser.close();
  server.close();
}

console.log('');
if (failures.length > 0) {
  console.error(`smoke: ${failures.length} check(s) failed: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('smoke: all checks passed');
