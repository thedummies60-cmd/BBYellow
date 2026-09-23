/**
 * Builds a scene from level data (src/render/CLAUDE.md).
 *
 * Reads `LevelData` from `shared/`, so the geometry you see is generated from the same
 * description the collision code walks into — a wall that is drawn is a wall that stops
 * you, by construction rather than by diligence.
 *
 * Every geometry, material and shadow map created here is registered for disposal
 * (CLAUDE.md §4).
 */
import {
  AmbientLight,
  BackSide,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PointLight,
} from 'three';
import type { LevelData } from '@shared/level.js';

export interface LevelView {
  readonly root: Object3D;
  dispose(): void;
}

/** More than this and the lighting needs rethinking, not a bigger budget. */
const MAX_SHADOW_CASTERS = 2;

export function createLevelView(level: LevelData): LevelView {
  const root = new Group();
  root.name = `level:${level.name}`;
  const disposers: (() => void)[] = [];

  const shellMaterial = new MeshStandardMaterial({
    color: 0x2a2724,
    roughness: 0.96,
    metalness: 0,
    side: BackSide, // we are inside the box
  });
  disposers.push(() => shellMaterial.dispose());

  const shellGeometry = new BoxGeometry(level.room.width, level.room.height, level.room.depth);
  disposers.push(() => shellGeometry.dispose());

  const shell = new Mesh(shellGeometry, shellMaterial);
  shell.position.y = level.room.height / 2;
  shell.receiveShadow = true;
  root.add(shell);

  for (const box of level.boxes) {
    const geometry = new BoxGeometry(box.size.x, box.size.y, box.size.z);
    const material = new MeshStandardMaterial({
      color: box.color ?? 0x8c8378,
      roughness: 0.8,
      metalness: 0,
    });
    disposers.push(() => {
      geometry.dispose();
      material.dispose();
    });

    const mesh = new Mesh(geometry, material);
    mesh.position.set(box.center.x, box.center.y, box.center.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }

  let casters = 0;
  for (const spec of level.lights) {
    const light = new PointLight(spec.color, spec.intensity, spec.distance, 2);
    light.position.set(spec.position.x, spec.position.y, spec.position.z);

    if (spec.castShadow === true) {
      casters++;
      if (casters > MAX_SHADOW_CASTERS) {
        throw new Error(
          `level '${level.name}': ${casters} shadow casters exceeds the budget of ` +
            `${MAX_SHADOW_CASTERS} (src/render/CLAUDE.md)`,
        );
      }
      light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.bias = -0.002; // kills the acne on the flat floor
      disposers.push(() => light.shadow.dispose());
    }

    root.add(light);
    disposers.push(() => light.dispose());
  }

  const ambient = new AmbientLight(level.ambient.color, level.ambient.intensity);
  root.add(ambient);
  disposers.push(() => ambient.dispose());

  return {
    root,
    dispose(): void {
      root.removeFromParent();
      root.clear();
      for (const dispose of disposers) dispose();
      disposers.length = 0;
    },
  };
}
