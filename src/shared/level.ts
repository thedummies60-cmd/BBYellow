/**
 * Level layout as plain data.
 *
 * The bridge between `game/` and `render/`, which may not import each other (ADR-0002):
 * `game/scenes/` authors this, `render/` builds meshes from it, `game/` derives
 * colliders from it, and the type itself lives here where both can see it.
 */

export interface Vec3Data {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** An axis-aligned box. Solid to the player and drawn as geometry. */
export interface BoxSpec {
  readonly center: Vec3Data;
  readonly size: Vec3Data;
  /** Hex color for the surface. */
  readonly color?: number;
}

export interface LightSpec {
  readonly position: Vec3Data;
  readonly color: number;
  readonly intensity: number;
  readonly distance: number;
  /**
   * Real-time shadows are capped at 2 per scene (src/render/CLAUDE.md). The cap is a
   * design constraint, not a graphics one — a third caster means the lighting needs
   * rethinking.
   */
  readonly castShadow?: boolean;
}

/** A thing the player can look at and use. */
export interface InteractableSpec {
  readonly id: string;
  readonly kind: 'door' | 'pickup' | 'exit';
  readonly position: Vec3Data;
  /** Prompt shown when the player is looking at it. */
  readonly label: string;
  /** For a door: the collider removed when it opens. */
  readonly blocks?: BoxSpec;
  /** For a door or exit: the pickup id required to open it. */
  readonly requires?: string;
  /** Shown instead of `label` when the requirement is missing. */
  readonly lockedLabel?: string;
}

export interface LevelData {
  readonly name: string;
  readonly spawn: {
    readonly position: Vec3Data;
    /** Radians. 0 faces -Z. */
    readonly yaw: number;
  };
  /** Interior dimensions of the enclosing room. Floor sits at y = 0. */
  readonly room: {
    readonly width: number;
    readonly height: number;
    readonly depth: number;
  };
  /** Obstacles inside the room. */
  readonly boxes: readonly BoxSpec[];
  readonly interactables: readonly InteractableSpec[];
  /** Where the threat starts and the points it walks between. */
  readonly patrol: readonly Vec3Data[];
  readonly lights: readonly LightSpec[];
  readonly ambient: {
    readonly color: number;
    readonly intensity: number;
  };
}
