# BBYellow

A 3D first-person horror game that runs in the browser and ships as a **static bundle**
to a third-party webserver.

## Quick start

```bash
nvm use            # Node 22 (see .nvmrc)
npm ci
npm run dev        # http://localhost:5173
```

```bash
npm run check      # typecheck + lint + layering rules + tests — run before every commit
npm run build      # → dist/, ready to upload
npm run preview    # serve the production build locally
```

## Read this first

**[`CLAUDE.md`](CLAUDE.md)** — the architectural rules this codebase is held to. Read it
before writing code. Nested `CLAUDE.md` files under `src/core/`, `src/render/`,
`src/game/`, `assets/`, and `tests/` add directory-specific rules.

The three rules that shape everything else:

1. **Dependencies point downward only**, and `three` is imported *only* under
   `src/render/`. The simulation is headless and testable without a GPU.
2. **Fixed-timestep simulation, interpolated rendering**, all randomness seeded. Horror
   is timing, and timing has to be reproducible.
3. **Zero allocation in the frame path.** A GC pause during a chase reads as the game
   breaking.

`npm run check:layers` enforces (1) and part of (2) in CI.

## Layout

```
src/
  core/        loop · ECS · math · seeded RNG · events    pure, no DOM, no Three.js
  platform/    browser adapters: storage, pointer lock, rAF
  render/      Three.js lives here and nowhere else
  audio/       mixer, voice pool, spatial audio
  input/       keyboard, mouse, gamepad → per-frame snapshot
  game/        rules: sanity, stalker AI, interaction, encounters   headless
  ui/          HUD, menus, subtitles
  shared/      types and pure helpers
assets/        source art (Git LFS) — processed, never shipped as-is
public/        files copied verbatim into the build
docs/          architecture, budgets, deployment, asset pipeline, ADRs
scripts/       check-layers, asset build
tests/         unit · integration · fixtures
```

## Documentation

| Document | Covers |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | The rules. Start here. |
| [`docs/architecture.md`](docs/architecture.md) | Why the layering is strict; frame anatomy |
| [`docs/performance-budgets.md`](docs/performance-budgets.md) | Hard budgets and how to measure them |
| [`docs/deployment.md`](docs/deployment.md) | Shipping to a host we don't control |
| [`docs/asset-pipeline.md`](docs/asset-pipeline.md) | Source art → shipping assets |
| [`docs/horror-design-principles.md`](docs/horror-design-principles.md) | Design constraints behind the rules |
| [`docs/adr/`](docs/adr/) | Architecture decision records |

## Assets

Binary assets use **Git LFS**. Install it before your first clone or commit:

```bash
git lfs install
```

Add new binary extensions to `.gitattributes` *before* their first commit — a blob
committed without LFS stays in history permanently.

## Deploying

`npm run build` produces a self-contained `dist/` with relative paths and content-hashed
filenames. Upload its contents; upload hashed assets first and `index.html` last. Full
checklist in [`docs/deployment.md`](docs/deployment.md).

There is no backend. Everything in `dist/` is public — **never** put a secret in the
bundle.
