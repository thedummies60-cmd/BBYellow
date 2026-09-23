# game/ — rules and simulation

Everything the game *is*, with nothing about how it looks or sounds.

## Rules

- **No `three`, no DOM, no audio API.** Game code decides *what is true*. Other layers
  decide how it is presented. Game state must be fully describable as plain data.
- **Headless-testable.** Every system here runs under Vitest without a browser. If you
  cannot test a rule, the rule is entangled with presentation.
- **Systems are functions**: `update(world, dt)`. No cross-system references, no
  inheritance hierarchies, no system reaching into another system's internals.
- **Components are plain data.** No methods. No behavior. Serializable as-is — this is
  what makes save/load and replay possible for free.
- **Fixed `dt` only.** Never the render delta. See root §3.
- **All randomness via `core/rng.ts`.** A scare that cannot be reproduced from a seed
  cannot be debugged from a bug report.
- **Tunables live in `config/`**, typed and validated. No magic numbers in systems.

## Layout

| Path | Responsibility |
|---|---|
| `components/` | Pure data: `Transform`, `Health`, `Sanity`, `Inventory`, `Hearing` |
| `systems/` | Behavior: movement, stalker AI, sanity, interaction, encounters |
| `entities/` | Spawn functions — compose components, return an entity id |
| `scenes/` | Level definition, spawn tables, teardown |
| `config/` | Balance data. The file a designer edits without touching code |

## Communicating outward

Game systems emit **events**, they do not call the renderer or audio. `SanityDropped`,
`StalkerSpotted`, `DoorOpened` — `render/`, `audio/`, and `ui/` subscribe. This keeps
the simulation authoritative and lets us run it with no output at all.

## Player-facing honesty

Encounter logic is the part players feel most sharply. Keep it legible: an unfair
death should be explainable by reading one system. If the stalker's decision needs
three systems and a timer to explain, simplify it before shipping it.
