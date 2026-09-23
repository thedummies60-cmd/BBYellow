/**
 * Composition root (ADR-0002).
 *
 * Wires the layers together and owns the teardown order. Holds no rules: every decision
 * about what is true lives in `game/`, every decision about what it looks like lives in
 * `render/`. If logic starts accumulating here, it is in the wrong place.
 */
import {
  createClock,
  createEventBus,
  createLoop,
  createRng,
  createWorld,
  defineComponent,
  lerp,
  randomSeed,
} from '@core';
import type { Entity } from '@core';
import { createFrameDriver, createViewport, createVisibilityWatcher } from '@platform';
import { createDebugRoom, createRenderer } from '@render';
import { createModeMachine, createSpinSystem, GameMode } from '@game';
import type { Spin } from '@game';
import { createStatsOverlay } from '@ui';
import { createFrameStats } from '@shared/stats.js';

const Spin = defineComponent<Spin>('Spin');

/** Smoothing for the displayed frame rate. Display only — nothing reads it. */
const FPS_SMOOTHING = 0.9;

export interface GameEvents extends Record<string, unknown> {
  ModeChanged: { to: GameMode; from: GameMode };
}

export interface App {
  start(): void;
  stop(): void;
  /** Tears down in reverse construction order. Every acquired resource is released. */
  dispose(): void;
  /** Exposed for the smoke test and the debug console. */
  readonly debug: {
    readonly seed: number;
    readonly mode: ReturnType<typeof createModeMachine>;
    readonly stats: ReturnType<typeof createFrameStats>;
  };
}

export interface AppOptions {
  /** Defaults to a random seed; pass one to reproduce a run (CLAUDE.md §3). */
  seed?: number;
  showStats?: boolean;
}

export function createApp(canvas: HTMLCanvasElement, options: AppOptions = {}): App {
  const seed = options.seed ?? randomSeed();
  const disposers: (() => void)[] = [];

  // ---- simulation -------------------------------------------------------------
  const world = createWorld();
  const clock = createClock();
  const bus = createEventBus<GameEvents>();
  const rng = createRng(seed);
  const mode = createModeMachine();

  disposers.push(() => {
    clock.clearTimers();
    bus.clear();
    world.clear();
  });

  const updateSpin = createSpinSystem(world, Spin);

  const spinner = world.create();
  world.add(spinner, Spin, {
    angle: rng.range(0, Math.PI * 2),
    previousAngle: 0,
    speed: 0.6,
  });

  // ---- presentation -----------------------------------------------------------
  const renderer = createRenderer(canvas);
  disposers.push(() => renderer.dispose());

  const room = createDebugRoom();
  renderer.scene.add(room.root);
  disposers.push(() => room.dispose());

  // Eye height. Becomes the player rig once movement exists.
  renderer.camera.position.set(0, 1.7, 3.5);
  renderer.camera.lookAt(0, 1.3, -3);

  const viewport = createViewport(canvas, (size) => renderer.resize(size));
  disposers.push(() => viewport.dispose());

  const overlay = options.showStats === true ? createStatsOverlay() : null;
  if (overlay !== null) disposers.push(() => overlay.dispose());

  const stats = createFrameStats();

  // ---- frame ------------------------------------------------------------------
  let lastFrameSeconds = -1;

  const loop = createLoop((dt) => {
    clock.advance(dt);
    updateSpin(dt);
  });

  /**
   * Copies interpolated simulation state onto the scene — the one job that needs both
   * `game/` and `render/`, and the reason this layer exists.
   *
   * Allocation-free: one query, index loop, in-place writes (CLAUDE.md §3).
   */
  const spinQuery = world.query(Spin);
  const applyToScene = (alpha: number): void => {
    const entities = spinQuery.entities;
    for (let i = 0; i < entities.length; i++) {
      const spin = world.get(entities[i] as Entity, Spin);
      if (spin === undefined) continue;
      room.spinner.rotation.y = lerp(spin.previousAngle, spin.angle, alpha);
    }
  };

  const driver = createFrameDriver((nowSeconds) => {
    /*
     * Measure our own work, not the time since the rAF timestamp.
     *
     * `nowSeconds` is when the browser *scheduled* the frame, which can be well before
     * this callback runs — the gap includes the previous frame's GPU work. Timing the
     * simulation from it charges that wait to the simulation and makes a 0.05 ms system
     * read as 12 ms. Instrumentation that lies is worse than none: it sends you
     * optimizing the wrong layer.
     */
    const intervalMs = lastFrameSeconds >= 0 ? (nowSeconds - lastFrameSeconds) * 1000 : 0;
    lastFrameSeconds = nowSeconds;

    const workStartMs = performance.now();
    const alpha = mode.simulating ? loop.advance(nowSeconds) : 0;
    const simEndMs = performance.now();

    applyToScene(alpha);

    const renderStartMs = performance.now();
    renderer.render();
    const renderEndMs = performance.now();

    stats.simMs = simEndMs - workStartMs;
    stats.renderMs = renderEndMs - renderStartMs;
    stats.frameMs = renderEndMs - workStartMs;
    stats.drawCalls = renderer.stats.drawCalls;
    stats.triangles = renderer.stats.triangles;
    stats.steps = loop.stats.steps;
    stats.droppedTime = loop.stats.droppedTime;
    stats.entities = world.size;

    // fps comes from the frame interval, which is the number that answers "are we
    // hitting 60?" — CPU work per frame does not, since it excludes GPU and idle time.
    const instantFps = intervalMs > 0 ? 1000 / intervalMs : 0;
    stats.fps = stats.fps === 0 ? instantFps : stats.fps * FPS_SMOOTHING + instantFps * (1 - FPS_SMOOTHING);

    overlay?.update(stats, renderEndMs);
  });
  disposers.push(() => driver.dispose());

  // A hidden tab stops firing rAF; the stalker must not keep hunting meanwhile.
  const visibility = createVisibilityWatcher((visible) => {
    if (!visible) mode.enter(GameMode.Paused);
    // Resuming is the player's call — see the re-lock rules in
    // docs/browser-integration.md. Re-anchor so the hidden gap is not simulated.
    else loop.reset(performance.now() / 1000);
  });
  disposers.push(() => visibility.dispose());

  disposers.push(mode.onChange((to, from) => bus.emit('ModeChanged', { to, from })));

  return {
    debug: { seed, mode, stats },

    start(): void {
      // Nothing to stream yet, so Loading passes straight through.
      mode.enter(GameMode.Loading);
      mode.enter(GameMode.Playing);
      loop.reset(performance.now() / 1000);
      driver.start();
    },

    stop(): void {
      driver.stop();
    },

    dispose(): void {
      driver.stop();
      for (let i = disposers.length - 1; i >= 0; i--) (disposers[i] as () => void)();
      disposers.length = 0;
    },
  };
}
