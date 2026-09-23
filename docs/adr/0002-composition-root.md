# 2. A composition root layer

Date: 2026-09-23
Status: Accepted

## Context

Building the first renderer exposed a gap in the layering.

`game/` may not import `render/` — the whole point of the rule is that the simulation
runs headless. `render/` may not import `game/` either: dependencies point downward, and
`render/` sits below. So a frame has to read entity state out of the world and write it
onto meshes, and **no layer is allowed to do both**.

The frame diagram in `docs/architecture.md` quietly assumed someone does this wiring, but
never said who. In practice it had landed in `src/main.ts`, which is outside every layer
and therefore unchecked by `scripts/check-layers.mjs` — the wiring was accumulating in
the one file the layering rules did not cover.

The options considered:

1. **Let `game/` import `render/`.** Rejected: it ends the headless property, which is
   the single most valuable constraint in the codebase.
2. **Let `render/` read the world directly.** Rejected: `render/` would have to know
   component types, which is the same coupling pointing the other way, and would make
   the renderer untestable without a populated world.
3. **Events only.** Rejected for per-frame transforms: an event per entity per frame
   allocates on the frame path (CLAUDE.md §3) and inverts control for something that is
   simply a read.
4. **A composition root above every layer.** Chosen.

## Decision

We will add `src/app/` as the top layer. It may import from every other layer, and
nothing may import from it.

Its job is wiring and nothing else: construct the world, renderer, systems and overlay,
connect them, own the teardown order, and copy interpolated simulation state onto the
scene each frame. Rules, behavior, and drawing stay in the layers that own them — if a
decision about *what is true* appears in `app/`, it belongs in `game/`.

`src/main.ts` stays a thin entry point: capability checks, then hand off to `app/`.

`scripts/check-layers.mjs` and `eslint.config.js` are updated so `app/` is a checked
layer rather than an unchecked escape hatch. `app/` remains barred from importing
`three` — the renderer owns the GPU, and the composition root talks to it through
`render/`'s interface.

## Consequences

There is now one honest answer to "where does game state become pixels", and it is a
layer the tooling checks.

The cost is a layer with real power: `app/` can reach anything, so it is the easiest
place for logic to accumulate where no test can reach it. It stays thin by convention
rather than by construction, and that is the thing to watch in review — a growing
`app/` means something is in the wrong place.

The per-frame state copy is explicit and manual. That is deliberate: it is one loop over
one query, it allocates nothing, and it keeps the two representations independent. If it
ever grows past a few component types, the answer is a declarative binding table in
`app/`, not a shortcut through the layering.
