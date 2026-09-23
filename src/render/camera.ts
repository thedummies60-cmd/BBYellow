/**
 * First-person camera rig (src/render/CLAUDE.md).
 *
 * Takes plain numbers, not game types: `render/` sits below `game/` and may not import
 * it (CLAUDE.md §2). `app/` interpolates the player's transform and hands the result here.
 */
import type { PerspectiveCamera } from 'three';

/**
 * Places the camera from an interpolated player pose.
 *
 * Yaw 0 faces -Z. Euler order matters: YXZ applies yaw before pitch, so looking up near
 * the vertical does not roll the horizon — XYZ order gimbals here and the world tilts.
 *
 * Allocation-free: writes into the camera's existing position and rotation.
 */
export function applyCameraPose(
  camera: PerspectiveCamera,
  x: number,
  feetY: number,
  z: number,
  yaw: number,
  pitch: number,
  eyeHeight: number,
): void {
  camera.position.set(x, feetY + eyeHeight, z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
  camera.rotation.z = 0;
}
