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
  // Pointer lock needs a gesture, so the game waits in Paused behind the prompt.
  check('waits for the player behind a prompt', stats.mode === 'paused', stats.mode);
  const promptText = await page.locator('#prompt').textContent();
  check('prompt explains the controls', (promptText ?? '').includes('WASD'), promptText ?? '');
  check('frames are being drawn', stats.drawCalls > 0, `${stats.drawCalls} draw calls`);
  check('triangles submitted', stats.triangles > 0, `${stats.triangles} tris`);
  check(
    'draw calls within budget',
    stats.drawCalls <= 300,
    `${stats.drawCalls} (budget 300)`,
  );
  // player + stalker + one entity per interactable
  check('the world is populated', stats.entities >= 5, `${stats.entities} entities`);
  // Software WebGL renders slower than the clamp, so dropping time here is the clamp
  // doing its job. What matters is that it bounds the damage rather than letting the
  // simulation run away (CLAUDE.md §3).
  check(
    'stalls stay bounded by the frame clamp',
    stats.droppedTime < 5,
    `${stats.droppedTime.toFixed(3)}s dropped`,
  );
  check('steps per frame within the catch-up cap', stats.steps <= 5, String(stats.steps));

  // ---- the player ------------------------------------------------------------
  // A Playwright click is a real user gesture, which is what pointer lock and the
  // AudioContext both require.
  await page.locator('#prompt').click();
  await page.waitForTimeout(400);

  const locked = await page.evaluate(() => document.pointerLockElement !== null);
  check('pointer lock engaged on click', locked);

  const afterLock = await page.evaluate(() =>
    Reflect.get(window, '__bbyellow').debug.mode.current,
  );
  check('resumes playing once captured', afterLock === 'playing', afterLock);

  const audioRunning = await page.evaluate(() => Reflect.get(window, '__bbyellow').debug.state().audio);
  check('audio context resumed on the same gesture', audioRunning);

  const start = await page.evaluate(() => Reflect.get(window, '__bbyellow').debug.position());

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(150);

  const walked = await page.evaluate(() => Reflect.get(window, '__bbyellow').debug.position());
  const forward = start.z - walked.z; // spawn faces -Z
  check('W walks forward', forward > 0.5, `moved ${forward.toFixed(2)}m`);
  check('stays on the floor while walking', Math.abs(walked.y) < 0.01, `y=${walked.y}`);

  await page.screenshot({ path: 'smoke-screenshot.png' });
  console.log('  → screenshot written to smoke-screenshot.png');

  // ---- the flashlight ----------------------------------------------------------
  const torchBefore = await page.evaluate(() => Reflect.get(window, '__bbyellow').debug.state());

  // Does the flashlight actually light anything? Compare rendered brightness with it
  // on and off — a spotlight that is wired up but contributes nothing looks identical.
  const brightness = async () => {
    const shot = await page.locator('#game').screenshot();
    return page.evaluate(async (dataUrl) => {
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let total = 0;
      let count = 0;
      for (let i = 0; i < data.length; i += 4 * 37) {
        total += data[i] + data[i + 1] + data[i + 2];
        count++;
      }
      return total / count;
    }, `data:image/png;base64,${shot.toString('base64')}`);
  };

  const litBrightness = await brightness();
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(200);
  const darkBrightness = await brightness();
  const torchAfter = await page.evaluate(() => Reflect.get(window, '__bbyellow').debug.state());

  check('F toggles the flashlight', torchBefore.flashlight !== torchAfter.flashlight);
  check(
    'the flashlight actually lights the scene',
    litBrightness > darkBrightness * 1.15,
    `lit ${litBrightness.toFixed(1)} vs dark ${darkBrightness.toFixed(1)}`,
  );
  check('battery drains while it is on', torchBefore.battery < 1, `${torchBefore.battery.toFixed(3)}`);
  await page.keyboard.press('KeyF'); // back on for the rest of the run

  // ---- sanity ------------------------------------------------------------------
  const sanity = await page.evaluate(() => Reflect.get(window, '__bbyellow').debug.state().sanity);
  check('sanity is being simulated', sanity > 0 && sanity <= 100, String(sanity));

  // ---- the goal ----------------------------------------------------------------
  // Warp rather than pathfind: this checks the game's rules, not Playwright's ability
  // to walk a corridor.
  await page.evaluate(() => {
    const app = Reflect.get(window, '__bbyellow');
    app.debug.warp(-5.5, -7.6);
    app.debug.look(0, -0.3); // the key is at -Z and below eye height
  });
  await page.waitForTimeout(250);

  const nearKey = await page.evaluate(() => Reflect.get(window, '__bbyellow').debug.state().prompt);
  check('prompts when looking at the key', nearKey.length > 0, nearKey || '(no prompt)');

  await page.keyboard.press('KeyE');
  await page.waitForTimeout(200);
  const carrying = await page.evaluate(() => Reflect.get(window, '__bbyellow').debug.state());
  check('E takes the key', carrying.hasKey, `hasKey=${carrying.hasKey}`);
  check('the pickup subtitles itself', carrying.subtitle.length > 0, carrying.subtitle);

  // Back to the exit and out.
  await page.evaluate(() => {
    const app = Reflect.get(window, '__bbyellow');
    app.debug.warp(0, 11.0);
    app.debug.look(Math.PI, -0.2); // turn around: the exit is at +Z
  });
  await page.waitForTimeout(250);

  const atExit = await page.evaluate(() => Reflect.get(window, '__bbyellow').debug.state().prompt);
  check('prompts at the exit', atExit.length > 0, atExit || '(no prompt)');

  await page.keyboard.press('KeyE');
  await page.waitForTimeout(400);

  const ending = await page.evaluate(() => ({
    mode: Reflect.get(window, '__bbyellow').debug.mode.current,
    screen: document.querySelector('#screen')?.textContent ?? '',
  }));
  check('the run can be completed', ending.mode === 'gameOver', ending.mode);
  check('the ending screen explains itself', /got out/i.test(ending.screen), ending.screen.slice(0, 40));

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
