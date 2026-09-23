/**
 * The threat's body (src/render/CLAUDE.md).
 *
 * Deliberately unlit and near-black: a shape you resolve slowly is worse than a monster
 * you can see, and it costs one draw call. Real art replaces the geometry without the
 * interface changing.
 */
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Object3D } from 'three';

export interface StalkerView {
  readonly root: Object3D;
  setPose(x: number, y: number, z: number, yaw: number): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

export function createStalkerView(): StalkerView {
  const root = new Group();
  const disposers: (() => void)[] = [];

  const body = (width: number, height: number, depth: number, y: number, color: number): void => {
    const geometry = new BoxGeometry(width, height, depth);
    // Basic, not standard: it must not pick up the player's flashlight and resolve into
    // something readable. It stays a silhouette at every range.
    const material = new MeshBasicMaterial({ color });
    disposers.push(() => {
      geometry.dispose();
      material.dispose();
    });
    const mesh = new Mesh(geometry, material);
    mesh.position.y = y;
    root.add(mesh);
  };

  body(0.5, 1.15, 0.32, 1.05, 0x07070a);
  body(0.26, 0.3, 0.26, 1.78, 0x0b0b0f);
  body(0.44, 0.75, 0.3, 0.37, 0x050508);

  return {
    root,

    setPose(x: number, y: number, z: number, yaw: number): void {
      root.position.set(x, y, z);
      root.rotation.y = yaw;
    },

    setVisible(visible: boolean): void {
      root.visible = visible;
    },

    dispose(): void {
      root.removeFromParent();
      root.clear();
      for (const dispose of disposers) dispose();
      disposers.length = 0;
    },
  };
}
