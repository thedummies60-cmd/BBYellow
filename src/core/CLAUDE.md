# core/ — engine primitives

The bottom of the stack. Loop, ECS, math, RNG, events, time.

## Rules

- **Zero I/O. Zero DOM. Zero Three.js.** No `window`, `document`, `fetch`,
  `localStorage`, `performance`, `requestAnimationFrame`. Time and scheduling are
  *injected* by `platform/`, never read directly.
- Everything here runs in plain Node under Vitest with no shims. If a test here needs
  `jsdom`, the code is in the wrong layer.
- Pure and deterministic: same inputs → same outputs, always. This is what makes
  replays, seeded repros, and headless tests possible.
- No dependencies on any other `src/` directory except `shared/`.
- No allocation in anything called per frame — see root §3.

## What lives here

| File | Responsibility |
|---|---|
| `loop.ts` | Fixed-timestep accumulator; emits `fixedUpdate(dt)` and `render(alpha)` |
| `world.ts` | ECS world: entity ids, component storage, system registration |
| `events.ts` | Typed event bus. The only sanctioned cross-layer channel |
| `rng.ts` | Seeded PRNG. **The only place `Math.random()` may appear** |
| `math.ts` | Vectors, quaternions, easing — allocation-free, out-param style |
| `clock.ts` | Sim time, pause, timescale. All gameplay timing reads this |

## Adding to core

Ask first: *does this need the browser, or know a game rule?* Yes to either → it does
not belong here. `core/` is the part of the codebase that outlives this game.
