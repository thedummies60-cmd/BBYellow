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
| `loop.ts` | Fixed-timestep accumulator; clamps long gaps, returns the render `alpha` |
| `world.ts` | ECS world: generational entity handles, component stores, queries |
| `events.ts` | Typed event bus. The only sanctioned cross-layer channel |
| `rng.ts` | Seeded PRNG. **The only place `Math.random()` may appear** |
| `math.ts` | Vec3 and scalar helpers — allocation-free, out-param style |
| `clock.ts` | Sim time, pause, timescale, and the timers that replace `setTimeout` |
| `index.ts` | The public surface. Other layers import `@core`, not deep paths |

All six are implemented and unit-tested. Two details worth knowing before you use them:

- **Entity handles carry a generation.** A destroyed handle never addresses whatever
  entity later takes its index — `world.alive()` rejects it instead. Recycled bare
  indices are how the stalker ends up taking a door's damage.
- **Component stores live on the world, not the descriptor.** `defineComponent` is safe
  at module scope precisely because it holds no data; two worlds never share state, and
  tests build a fresh world per case.

## Queries

Build a query once at system init and iterate it by index every frame:

```ts
const movers = world.query(Transform, Velocity);   // at init
for (let i = 0; i < movers.size; i++) { ... }      // every frame, allocates nothing
```

The result list is rebuilt only when the world's structure changes — creating or
destroying an entity, adding or removing a component. Mutating component *data* is not a
structural change, so the common case rebuilds nothing.

## Adding to core

Ask first: *does this need the browser, or know a game rule?* Yes to either → it does
not belong here. `core/` is the part of the codebase that outlives this game.
