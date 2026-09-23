# render/ — the only place Three.js exists

Translates simulation state into pixels. Owns the GPU and everything on it.

## Rules

- **The sole importer of `three`.** Enforced by `npm run check:layers`. If another layer
  needs a vector type, it uses `core/math.ts`.
- **Read-only on game state.** `render/` consumes the world; it never mutates it. A
  gameplay change made from the renderer is a bug that will be invisible to every test
  we have.
- **Every created resource gets disposed.** Geometry, material, texture, render target,
  and any `onBeforeCompile` shader. Register the disposer at creation; do not leave
  cleanup for later.
- **Load through `assets.ts`.** Never call a Three.js loader directly. The asset manager
  ref-counts and frees between scenes.
- Interpolate between the two most recent sim states using the `alpha` from the loop.
  Never simulate here, not even "just a little smoothing" that feeds back into state.
- No per-frame allocation. Reuse scratch vectors; mutate in place.

## Layout

| Path | Responsibility |
|---|---|
| `renderer.ts` | WebGL context, resize, frame submission, context-loss recovery |
| `camera.ts` | First-person camera rig; reads player transform, applies view bob/sway |
| `assets.ts` | Loading, dedupe, ref-counting, disposal |
| `materials/` | Material factories. Shared instances — do not clone per object |
| `postfx/` | Post chain: grain, vignette, chromatic aberration, darkness grading |
| `shaders/` | GLSL. One effect per file, documented uniforms |

## Horror-specific

Darkness is the mechanic, so the light budget is a gameplay constraint, not a graphics
one. Real-time shadow casters: **≤ 2**. Everything else is baked or faked. When a scene
wants a third caster, the answer is a design change, not a budget change.

Keep post-processing cheap — it runs every frame at full resolution and it is the first
thing to blow the 16.6 ms frame.
