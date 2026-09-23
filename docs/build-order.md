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
| Canvas + renderer | A lit room draws, resizes and tears down cleanly | `render/renderer.ts` ✅ |
| Composition root | Simulation state reaches the scene, interpolated | `app/bootstrap.ts` ✅ |
| Stats overlay | `?stats=1` reports frame time, draw calls, steps | `ui/stats-overlay.ts` ✅ |
| A real room | Level geometry authored as data in `game/scenes/` | `render/level-view.ts` ✅ |
| Player + WASD | You move, sprint, crouch and jump | `game/systems/movement.ts` ✅ |
| Mouse look | Pointer lock, click to play, ESC pauses | `input/`, `platform/`, `render/camera.ts` ✅ |
| Collision | Walls stop you; gravity; you can't fall through the floor | `game/collision.ts` ✅ |

**You now have a first-person walker**, which is most of a horror game's verbs. Step 2
is where it becomes a game rather than a tech demo.

`npm run dev` drops you into a playable demo: a basement with a key to find, a door to
escape through, and something walking the corridor between them.

Two harnesses back the work. The unit and integration tests cover the controller
completely without a browser: walk speed, diagonal normalization, air control, pitch
clamping, wall sliding, and staying inside the room from any heading. `scripts/smoke.mjs`
then drives a production build in Chromium — from a subdirectory, under software WebGL —
engaging real pointer lock, pressing W, and checking the player moved and could not leave
the room.

## 2. It has rules

| Step | Done when |
|---|---|
| Interaction | Look at a door, press E, it opens | ✅ |
| Inventory | Pick up and carry an item | ✅ |
| Flashlight | A light follows the camera, with a battery drain rate in config | ✅ |
| Sanity | A value that drains in darkness and recovers in light | ✅ |
| Save / load | State round-trips through `localStorage` and survives a reload |

Every one of these is testable headless. If it isn't, it has leaked into `render/`.

## 3. It is frightening

| Step | Done when |
|---|---|
| Ambient audio | Room tone, footsteps, positional cues | ✅ |
| The stalker | Patrols, hears you, searches, loses you | ✅ |
| HUD + subtitles | Battery, composure, and every audio cue captioned | ✅ |
| Screens | Click-to-play, pause, death, escape — through the mode machine | ✅ |
| Encounters | Scripted beats fire from config, reproducible from a seed |
| Settings | Sensitivity, subtitles, motion and photosensitivity options |

**The demo is playable here.** Find the key, escape the basement, do not get caught.
What remains in this section is depth, not viability.

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
