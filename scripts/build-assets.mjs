#!/usr/bin/env node
/**
 * Asset pipeline: assets/ (sources, LFS) → public/ or src/ (shipping).
 *
 * Not yet implemented. See docs/asset-pipeline.md for the target behavior:
 *   - models:   glTF → Draco/meshopt compressed .glb
 *   - textures: masters → power-of-two → KTX2/Basis + mipmaps, ORM packed
 *   - audio:    48 kHz masters → OGG (music/ambience) / WAV (one-shots), normalized
 *
 * Source art is never shipped as-is. Until this exists, run the conversions by hand and
 * record every asset in docs/asset-credits.md.
 */
console.error('scripts/build-assets.mjs is not implemented yet — see docs/asset-pipeline.md');
process.exit(1);
