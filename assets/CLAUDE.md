# assets/ — source art

Authoring-time source files. **Nothing here is shipped as-is.**

- `assets/` = sources (`.blend`, `.wav`, 4K masters, `.psd`)
- `public/` = files copied verbatim into the build
- `src/` = anything imported by code and processed by Vite

## Rules

- **Binaries go through Git LFS.** See `.gitattributes`. Committing a 60 MB texture as a
  regular blob is permanent — it stays in history after deletion.
- **Optimize before commit.** Run `npm run assets:build`; do not commit 4K masters as
  shipping textures.
- **Naming**: `kebab-case`, category prefix, no spaces — `prop-chair-oak.glb`,
  `sfx-door-creak-01.wav`, `amb-basement-loop.ogg`.
- **Textures**: power-of-two, KTX2/Basis compressed, mipmapped. Atlas small maps to keep
  draw calls under budget.
- **Models**: glTF/GLB only. Triangulated, single UV set unless lightmapped, origin at
  the logical pivot.
- **Audio**: 48 kHz source; ship OGG for music/ambience, short WAV for one-shots that
  need zero-latency triggering. Normalize to a consistent reference level — mixing is
  done in `audio/`, not per-file.
- **Every asset needs a license note** in `docs/asset-credits.md`. No exceptions, no
  "temporary" placeholders from the internet. The build is public and redistributed.
