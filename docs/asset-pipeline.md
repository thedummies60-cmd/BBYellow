# Asset pipeline

`assets/` (sources, LFS) → `npm run assets:build` → `public/` or `src/` (shipping) →
`dist/` (hashed).

Source art is never shipped directly. A 4K PNG master and a shipping texture are
different artifacts with different lifetimes.

## Models

Author → export glTF 2.0 (`.glb`) → Draco/meshopt compression.

- Triangulated, Y-up, metric scale (1 unit = 1 m).
- Origin at the logical pivot — a door's origin is its hinge, not its center.
- One UV set unless lightmapped; UV1 reserved for lightmaps.
- No embedded textures in the `.glb`; reference shared textures so the asset manager
  can dedupe them.
- Names survive export — systems find sockets and colliders by name.

## Textures

Author → resize to power-of-two → KTX2/Basis → mipmaps.

| Use | Max size | Format |
|---|---|---|
| Hero prop / inspectable | 2048 | KTX2 (UASTC) |
| Environment | 1024 | KTX2 (ETC1S) |
| Detail / decal | 512 | KTX2 (ETC1S) |
| UI | native | PNG |

Pack ORM (occlusion/roughness/metalness) into one RGB texture. Three maps where one
would do is three times the memory and three times the bind cost.

## Audio

Author at 48 kHz / 24-bit → normalize to the project reference level → export.

| Use | Format | Notes |
|---|---|---|
| Music, ambience | OGG Vorbis ~128 kbps | Streamed; seamless loop points |
| One-shot SFX | WAV 16-bit | Decoded to buffer; must trigger with zero latency |
| Dialogue | OGG ~96 kbps | Subtitle file required alongside |

Per-file mixing is baked in at the wrong layer. Normalize to the reference level and let
`audio/mixer` do the mixing — otherwise ducking, occlusion, and distance attenuation all
fight the file.

## Rules

- Everything binary is LFS-tracked (`.gitattributes`). Check before the first commit of
  a new extension — un-LFS'd blobs are permanent.
- Optimize *before* committing shipping assets. `assets/` may hold masters; `public/`
  and `src/` may not.
- Every asset is credited and licensed in `docs/asset-credits.md` at the time it is
  added. Untraceable assets get removed, not grandfathered.
- Keep the largest single asset under 8 MB so streaming stays granular.
