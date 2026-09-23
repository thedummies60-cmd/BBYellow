/**
 * The bring-up level.
 *
 * Authored as data (CLAUDE.md §5): `render/` builds meshes from it and `game/` derives
 * colliders from it, so the thing you walk into is the thing you see. Real levels will
 * be authored externally and loaded through the asset manager; the shape stays the same.
 */
import type { LevelData } from '@shared/level.js';

const WALL = 0x2a2724;
const CRATE = 0xb7a98b;

export const DEBUG_LEVEL: LevelData = Object.freeze({
  name: 'debug-room',

  spawn: {
    position: { x: 0, y: 0, z: 4 },
    yaw: 0, // facing -Z, into the room
  },

  room: { width: 12, height: 3.2, depth: 16 },

  boxes: Object.freeze([
    // A low crate to walk into, and a taller one to be blocked by.
    { center: { x: -2.2, y: 0.4, z: -1 }, size: { x: 1.2, y: 0.8, z: 1.2 }, color: CRATE },
    { center: { x: 2.4, y: 0.75, z: -3 }, size: { x: 1, y: 1.5, z: 1 }, color: CRATE },
    // A partial divider, so there is a corner to round and something to break sightlines.
    { center: { x: 0, y: 1.2, z: -5.5 }, size: { x: 5, y: 2.4, z: 0.4 }, color: WALL },
  ]),

  lights: Object.freeze([
    // One caster, well inside the budget of two (src/render/CLAUDE.md).
    {
      position: { x: 0, y: 2.7, z: -1.5 },
      color: 0xffd9a0,
      intensity: 14,
      distance: 16,
      castShadow: true,
    },
    // A cold fill at the far end, to give the darkness somewhere to lead.
    {
      position: { x: 0, y: 2.4, z: -7 },
      color: 0x5a7a9a,
      intensity: 5,
      distance: 10,
    },
  ]),

  ambient: { color: 0x2a2f38, intensity: 0.28 },
});
