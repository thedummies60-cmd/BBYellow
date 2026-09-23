/**
 * A hand-built room for bringing the pipeline up.
 *
 * Temporary scaffolding: it exists to prove the renderer, the light budget and the
 * disposal path before there are any real assets. Real levels come from
 * `game/scenes/` through `render/assets.ts`. Delete this once they do.
 *
 * Deliberately within the shadow-caster budget of 2 (src/render/CLAUDE.md).
 */
import {
  AmbientLight,
  BoxGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PointLight,
} from 'three';

export interface DebugRoom {
  readonly root: Object3D;
  /** The prop whose rotation the simulation drives, for verifying interpolation. */
  readonly spinner: Object3D;
  dispose(): void;
}

const ROOM = Object.freeze({ width: 10, height: 3.2, depth: 12 });

export function createDebugRoom(): DebugRoom {
  const root = new Group();
  const disposers: (() => void)[] = [];

  /** Every geometry and material created here is registered for teardown (CLAUDE.md §4). */
  const track = (mesh: Mesh): Mesh => {
    disposers.push(() => {
      mesh.geometry.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) for (const m of material) m.dispose();
      else material.dispose();
    });
    return mesh;
  };

  const shell = new MeshStandardMaterial({
    color: 0x2a2724,
    roughness: 0.95,
    metalness: 0,
    side: DoubleSide, // seen from inside
  });

  const room = track(
    new Mesh(new BoxGeometry(ROOM.width, ROOM.height, ROOM.depth), shell),
  );
  room.position.y = ROOM.height / 2;
  room.receiveShadow = true;
  root.add(room);

  const spinner = track(
    new Mesh(
      new BoxGeometry(0.8, 0.8, 0.8),
      new MeshStandardMaterial({ color: 0xb7a98b, roughness: 0.6 }),
    ),
  );
  spinner.position.set(0, 1.1, -3);
  spinner.castShadow = true;
  root.add(spinner);

  // One shadow caster, well inside the budget of two.
  const lamp = new PointLight(0xffd9a0, 12, 14, 2);
  lamp.position.set(0, 2.6, -1.5);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(512, 512);
  root.add(lamp);
  disposers.push(() => {
    lamp.shadow.dispose();
    lamp.dispose();
  });

  // Just enough fill to keep the corners from reading as pure black.
  const ambient = new AmbientLight(0x404048, 0.35);
  root.add(ambient);
  disposers.push(() => ambient.dispose());

  return {
    root,
    spinner,
    dispose(): void {
      root.removeFromParent();
      root.clear();
      for (const dispose of disposers) dispose();
      disposers.length = 0;
    },
  };
}
