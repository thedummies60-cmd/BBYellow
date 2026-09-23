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
  vec3,
} from '@core';
import type { Entity } from '@core';
import {
  createFrameDriver,
  createPointerLock,
  createViewport,
  createVisibilityWatcher,
} from '@platform';
import { applyCameraPose, createLevelView, createRenderer } from '@render';
import { createInputDevice } from '@input';
import {
  collidersFromLevel,
  createModeMachine,
  createMovementSystem,
  DEBUG_LEVEL,
  GameMode,
  MOVEMENT,
} from '@game';
import type { Player, Transform, Velocity } from '@game';
import { createPrompt, createStatsOverlay } from '@ui';
import { IDLE_INPUT } from '@shared/input.js';
import { createFrameStats } from '@shared/stats.js';

const Transform = defineComponent<Transform>('Transform');
const Velocity = defineComponent<Velocity>('Velocity');
const Player = defineComponent<Player>('Player');

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
    readonly player: Entity;
    position(): { x: number; y: number; z: number };
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
  const level = DEBUG_LEVEL;

  // ---- simulation -------------------------------------------------------------
  const world = createWorld();
  const clock = createClock();
  const bus = createEventBus<GameEvents>();
  const rng = createRng(seed);
  const mode = createModeMachine();
  const colliders = collidersFromLevel(level);

  disposers.push(() => {
    clock.clearTimers();
    bus.clear();
    world.clear();
  });

  const player = world.create();
  world.add(player, Transform, {
    position: vec3(level.spawn.position.x, level.spawn.position.y, level.spawn.position.z),
    previousPosition: vec3(
      level.spawn.position.x,
      level.spawn.position.y,
      level.spawn.position.z,
    ),
    yaw: level.spawn.yaw,
    previousYaw: level.spawn.yaw,
    pitch: 0,
    previousPitch: 0,
  });
  world.add(player, Velocity, { linear: vec3() });
  world.add(player, Player, {
    grounded: false,
    crouching: false,
    eyeHeight: MOVEMENT.eyeHeight,
    previousEyeHeight: MOVEMENT.eyeHeight,
  });

  const updateMovement = createMovementSystem(
    world,
    { Transform, Velocity, Player },
    MOVEMENT,
    colliders,
  );

  // ---- presentation -----------------------------------------------------------
  const renderer = createRenderer(canvas);
  disposers.push(() => renderer.dispose());

  const levelView = createLevelView(level);
  renderer.scene.add(levelView.root);
  disposers.push(() => levelView.dispose());

  const viewport = createViewport(canvas, (size) => renderer.resize(size));
  disposers.push(() => viewport.dispose());

  const overlay = options.showStats === true ? createStatsOverlay() : null;
  if (overlay !== null) disposers.push(() => overlay.dispose());

  const prompt = createPrompt();
  disposers.push(() => prompt.dispose());

  const stats = createFrameStats();

  // ---- input ------------------------------------------------------------------
  const pointerLock = createPointerLock(canvas, {
    onChange: (locked) => {
      if (locked) {
        prompt.hide();
        mode.enter(GameMode.Playing);
      } else {
        // Losing lock is the only pause signal that survives alt-tab, where a keyboard
        // handler never fires (docs/browser-integration.md).
        input.clear();
        mode.enter(GameMode.Paused);
        prompt.show('Paused', 'Click to resume · ESC to release the cursor');
      }
    },
    onError: () => {
      prompt.show('Click to play', 'Your browser declined pointer lock — try again');
    },
  });
  disposers.push(() => pointerLock.dispose());

  const input = createInputDevice(canvas, {
    lookSensitivity: MOVEMENT.lookSensitivity,
    shouldCaptureLook: () => pointerLock.locked,
  });
  disposers.push(() => input.dispose());

  disposers.push(prompt.onActivate(() => pointerLock.request()));
  const handleCanvasClick = (): void => pointerLock.request();
  canvas.addEventListener('click', handleCanvasClick);
  disposers.push(() => canvas.removeEventListener('click', handleCanvasClick));

  // ---- frame ------------------------------------------------------------------
  let lastFrameSeconds = -1;

  const loop = createLoop((dt) => {
    clock.advance(dt);
    // Input is only consumed while captured; otherwise the player drifts while the
    // pause menu is open.
    updateMovement(dt, pointerLock.locked ? input.snapshot : IDLE_INPUT);
  });

  /**
   * Copies interpolated simulation state onto the scene — the one job that needs both
   * `game/` and `render/`, and the reason this layer exists.
   *
   * Allocation-free: direct component reads and in-place writes (CLAUDE.md §3).
   */
  const applyToScene = (alpha: number): void => {
    const transform = world.get(player, Transform);
    const state = world.get(player, Player);
    if (transform === undefined || state === undefined) return;

    applyCameraPose(
      renderer.camera,
      lerp(transform.previousPosition.x, transform.position.x, alpha),
      lerp(transform.previousPosition.y, transform.position.y, alpha),
      lerp(transform.previousPosition.z, transform.position.z, alpha),
      lerp(transform.previousYaw, transform.yaw, alpha),
      lerp(transform.previousPitch, transform.pitch, alpha),
      lerp(state.previousEyeHeight, state.eyeHeight, alpha),
    );
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
    // Look deltas are consumed once per frame, after the systems have read them.
    input.endFrame();

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
    stats.fps =
      stats.fps === 0 ? instantFps : stats.fps * FPS_SMOOTHING + instantFps * (1 - FPS_SMOOTHING);

    overlay?.update(stats, renderEndMs);
  });
  disposers.push(() => driver.dispose());

  // A hidden tab stops firing rAF; the stalker must not keep hunting meanwhile.
  const visibility = createVisibilityWatcher((visible) => {
    if (!visible) {
      pointerLock.release();
      input.clear();
    } else {
      // Re-anchor so the hidden gap is not simulated.
      loop.reset(performance.now() / 1000);
    }
  });
  disposers.push(() => visibility.dispose());

  disposers.push(mode.onChange((to, from) => bus.emit('ModeChanged', { to, from })));

  return {
    debug: {
      seed,
      mode,
      stats,
      player,
      position(): { x: number; y: number; z: number } {
        const transform = world.get(player, Transform);
        return transform === undefined
          ? { x: NaN, y: NaN, z: NaN }
          : { x: transform.position.x, y: transform.position.y, z: transform.position.z };
      },
    },

    start(): void {
      // Nothing to stream yet, so Loading passes straight through. The player stays in
      // Paused until they click, because pointer lock needs that gesture.
      mode.enter(GameMode.Loading);
      mode.enter(GameMode.Playing);
      mode.enter(GameMode.Paused);
      prompt.show('Click to play', 'WASD to move · mouse to look · ESC to release');
      loop.reset(performance.now() / 1000);
      driver.start();
      // rng is reserved for encounter selection; touching it here keeps the seed
      // meaningful from the first frame.
      void rng;
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
