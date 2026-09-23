# Performance budgets

Budgets are constraints, not goals. Exceeding one blocks the change.

Reference machine: mid-range discrete GPU (GTX 1060 class), 1080p, Chrome, 60 Hz.

## Frame

| Metric | Budget | Measured with |
|---|---|---|
| Total frame time | 16.6 ms | `performance.now()` around the loop |
| Simulation | ≤ 4 ms | Loop instrumentation |
| Render submission | ≤ 8 ms | Renderer timing |
| Post-processing | ≤ 3 ms | GPU timer query |
| Draw calls | ≤ 300 | `renderer.info.render.calls` |
| Triangles | ≤ 1.5 M | `renderer.info.render.triangles` |
| Active shadow casters | ≤ 2 | Scene audit |
| Allocation in frame path | **0 bytes** | DevTools allocation timeline |

## Memory

| Metric | Budget |
|---|---|
| Texture memory | ≤ 1 GB |
| Geometry memory | ≤ 256 MB |
| JS heap after a scene load/unload cycle | Returns to ±5 % of baseline |
| Audio voices (concurrent) | ≤ 32 |

The heap check is the leak test: load a scene, unload it, force GC, compare. Growth
across three cycles means a missing disposer.

## Delivery

Serving is from a third-party static host — assume no compression negotiation, no HTTP/2
push, no edge cache we control.

| Metric | Budget |
|---|---|
| Initial download to playable | ≤ 25 MB |
| JS bundle (gzipped) | ≤ 1.5 MB |
| Time to first interaction @ 20 Mbps | ≤ 8 s |
| Largest single asset | ≤ 8 MB |

Everything beyond the first playable scene streams in.

## Measuring

```bash
npm run build && npm run preview     # always profile a production build
```

Dev-mode numbers are meaningless — unminified, unbundled, with HMR overhead.

1. Frame time: the in-game stats overlay (`?stats=1`).
2. Allocation: DevTools → Performance → Memory. The sawtooth in the frame path must be
   flat. A rising baseline is a leak; a sawtooth is per-frame garbage. Both are bugs.
3. GPU: Chrome tracing, or `EXT_disjoint_timer_query_webgl2` where available.
4. Load: DevTools Network with throttling, cache disabled, from a served `dist/`.

## When you blow a budget

Fix the cause; do not raise the number. Budgets move only through an ADR that states
what we are trading and on which hardware. The usual real causes, in order of frequency:

1. Per-frame allocation (GC pauses read as stutter)
2. Unbatched draw calls — materials cloned per object instead of shared
3. A third shadow caster someone added "temporarily"
4. Uncompressed textures shipped straight from `assets/`
5. Post-processing at full resolution when half would be invisible
