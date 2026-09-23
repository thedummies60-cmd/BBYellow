# Build order

The sequence to build this in. Each step produces something playable, and each one
depends only on the steps above it.

The architecture in `CLAUDE.md` is designed to be filled in this order — it does not
require building the whole structure before anything runs.

## 1. It moves

| Step | Done when | Touches |
|---|---|---|
| Engine primitives | Loop, clock, ECS, events, RNG, math — all unit-tested | `core/` ✅ |
| Mode machine | Menu → playing → paused transitions hold | `game/mode.ts` ✅ |
| Canvas + renderer | A cleared colored frame draws at 60 fps | `render/renderer.ts` |
| A room | Boxes and a floor, lit | `render/`, `game/scenes/` |
| Player + WASD | You move on a plane | `game/systems/movement.ts` |
| Mouse look | Pointer lock, ESC pauses | `input/`, `platform/`, `render/camera.ts` |
| Collision | Walls stop you; gravity; you can't fall through the floor | `game/systems/physics.ts` |

At this point you have a first-person walker, which is most of a horror game's verbs.

`core/` is done, so the next unbuilt step is the renderer. Everything above it composes
already — `tests/integration/simulation.test.ts` runs a sanity-drain system through the
loop, the clock, the world and the event bus with no canvas involved.

## 2. It has rules

| Step | Done when |
|---|---|
| Interaction | Look at a door, press E, it opens |
| Inventory | Pick up and carry an item |
| Flashlight | A light follows the camera, with a battery drain rate in config |
| Sanity | A value that drains in darkness and recovers in light |
| Save / load | State round-trips through `localStorage` and survives a reload |

Every one of these is testable headless. If it isn't, it has leaked into `render/`.

## 3. It is frightening

| Step | Done when |
|---|---|
| Ambient audio | Room tone, footsteps on varying surfaces |
| The stalker | Patrols, hears you, searches, loses you |
| Encounters | Scripted beats fire from config, reproducible from a seed |
| HUD + subtitles | Health, sanity, and every audio cue captioned |
| Menus | Title, pause, settings, death — all through the mode machine |

## 4. It ships

| Step | Done when |
|---|---|
| Asset pipeline | `npm run assets:build` produces compressed shipping assets |
| Budget pass | Everything in `docs/performance-budgets.md` holds on a production build |
| Degradation | No WebGL2 / no pointer lock / blocked audio all give readable messages |
| Deploy | The checklist in `docs/deployment.md` passes from a subdirectory |

## Sequencing rules

- **Stay playable.** Never leave the build broken across more than one session's work.
  A game you can't run is a game you can't feel.
- **One vertical slice first.** One room, one enemy, one scare, end to end, before any
  breadth. Breadth on an unproven foundation is the expensive mistake.
- **Small commits.** `Add player movement`, `Add mouse look`, `Add stalker hearing` —
  one behavior each, so a regression bisects to a readable diff.
- **Tune last.** Timing and balance are the final pass. That is what `game/config/` is
  for, and why it is data rather than code.
