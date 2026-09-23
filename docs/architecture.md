# Architecture

Companion to `CLAUDE.md` §2. That file states the rules; this one explains them.

## Why layered, and why so strictly

A horror game lives or dies on *feel*: the delay before a door creaks, how sanity decays
in the dark, whether the stalker's pathing reads as intelligent. Tuning that requires
iterating fast, and iterating fast requires running the simulation thousands of times
without a GPU in the loop.

That is only possible if the simulation never touches the renderer. Hence the hard rule:
`three` exists only under `src/render/`.

```
┌──────────────────────────────────────────────┐
│  app/         composition root · teardown    │  the only place game/ meets render/
├──────────────────────────────────────────────┤
│  ui/          HUD · menus · subtitles        │  reads state, emits intents
├──────────────────────────────────────────────┤
│  game/        rules · AI · sanity · scares   │  authoritative. headless. testable.
├───────────┬───────────┬──────────────────────┤
│  render/  │  audio/   │  input/              │  one browser API each
├───────────┴───────────┴──────────────────────┤
│  platform/    storage · rAF · pointer lock   │  the browser, behind interfaces
├──────────────────────────────────────────────┤
│  core/        loop · ECS · math · rng        │  pure. no DOM. no I/O.
├──────────────────────────────────────────────┤
│  shared/      types · pure helpers           │
└──────────────────────────────────────────────┘
```

## Frame anatomy

```
rAF tick
  ├─ input/     drain the event queue into an immutable InputSnapshot
  ├─ core/loop  accumulate real time
  │   └─ while (accumulator >= FIXED_DT)      // usually 0–2 iterations
  │        game/  update(world, FIXED_DT)     // deterministic, seeded
  │        accumulator -= FIXED_DT
  ├─ render/    interpolate(prev, curr, alpha) → draw
  ├─ audio/     apply queued events to the mix graph
  └─ ui/        reconcile from a state snapshot
```

`alpha = accumulator / FIXED_DT`. The renderer interpolates; it never simulates. The
interpolation itself happens in `app/`, which blends each component's previous and
current state onto the scene — hence the `previousAngle`/`angle` pairing you will see on
any component that moves. A
spiral-of-death guard caps catch-up iterations — a long stall drops sim time rather than
freezing the tab.

## Communication

**Downward:** direct function calls. `game/` calls `core/`. Fine, typed, cheap.

**Upward:** events only, via `core/events.ts`. `game/` emits `StalkerSpotted`;
`audio/` and `render/` subscribe. The simulation does not know they exist and runs
identically with no subscribers at all — which is exactly how the headless tests run it.

**Sideways:** doesn't happen. If `audio/` needs something from `render/`, the shared
concern belongs in a lower layer.

**Between siblings that cannot see each other:** `app/`. Reading entity transforms out of
the world and writing them onto meshes needs both `game/` and `render/`, and neither may
import the other. That wiring — and only that wiring — lives in the composition root.
See ADR-0002 for why the alternatives were rejected.

## Why ECS

Horror entities recombine constantly — a prop that becomes grabbable, then possessed,
then a light source. Inheritance models that badly; composition models it directly.
Components are plain data, which means the world serializes for free, giving save/load
and deterministic replay with no extra machinery.

## State ownership

| State | Owner | Notes |
|---|---|---|
| Simulation | `game/world` | The single source of truth |
| GPU resources | `render/assets` | Ref-counted, disposed on scene unload |
| Audio graph | `audio/mixer` | Voice pool, no unbounded node creation |
| Input | `input/` | Per-frame immutable snapshot |
| Settings / saves | `platform/storage` | Untrusted; validated on read |

No layer caches another layer's state. Derived values are recomputed or invalidated
explicitly — a stale cache in a scare sequence is a bug you will not reproduce.

## Scene lifecycle

```
load(manifest) → build(world) → ready → run → teardown → dispose
```

`teardown` is mandatory and symmetric with `build`. Every acquisition registers its
disposer at the point of acquisition. We reload scenes constantly during iteration; a
leak compounds fast and ends in a lost WebGL context.
