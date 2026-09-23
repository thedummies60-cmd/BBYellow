/**
 * Proves the claim the architecture is built on: the simulation runs headless.
 *
 * No canvas, no WebGL, no DOM. If this ever needs a browser shim, something has leaked
 * out of game/ into a presentation layer (CLAUDE.md §2).
 */
import { describe, expect, it, vi } from 'vitest';
import { createClock, createEventBus, createLoop, createRng, createWorld, defineComponent } from '@core';
import type { Entity, World } from '@core';
import { clamp } from '@core/math';
import { createModeMachine, GameMode } from '@game/mode';

interface Sanity {
  value: number;
}
interface Lit {
  lit: boolean;
}

const Sanity = defineComponent<Sanity>('Sanity');
const Lit = defineComponent<Lit>('Lit');

/** Tunables that would live in game/config/ (CLAUDE.md §5). */
const SANITY = Object.freeze({
  drainInDarkness: 8, // points per second
  recoverInLight: 3,
  breakdownAt: 25,
});

interface Events extends Record<string, unknown> {
  SanityBreakdown: { entity: Entity };
}

/** A system: a function over state, stepped with the fixed dt (CLAUDE.md §6). */
function createSanitySystem(world: World, bus: ReturnType<typeof createEventBus<Events>>) {
  const query = world.query(Sanity, Lit); // built once, reused every step
  const broken = new Set<Entity>();

  return (dt: number): void => {
    const entities = query.entities;
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i] as Entity;
      const sanity = world.get(entity, Sanity);
      const lit = world.get(entity, Lit);
      if (sanity === undefined || lit === undefined) continue;

      const rate = lit.lit ? SANITY.recoverInLight : -SANITY.drainInDarkness;
      sanity.value = clamp(sanity.value + rate * dt, 0, 100);

      if (sanity.value <= SANITY.breakdownAt && !broken.has(entity)) {
        broken.add(entity);
        bus.emit('SanityBreakdown', { entity });
      }
    }
  };
}

describe('headless simulation', () => {
  it('drains sanity in darkness at the configured rate', () => {
    const world = createWorld();
    const bus = createEventBus<Events>();
    const clock = createClock();
    const update = createSanitySystem(world, bus);

    const player = world.create();
    world.add(player, Sanity, { value: 100 });
    world.add(player, Lit, { lit: false });

    const step = 1 / 60;
    for (let i = 0; i < 60; i++) {
      clock.advance(step);
      update(step);
    }

    expect(clock.now).toBeCloseTo(1, 6);
    expect(world.get(player, Sanity)?.value).toBeCloseTo(100 - SANITY.drainInDarkness, 6);
  });

  it('emits a breakdown event without knowing who is listening', () => {
    const world = createWorld();
    const bus = createEventBus<Events>();
    const update = createSanitySystem(world, bus);

    // Two subscribers stand in for audio/ and ui/; game/ knows about neither.
    const audio = vi.fn();
    const ui = vi.fn();
    bus.on('SanityBreakdown', audio);
    bus.on('SanityBreakdown', ui);

    const player = world.create();
    world.add(player, Sanity, { value: 26 });
    world.add(player, Lit, { lit: false });

    const step = 1 / 60;
    for (let i = 0; i < 60; i++) update(step);

    expect(audio).toHaveBeenCalledTimes(1);
    expect(ui).toHaveBeenCalledTimes(1);
    expect(audio).toHaveBeenCalledWith({ entity: player });
  });

  it('runs identically with no subscribers at all', () => {
    const run = (subscribe: boolean): number => {
      const world = createWorld();
      const bus = createEventBus<Events>();
      const update = createSanitySystem(world, bus);
      if (subscribe) bus.on('SanityBreakdown', () => {});

      const player = world.create();
      world.add(player, Sanity, { value: 30 });
      world.add(player, Lit, { lit: false });

      const step = 1 / 60;
      for (let i = 0; i < 120; i++) update(step);
      return world.get(player, Sanity)?.value ?? -1;
    };

    expect(run(false)).toBe(run(true));
  });

  it('freezes the simulation while paused', () => {
    const world = createWorld();
    const bus = createEventBus<Events>();
    const clock = createClock();
    const mode = createModeMachine();
    const update = createSanitySystem(world, bus);

    const player = world.create();
    world.add(player, Sanity, { value: 100 });
    world.add(player, Lit, { lit: false });

    mode.enter(GameMode.Loading);
    mode.enter(GameMode.Playing);

    const step = 1 / 60;
    const tick = (): void => {
      if (!mode.simulating) return;
      clock.advance(step);
      update(step);
    };

    for (let i = 0; i < 30; i++) tick();
    const atPause = world.get(player, Sanity)?.value ?? -1;

    mode.enter(GameMode.Paused);
    for (let i = 0; i < 600; i++) tick(); // ten seconds in the pause menu

    expect(world.get(player, Sanity)?.value).toBe(atPause);
    expect(clock.now).toBeCloseTo(0.5, 6);
  });

  it('reproduces a seeded encounter exactly', () => {
    // The property that turns "it only happened once" into a regression test.
    const run = (seed: string): string[] => {
      const world = createWorld();
      const bus = createEventBus<Events>();
      const rng = createRng(seed);
      const update = createSanitySystem(world, bus);
      const log: string[] = [];
      bus.on('SanityBreakdown', ({ entity }) => log.push(`breakdown:${entity}`));

      for (let i = 0; i < 12; i++) {
        const entity = world.create();
        world.add(entity, Sanity, { value: rng.range(20, 60) });
        world.add(entity, Lit, { lit: rng.bool(0.4) });
      }

      const step = 1 / 60;
      for (let i = 0; i < 300; i++) update(step);
      return log;
    };

    const first = run('basement-run-3');
    expect(run('basement-run-3')).toEqual(first);
    expect(run('basement-run-4')).not.toEqual(first);
    expect(first.length).toBeGreaterThan(0);
  });

  it('drives the whole thing from the loop at an irregular frame rate', () => {
    const world = createWorld();
    const bus = createEventBus<Events>();
    const clock = createClock();

    const player = world.create();
    world.add(player, Sanity, { value: 100 });
    world.add(player, Lit, { lit: false });

    const system = createSanitySystem(world, bus);
    const loop = createLoop((dt) => {
      clock.advance(dt);
      system(dt);
    });

    // The same wall-clock span, delivered as wildly different frame patterns.
    const simulate = (frameTime: number): number => {
      const w = world.get(player, Sanity);
      if (w !== undefined) w.value = 100;
      clock.scale = 1;
      loop.reset(0);
      let t = 0;
      while (t < 1) {
        t += frameTime;
        loop.advance(t);
      }
      return world.get(player, Sanity)?.value ?? -1;
    };

    const at144 = simulate(1 / 144);
    const at30 = simulate(1 / 30);

    // Sanity drain is within one fixed step regardless of frame rate: the property
    // that stops the game being easier on a fast machine (CLAUDE.md §3).
    expect(Math.abs(at144 - at30)).toBeLessThan(SANITY.drainInDarkness * (1 / 60) + 1e-6);
  });
});
