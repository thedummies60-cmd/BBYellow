/**
 * The flashlight (src/render/CLAUDE.md).
 *
 * A spotlight parented to the camera, so it always points where you look. It does not
 * cast shadows: that would be a third caster, over the budget of two, and the cost is
 * invisible next to what it buys.
 */
import { Object3D, SpotLight } from 'three';
import type { PerspectiveCamera } from 'three';

export interface Flashlight {
  readonly root: Object3D;
  /** @param level 0-1 battery. Flicker is applied by the caller via `setOn`. */
  set(on: boolean, level: number): void;
  dispose(): void;
}

export function createFlashlight(
  camera: PerspectiveCamera,
  coneAngle: number,
  intensity: number,
  range: number,
): Flashlight {
  const light = new SpotLight(0xf6f0e2, 0, range, coneAngle, 0.45, 1.2);
  // Parented to the camera so it needs no per-frame position update, and a target one
  // metre ahead so the cone points down the view axis.
  light.position.set(0, 0, 0);
  light.target.position.set(0, 0, -1);
  camera.add(light);
  camera.add(light.target);

  return {
    root: light,

    set(on: boolean, level: number): void {
      // Dims as the battery goes, so the player feels it running out before it dies.
      light.intensity = on ? intensity * (0.35 + 0.65 * level) : 0;
    },

    dispose(): void {
      light.removeFromParent();
      light.target.removeFromParent();
      light.dispose();
    },
  };
}
