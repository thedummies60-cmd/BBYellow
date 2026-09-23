# CLAUDE.md — BBYellow

3D first-person horror game. Runs in the browser, shipped as a **static bundle** to a
third-party webserver we do not control.

Read this file before changing code. It describes how this codebase is allowed to be
shaped. It is not style advice — the rules marked **MUST** are enforced in review and,
where possible, in CI.

---

## 1. Stack and constraints

| | |
|---|---|
| Language | TypeScript, `strict: true`, no implicit `any` |
| Renderer | Three.js (WebGL2) |
| Build | Vite → static `dist/` (HTML + JS + assets, no server runtime) |
| Tests | Vitest |
| Target | Desktop browsers with pointer-lock + WebGL2; 60 fps at 1080p on mid-range GPU |

**The host is dumb static storage.** It serves files. It cannot run our code, hold a
secret, validate a save, or rewrite a URL. Every architectural decision follows from
that; see §7.

---

## 2. Layering — the one rule that matters

Dependencies point **downward only**. A module may import from its own layer or any
layer below it, never above.

```
        ui/            HUD, menus, subtitles — reads game state, never mutates it
        game/          rules: sanity, stalker AI, doors, inventory, scares
  ───────────────────────────────────────────────────────────────────────
  render/   audio/   input/      capability layers — own one browser API each
  ───────────────────────────────────────────────────────────────────────
        platform/      browser adapters: storage, pointer lock, fetch, rAF
        core/          loop, ECS, math, RNG, events — zero I/O, zero DOM
        shared/        types and pure helpers, importable from anywhere
```

**MUST NOT**: `core/` imports `three`, `window`, `document`, or anything from a layer
above it. `core/` is testable in plain Node with no DOM shim. If you find yourself
wanting Three.js types in `core/`, you are putting game logic in the wrong place.

**MUST NOT**: `game/` imports `three`. Game logic decides *"the stalker is at position
P, lit state = hidden"*. `render/` decides what that looks like. The divide is what
lets us test the horror without a GPU.

**MUST**: `three` is imported **only** under `src/render/`. One grep proves it:

```bash
grep -rn "from 'three'" src --include=*.ts | grep -v '^src/render/'   # must be empty
```

**MUST NOT**: circular imports between modules. If A and B need each other, the shared
piece belongs in a lower layer or the boundary is wrong.

Cross-layer talk goes through the event bus (`core/events.ts`) or an explicit interface
defined by the **lower** layer. Lower layers never import upward to "call back".

---

## 3. The frame — determinism and allocation

### Fixed simulation, interpolated render

Simulation runs at a **fixed timestep** (60 Hz). Rendering runs as fast as the display
allows and interpolates between the last two sim states.

**MUST NOT**: use raw frame delta for gameplay. Physics, AI, sanity drain, and timers
read the fixed `dt`. Anything that scales with framerate is a bug — it makes the game
easier on a fast machine and desyncs replays and tests.

**MUST**: all randomness comes from a seeded PRNG in `core/rng.ts`. `Math.random()` is
banned in `src/` outside that file. A scare sequence must be reproducible from a seed
when we are chasing a bug report.

### Allocation

The GC pause is the enemy. A 40 ms collection during a chase reads as the game breaking.

**MUST NOT**: allocate in the per-frame path. No `new Vector3()`, no object/array
literals, no closures, no `.map`/`.filter`, no string concatenation inside `update()`
or `render()`. Use preallocated scratch objects (`shared/scratch.ts`) and pooled
entities.

**MUST**: pool anything spawned repeatedly — particles, audio voices, decals,
projectiles, raycast results. Pools live next to the system that owns them.

Profile before optimizing anything else; profile with the allocation rule already
honored, because it dominates everything.

---

## 4. Resource lifecycle

Three.js does not garbage-collect GPU memory. Leaks here end the session with a
context loss, which on a horror game means losing the player mid-scare.

**MUST**: every `geometry`, `material`, `texture`, and `render target` you create has a
matching `.dispose()` on a teardown path that runs on scene unload.

**MUST**: anything acquiring a resource — a listener, an interval, an audio node, a
GPU object — returns or registers a disposer. `render/`, `audio/`, and `input/` each
expose `dispose()` and the scene teardown calls them. No orphan cleanup logic.

**MUST**: load assets through the asset manager (`render/assets.ts`), never by ad-hoc
loader calls. It dedupes, ref-counts, and knows what to free between levels.

---

## 5. Data, not code

Horror is tuning. Reload-and-feel beats recompile-and-feel.

**MUST**: encounter timings, sanity curves, AI aggression, light flicker patterns,
fog density, and audio ducking live as data in `src/game/config/`, not as literals
buried in systems.

**MUST NOT**: magic numbers in systems. A number a designer would ever want to change
belongs in config with a name.

Config is typed and validated at load. A malformed config fails loudly at startup, not
silently three rooms in.

---

## 6. Module shape

- One concern per file. If a file needs "and" to describe it, split it.
- Systems are functions over state — `update(world, dt)` — not classes holding
  cross-system references.
- Components are plain data. No methods, no inheritance.
- **MUST NOT**: mutable module-level singletons holding game state. State lives in the
  world/context object that gets passed down. A singleton is untestable and
  un-restartable, and this game restarts a lot.
- Public surface of a directory goes through its `index.ts`. Importing a deep internal
  path from another directory is a boundary violation.
- Filenames `kebab-case.ts`; types `PascalCase`; values `camelCase`; config constants
  `SCREAMING_SNAKE`.

---

## 7. Shipping to a host we don't control

**MUST**: build with a **relative base** (`base: './'` in `vite.config.ts`). We may be
served from a subdirectory, and absolute `/assets/...` paths break there. Never
hardcode a leading `/` in an asset URL.

**MUST NOT**: put a secret, key, or token in `src/`, `public/`, or `.env` files that
get bundled. Everything shipped is public — assume the player reads it. If a feature
needs a secret, it needs a backend, and we do not have one.

**MUST**: treat all client state (saves, settings) as untrusted and tamperable. Parse
and validate it on load; never `JSON.parse` straight into game state. Corrupt save →
fall back to defaults, don't crash.

**MUST**: content-hash filenames for cache busting. We cannot rely on the host sending
useful cache headers. `index.html` is the only unhashed file.

**MUST**: verify the build works from `file://`-like conditions — no server rewrites, no
SPA fallback, no custom MIME config. If a feature needs a special server header
(SharedArrayBuffer/COOP-COEP, for one), it does not ship — the host won't give us one.

**MUST**: degrade explicitly. No WebGL2, no pointer lock, no audio-autoplay permission →
show a readable message, not a black screen.

Large binaries (models, textures, audio) go through Git LFS — see `.gitattributes`.

---

## 8. Performance budgets

Numbers are per frame at 1080p, mid-range GPU. Exceeding one is a review blocker, not
a follow-up ticket.

| Budget | Limit |
|---|---|
| Frame time | 16.6 ms (60 fps) |
| Draw calls | ≤ 300 |
| Triangles | ≤ 1.5 M |
| Allocation in frame path | 0 bytes |
| Texture memory | ≤ 1 GB |
| Initial download (to playable) | ≤ 25 MB |
| Load to first interaction | ≤ 8 s on 20 Mbps |

Details and measurement method: `docs/performance-budgets.md`.

---

## 9. Testing

**MUST**: `core/` and `game/` have unit tests. They are pure and headless — there is no
excuse. Renderer and audio may be smoke-tested only.

**MUST**: any fixed bug gets a regression test, seeded via `core/rng.ts`.

Test what breaks: state machines, timers, save/load round-trips, AI transitions, sanity
math. Do not test that Three.js draws a triangle.

---

## 10. Definition of done

Before you call a change complete:

- [ ] `npm run check` passes (typecheck + lint + test)
- [ ] `npm run build` produces a working `dist/` with relative paths
- [ ] Layering rule holds — the `three` grep in §2 is empty
- [ ] No new allocation in the frame path
- [ ] Every resource created has a disposer
- [ ] New tunables are in `game/config/`, not inline
- [ ] Budgets in §8 still hold

---

## 11. Anti-patterns — reject on sight

- `three` imported outside `render/`
- A "manager" or "utils" file that accumulates unrelated functions
- Game logic reading from the DOM, or UI mutating game state directly
- `setTimeout` for gameplay timing (use the sim clock — it pauses, it seeks, it tests)
- `any`, `as` casts to silence the compiler, `@ts-ignore` without a reason comment
- Fixes applied in the renderer for bugs that live in the simulation
- Committed `dist/`, `node_modules/`, or unoptimized source art

---

## 12. Working in this repo

- Branch from `main`; work on `claude/<topic>` branches.
- Commits: imperative subject, one logical change. Explain **why** in the body.
- **MUST NOT**: commit generated output, large unoptimized art, or secrets.
- Directory-specific rules live in nested `CLAUDE.md` files — `src/core/`,
  `src/render/`, `src/game/`, `assets/`, `tests/`. They take precedence for files in
  their directory.
- Architectural changes get an ADR in `docs/adr/`. If you are about to break a **MUST**
  here, that is an ADR, not a commit.
