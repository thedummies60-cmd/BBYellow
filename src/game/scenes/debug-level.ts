/**
 * The demo level: a basement you have to get out of.
 *
 * Authored as data (CLAUDE.md §5). `render/` builds meshes from it, `game/` derives
 * colliders and interactables from the same description, so what you see and what stops
 * you cannot drift apart.
 *
 * Layout, looking down (-Z is forward from spawn):
 *
 *      ┌─────────┬─────────┐
 *      │  store  │  boiler │   the key is in the store room
 *      │  (key)  │         │
 *      ├──┐   ┌──┴───┐  ┌──┤
 *      │  corridor     │  │   the stalker patrols here
 *      ├──┘   └──┐  ┌──┘  │
 *      │  entrance hall    │   spawn, and the exit door
 *      └───────[exit]──────┘
 */
import type { InteractableSpec, LevelData } from '@shared/level.js';

const WALL = 0x2a2724;
const CRATE = 0xb7a98b;
const DOOR = 0x6b4f33;

/** Typed separately so `kind` narrows to its literal union rather than `string`. */
const INTERACTABLES: readonly InteractableSpec[] = Object.freeze([
    {
      id: 'key',
      kind: 'pickup',
      position: { x: -5.5, y: 1.2, z: -9 },
      label: 'Take the key',
    },
    {
      id: 'store-door',
      kind: 'door',
      position: { x: -3.6, y: 1.2, z: -4 },
      label: 'Open the door',
      blocks: { center: { x: -3.6, y: 1.6, z: -4 }, size: { x: 1.6, y: 3.2, z: 0.4 }, color: DOOR },
    },
    {
      id: 'exit',
      kind: 'exit',
      position: { x: 0, y: 1.2, z: 12.8 },
      label: 'Unlock the door and leave',
      lockedLabel: 'Locked — it needs a key',
      requires: 'key',
      blocks: { center: { x: 0, y: 1.6, z: 12.9 }, size: { x: 2.2, y: 3.2, z: 0.3 }, color: DOOR },
    },
]);

export const DEBUG_LEVEL: LevelData = Object.freeze({
  name: 'basement',

  spawn: {
    position: { x: 0, y: 0, z: 11 },
    yaw: 0, // facing -Z, into the level
  },

  room: { width: 16, height: 3.2, depth: 26 },

  boxes: Object.freeze([
    // --- partition between the hall and the corridor, with two gaps ---
    { center: { x: -6, y: 1.6, z: 4 }, size: { x: 4, y: 3.2, z: 0.4 }, color: WALL },
    { center: { x: 6, y: 1.6, z: 4 }, size: { x: 4, y: 3.2, z: 0.4 }, color: WALL },

    // --- partition between the corridor and the back rooms ---
    { center: { x: -6.2, y: 1.6, z: -4 }, size: { x: 3.6, y: 3.2, z: 0.4 }, color: WALL },
    { center: { x: 6.2, y: 1.6, z: -4 }, size: { x: 3.6, y: 3.2, z: 0.4 }, color: WALL },
    // central spur, so the two back rooms are separate
    { center: { x: 0, y: 1.6, z: -8 }, size: { x: 0.4, y: 3.2, z: 9 }, color: WALL },

    // --- cover, and things to break sightlines ---
    { center: { x: -4.5, y: 0.45, z: 8 }, size: { x: 1.4, y: 0.9, z: 1.4 }, color: CRATE },
    { center: { x: 4.2, y: 0.6, z: 7.2 }, size: { x: 1.2, y: 1.2, z: 1.2 }, color: CRATE },
    { center: { x: -3.2, y: 0.5, z: 0 }, size: { x: 1, y: 1, z: 2.4 }, color: CRATE },
    { center: { x: 3.4, y: 0.75, z: -1.5 }, size: { x: 1.6, y: 1.5, z: 1 }, color: CRATE },
    { center: { x: -5.5, y: 0.55, z: -9 }, size: { x: 1.2, y: 1.1, z: 1.2 }, color: CRATE },
    { center: { x: 5.2, y: 0.4, z: -10.5 }, size: { x: 1.8, y: 0.8, z: 1.2 }, color: CRATE },
  ]),

  interactables: INTERACTABLES,

  /** The stalker's route: the corridor and both back rooms. */
  patrol: Object.freeze([
    { x: -5, y: 0, z: 0 },
    { x: 5, y: 0, z: 0 },
    { x: 5, y: 0, z: -9 },
    { x: -5, y: 0, z: -11 },
    { x: -5, y: 0, z: -2 },
  ]),

  lights: Object.freeze([
    // The one shadow caster, over the hall where the player starts.
    {
      position: { x: 0, y: 2.8, z: 8 },
      color: 0xffd9a0,
      intensity: 16,
      distance: 14,
      castShadow: true,
    },
    // A failing fixture in the corridor: enough to navigate by, not enough to feel safe.
    { position: { x: 0, y: 2.7, z: 0 }, color: 0xcfa87a, intensity: 5, distance: 10 },
    // Cold light at the back, so the darkness has somewhere to lead.
    { position: { x: -5, y: 2.6, z: -9 }, color: 0x5a7a9a, intensity: 6, distance: 9 },
    { position: { x: 5, y: 2.6, z: -9 }, color: 0x4a6a8a, intensity: 4, distance: 8 },
  ]),

  ambient: { color: 0x181c24, intensity: 0.22 },
});
