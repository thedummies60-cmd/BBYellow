/**
 * Composition root (ADR-0002).
 *
 * Wires the layers and owns the teardown order. It holds no rules: what is true lives in
 * `game/`, what it looks like lives in `render/`, what it sounds like in `audio/`. If a
 * gameplay decision appears here, it is in the wrong layer.
 */
import {
  clamp,
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
import {
  createFrameDriver,
  createPointerLock,
  createViewport,
  createVisibilityWatcher,
} from '@platform';
import {
  applyCameraPose,
  createFlashlight,
  createLevelView,
  createRenderer,
  createStalkerView,
} from '@render';
import { createInputDevice } from '@input';
import { createMixer } from '@audio';
import type { Voice } from '@audio';
import {
  CUES,
  createInteractionResult,
  createModeMachine,
  createMovementSystem,
  DEBUG_LEVEL,
  findTarget,
  FLASHLIGHT,
  GameMode,
  INTERACTION,
  lightAt,
  MOVEMENT,
  SANITY,
  spawnLevel,
  THREAT,
  updateSanity,
  updateStalker,
  useTarget,
} from '@game';
import type { Interactable, Player, Sanity, Stalker, Transform, Velocity } from '@game';
import { createHud, createPrompt, createScreen, createStatsOverlay } from '@ui';
import { IDLE_INPUT } from '@shared/input.js';
import type { AudioCue } from '@shared/audio-cue.js';
import { createFrameStats } from '@shared/stats.js';

const Transform = defineComponent<Transform>('Transform');
const Velocity = defineComponent<Velocity>('Velocity');
const Player = defineComponent<Player>('Player');
const Interactable = defineComponent<Interactable>('Interactable');
const Sanity = defineComponent<Sanity>('Sanity');
const Stalker = defineComponent<Stalker>('Stalker');

const FPS_SMOOTHING = 0.9;
/** How long a subtitle stays up after its cue. */
const SUBTITLE_SECONDS = 2.6;
/** Steps per second at walking pace, for the footstep cue. */
const STEP_RATE = 1.9;

export interface GameEvents extends Record<string, unknown> {
  ModeChanged: { to: GameMode; from: GameMode };
}

export interface App {
  start(): void;
  stop(): void;
  dispose(): void;
  readonly debug: {
    readonly seed: number;
    readonly mode: ReturnType<typeof createModeMachine>;
    readonly stats: ReturnType<typeof createFrameStats>;
    position(): { x: number; y: number; z: number };
    state(): {
      sanity: number;
      battery: number;
      flashlight: boolean;
      hasKey: boolean;
      stalker: string;
      stalkerDistance: number;
      prompt: string;
      subtitle: string;
      audio: boolean;
    };
    /** Teleports the player. For the smoke test only — there is no in-game equivalent. */
    warp(x: number, z: number): void;
    /**
     * Aims the camera directly. Also test-only: under pointer lock the browser reports
     * movement deltas, so a synthetic mouse move cannot set an absolute heading.
     */
    look(yaw: number, pitch: number): void;
  };
}

export interface AppOptions {
  seed?: number;
  showStats?: boolean;
  /** Skips the title screen. Used by the smoke test. */
  autoStart?: boolean;
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
  const instance = spawnLevel(world, Interactable, level);

  disposers.push(() => {
    clock.clearTimers();
    bus.clear();
    world.clear();
  });

  const player = world.create();
  const spawn = level.spawn.position;
  world.add(player, Transform, {
    position: vec3(spawn.x, spawn.y, spawn.z),
    previousPosition: vec3(spawn.x, spawn.y, spawn.z),
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
  world.add(player, Sanity, { value: 100, previousValue: 100 });

  const firstPatrol = level.patrol[0] ?? { x: 0, y: 0, z: 0 };
  const stalkerEntity = world.create();
  world.add(stalkerEntity, Stalker, {
    state: 'patrol',
    position: vec3(firstPatrol.x, 0, firstPatrol.z),
    previousPosition: vec3(firstPatrol.x, 0, firstPatrol.z),
    yaw: 0,
    previousYaw: 0,
    patrolIndex: 1,
    goal: vec3(firstPatrol.x, 0, firstPatrol.z),
    timer: 0,
    awareness: 0,
  });

  const updateMovement = createMovementSystem(
    world,
    { Transform, Velocity, Player },
    MOVEMENT,
    instance.colliders,
  );

  const inventory = new Set<string>();
  const interaction = createInteractionResult();
  let battery = 1;
  let flashlightOn = true;
  let escaped = false;
  let caught = false;
  let stepAccumulator = 0;

  // ---- presentation -----------------------------------------------------------
  const renderer = createRenderer(canvas);
  disposers.push(() => renderer.dispose());

  const levelView = createLevelView(level);
  renderer.scene.add(levelView.root);
  disposers.push(() => levelView.dispose());

  const stalkerView = createStalkerView();
  renderer.scene.add(stalkerView.root);
  disposers.push(() => stalkerView.dispose());

  const flashlight = createFlashlight(
    renderer.camera,
    FLASHLIGHT.coneAngle,
    FLASHLIGHT.intensity,
    FLASHLIGHT.range,
  );
  // The camera must be in the scene for a light parented to it to contribute.
  renderer.scene.add(renderer.camera);
  disposers.push(() => flashlight.dispose());

  const viewport = createViewport(canvas, (size) => renderer.resize(size));
  disposers.push(() => viewport.dispose());

  const hud = createHud();
  disposers.push(() => hud.dispose());
  const prompt = createPrompt();
  disposers.push(() => prompt.dispose());
  const screen = createScreen();
  disposers.push(() => screen.dispose());
  const overlay = options.showStats === true ? createStatsOverlay() : null;
  if (overlay !== null) disposers.push(() => overlay.dispose());

  const stats = createFrameStats();

  // ---- audio ------------------------------------------------------------------
  const mixer = createMixer(seed);
  disposers.push(() => mixer.dispose());

  let subtitle = '';
  let subtitleUntil = 0;
  let roomTone: Voice | null = null;
  let heartbeat: Voice | null = null;
  let breath: Voice | null = null;

  /** Plays a cue and raises its subtitle. The one place the two stay in step. */
  const cue = (id: string, position?: { x: number; y: number; z: number }): Voice | null => {
    const definition: AudioCue | undefined = CUES[id];
    if (definition === undefined) return null;
    const voice = position === undefined ? mixer.play(definition) : mixer.play(definition, { position });
    if (definition.subtitle !== '') {
      subtitle = definition.subtitle;
      subtitleUntil = clock.now + SUBTITLE_SECONDS;
    }
    return voice;
  };

  // ---- input ------------------------------------------------------------------
  const pointerLock = createPointerLock(canvas, {
    onChange: (locked) => {
      if (locked) {
        prompt.hide();
        if (!escaped && !caught) mode.enter(GameMode.Playing);
      } else {
        input.clear();
        if (!escaped && !caught) {
          mode.enter(GameMode.Paused);
          prompt.show('Paused', 'Click to resume · ESC to release the cursor');
        }
      }
    },
    onError: () => prompt.show('Click to play', 'Your browser declined pointer lock — try again'),
  });
  disposers.push(() => pointerLock.dispose());

  const input = createInputDevice(canvas, {
    lookSensitivity: MOVEMENT.lookSensitivity,
    shouldCaptureLook: () => pointerLock.locked,
  });
  disposers.push(() => input.dispose());

  // Edge-triggered: a held key must not re-fire every step.
  let interactHeld = false;
  const handleKey = (event: KeyboardEvent): void => {
    if (event.code === 'KeyF' && !event.repeat) toggleFlashlight();
  };
  window.addEventListener('keydown', handleKey);
  disposers.push(() => window.removeEventListener('keydown', handleKey));

  function toggleFlashlight(): void {
    if (battery <= 0) {
      cue('batteryDead');
      return;
    }
    flashlightOn = !flashlightOn;
    cue('click');
  }

  /** The gesture that grabs pointer lock is also the one that may resume audio. */
  const beginPlay = (): void => {
    void mixer.resume().then((running) => {
      if (running && roomTone === null) roomTone = cue('roomTone');
    });
    pointerLock.request();
  };
  disposers.push(prompt.onActivate(beginPlay));
  const handleCanvasClick = (): void => {
    if (!screen.visible) beginPlay();
  };
  canvas.addEventListener('click', handleCanvasClick);
  disposers.push(() => canvas.removeEventListener('click', handleCanvasClick));

  // ---- the run ----------------------------------------------------------------
  function endRun(won: boolean): void {
    if (escaped || caught) return;
    if (won) {
      escaped = true;
      mode.enter(GameMode.GameOver);
      screen.show('You got out', 'The door closes behind you. Whatever it was, it is still down there.', 'Click to play again');
    } else {
      caught = true;
      cue('stinger');
      mode.enter(GameMode.GameOver);
      screen.show('It found you', `Seed ${String(seed)} — the same run, if you want it again.`, 'Click to try again');
    }
    heartbeat?.stop(0.4);
    heartbeat = null;
    breath?.stop(0.3);
    breath = null;
    pointerLock.release();
  }

  const stepSimulation = (dt: number): void => {
    clock.advance(dt);

    const snapshot = pointerLock.locked ? input.snapshot : IDLE_INPUT;
    updateMovement(dt, snapshot);

    const transform = world.get(player, Transform);
    const state = world.get(player, Player);
    const sanity = world.get(player, Sanity);
    const stalker = world.get(stalkerEntity, Stalker);
    if (transform === undefined || state === undefined || sanity === undefined || stalker === undefined) {
      return;
    }

    // --- flashlight ---
    if (flashlightOn && battery > 0) {
      battery = Math.max(0, battery - dt / FLASHLIGHT.batterySeconds);
      if (battery === 0) {
        flashlightOn = false;
        cue('batteryDead');
      }
    }

    // --- footsteps and the noise they make ---
    const velocity = world.get(player, Velocity);
    const speed =
      velocity === undefined ? 0 : Math.hypot(velocity.linear.x, velocity.linear.z);
    let noiseRadius = 0;
    if (state.grounded && speed > 0.4) {
      // Crouching is silent — the only way past a stalker that has heard you.
      noiseRadius = state.crouching ? 0 : snapshot.sprint ? THREAT.hearSprint : THREAT.hearWalk;
      stepAccumulator += dt * STEP_RATE * (speed / MOVEMENT.walkSpeed);
      if (stepAccumulator >= 1) {
        stepAccumulator -= 1;
        if (!state.crouching) cue('footstep');
      }
    } else {
      stepAccumulator = 0.7; // land the next step promptly after a pause
    }

    // --- the stalker ---
    const event = updateStalker(
      stalker,
      { player: transform.position, noiseRadius },
      { config: THREAT, patrol: level.patrol, colliders: instance.colliders },
      dt,
    );
    if (event === 'spotted') cue('stinger');
    else if (event === 'heard') cue('stalkerStep', stalker.position);
    if (event === 'caught') {
      endRun(false);
      return;
    }

    // --- sanity ---
    const light = lightAt(
      transform.position.x,
      transform.position.z,
      level.lights,
      SANITY.litRadius,
      flashlightOn,
    );
    updateSanity(sanity, { light, hunted: stalker.state === 'hunt' }, SANITY, dt);

    // --- what you are looking at ---
    findTarget(
      world,
      Transform,
      Interactable,
      player,
      instance.interactables,
      (item) => inventory.has(item),
      INTERACTION,
      interaction,
    );

    if (snapshot.interact && !interactHeld) {
      const outcome = useTarget(
        world,
        Interactable,
        interaction,
        (item) => inventory.add(item),
        (index) => instance.openCollider(index),
      );
      if (outcome === 'taken') {
        cue('pickup');
        const target = world.get(interaction.target, Interactable);
        if (target !== undefined) levelView.setUsed(target.id);
      } else if (outcome === 'opened') {
        cue('doorOpen', { x: transform.position.x, y: 1.2, z: transform.position.z });
        const target = world.get(interaction.target, Interactable);
        if (target !== undefined) levelView.setUsed(target.id);
      } else if (outcome === 'locked') {
        cue('doorLocked');
      } else if (outcome === 'escaped') {
        cue('doorOpen');
        endRun(true);
        return;
      }
    }
    interactHeld = snapshot.interact;

    // --- ambient audio that tracks state ---
    const stalkerDistance = Math.hypot(
      stalker.position.x - transform.position.x,
      stalker.position.z - transform.position.z,
    );
    if (stalkerDistance < THREAT.breathRange && breath === null && mixer.running) {
      breath = cue('breath', stalker.position);
    } else if (stalkerDistance >= THREAT.breathRange && breath !== null) {
      breath.stop(0.6);
      breath = null;
    }
    breath?.setPosition(stalker.position.x, 1.2, stalker.position.z);

    if (sanity.value < SANITY.panicThreshold && heartbeat === null && mixer.running) {
      heartbeat = cue('heartbeat');
    } else if (sanity.value >= SANITY.panicThreshold && heartbeat !== null) {
      heartbeat.stop(0.5);
      heartbeat = null;
    }
    // Faster as composure goes — the oldest trick, and it still works.
    heartbeat?.setRate(1 + (1 - sanity.value / SANITY.panicThreshold) * 0.55);
  };

  const loop = createLoop(stepSimulation);

  let lastFrameSeconds = -1;

  const applyToScene = (alpha: number): void => {
    const transform = world.get(player, Transform);
    const state = world.get(player, Player);
    const sanity = world.get(player, Sanity);
    const stalker = world.get(stalkerEntity, Stalker);
    if (transform === undefined || state === undefined || sanity === undefined || stalker === undefined) {
      return;
    }

    const x = lerp(transform.previousPosition.x, transform.position.x, alpha);
    const y = lerp(transform.previousPosition.y, transform.position.y, alpha);
    const z = lerp(transform.previousPosition.z, transform.position.z, alpha);
    const yaw = lerp(transform.previousYaw, transform.yaw, alpha);

    applyCameraPose(
      renderer.camera,
      x,
      y,
      z,
      yaw,
      lerp(transform.previousPitch, transform.pitch, alpha),
      lerp(state.previousEyeHeight, state.eyeHeight, alpha),
    );

    stalkerView.setPose(
      lerp(stalker.previousPosition.x, stalker.position.x, alpha),
      0,
      lerp(stalker.previousPosition.z, stalker.position.z, alpha),
      lerp(stalker.previousYaw, stalker.yaw, alpha),
    );

    levelView.update(clock.now);
    mixer.setListener(x, y + state.eyeHeight, z, yaw);

    // Flicker only at the end of the battery, as a warning you cannot miss.
    const level01 = battery;
    const flickering = flashlightOn && level01 > 0 && level01 < FLASHLIGHT.flickerBelow;
    flashlight.set(flashlightOn && (!flickering || rng.next() > 0.25), level01);

    const composure = lerp(sanity.previousValue, sanity.value, alpha) / 100;
    renderer.setPostIntensity(clamp(1 - composure, 0, 1));
    renderer.setPostTime(clock.now);
  };

  const driver = createFrameDriver((nowSeconds) => {
    const intervalMs = lastFrameSeconds >= 0 ? (nowSeconds - lastFrameSeconds) * 1000 : 0;
    lastFrameSeconds = nowSeconds;

    const workStartMs = performance.now();
    const alpha = mode.simulating ? loop.advance(nowSeconds) : 0;
    const simEndMs = performance.now();

    applyToScene(alpha);
    input.endFrame();

    const renderStartMs = performance.now();
    renderer.render();
    const renderEndMs = performance.now();

    if (clock.now > subtitleUntil) subtitle = '';
    const sanity = world.get(player, Sanity);
    hud.update({
      prompt: interaction.prompt,
      promptLocked: interaction.locked,
      subtitle,
      battery: mode.simulating || escaped || caught ? battery : -1,
      flashlightOn,
      hasKey: inventory.has('key'),
      sanity: sanity?.value ?? 100,
    });
    hud.setVisible(!screen.visible);

    stats.simMs = simEndMs - workStartMs;
    stats.renderMs = renderEndMs - renderStartMs;
    stats.frameMs = renderEndMs - workStartMs;
    stats.drawCalls = renderer.stats.drawCalls;
    stats.triangles = renderer.stats.triangles;
    stats.steps = loop.stats.steps;
    stats.droppedTime = loop.stats.droppedTime;
    stats.entities = world.size;
    const instantFps = intervalMs > 0 ? 1000 / intervalMs : 0;
    stats.fps =
      stats.fps === 0 ? instantFps : stats.fps * FPS_SMOOTHING + instantFps * (1 - FPS_SMOOTHING);
    overlay?.update(stats, renderEndMs);
  });
  disposers.push(() => driver.dispose());

  const visibility = createVisibilityWatcher((visible) => {
    if (!visible) {
      pointerLock.release();
      input.clear();
    } else {
      loop.reset(performance.now() / 1000);
    }
  });
  disposers.push(() => visibility.dispose());

  disposers.push(mode.onChange((to, from) => bus.emit('ModeChanged', { to, from })));
  disposers.push(screen.onActivate(() => window.location.reload()));

  return {
    debug: {
      seed,
      mode,
      stats,
      position(): { x: number; y: number; z: number } {
        const transform = world.get(player, Transform);
        return transform === undefined
          ? { x: NaN, y: NaN, z: NaN }
          : { x: transform.position.x, y: transform.position.y, z: transform.position.z };
      },
      state() {
        const sanity = world.get(player, Sanity);
        const stalker = world.get(stalkerEntity, Stalker);
        const transform = world.get(player, Transform);
        const distance =
          stalker === undefined || transform === undefined
            ? -1
            : Math.hypot(
                stalker.position.x - transform.position.x,
                stalker.position.z - transform.position.z,
              );
        return {
          sanity: sanity?.value ?? -1,
          battery,
          flashlight: flashlightOn,
          hasKey: inventory.has('key'),
          stalker: stalker?.state ?? 'none',
          stalkerDistance: distance,
          prompt: interaction.prompt,
          subtitle,
          audio: mixer.running,
        };
      },
      warp(x: number, z: number): void {
        const transform = world.get(player, Transform);
        if (transform === undefined) return;
        transform.position.x = x;
        transform.position.z = z;
        transform.previousPosition.x = x;
        transform.previousPosition.z = z;
      },
      look(yaw: number, pitch: number): void {
        const transform = world.get(player, Transform);
        if (transform === undefined) return;
        transform.yaw = yaw;
        transform.previousYaw = yaw;
        transform.pitch = pitch;
        transform.previousPitch = pitch;
      },
    },

    start(): void {
      mode.enter(GameMode.Loading);
      mode.enter(GameMode.Playing);
      if (options.autoStart !== true) {
        mode.enter(GameMode.Paused);
        prompt.show(
          'Click to play',
          'WASD move · shift run · ctrl crouch · F flashlight · E use · ESC release',
        );
      }
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
