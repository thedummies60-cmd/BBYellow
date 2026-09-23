/**
 * First-person character controller (src/game/CLAUDE.md).
 *
 * Decides where the player *is*. Knows nothing about cameras, meshes or the browser —
 * it reads an `InputSnapshot` of plain numbers and writes a `Transform`, which is what
 * lets the whole controller be tested headless.
 */
import { clamp, vec3 } from '@core';
import type { Entity, Vec3, World } from '@core';
import type { InputSnapshot } from '@shared/input.js';
import type { MovementConfig } from '../config/index.js';
import type { Transform } from '../components/transform.js';
import type { Velocity } from '../components/velocity.js';
import type { Player } from '../components/player.js';
import { createMoveResult, moveAndCollide } from '../collision.js';
import type { Aabb } from '../collision.js';

export interface MovementComponents {
  readonly Transform: import('@core').ComponentType<Transform>;
  readonly Velocity: import('@core').ComponentType<Velocity>;
  readonly Player: import('@core').ComponentType<Player>;
}

/** Scratch, reused every step. Nothing here allocates per frame (CLAUDE.md §3). */
const desired: Vec3 = vec3();
const delta: Vec3 = vec3();
const result = createMoveResult();

export function createMovementSystem(
  world: World,
  components: MovementComponents,
  config: MovementConfig,
  colliders: readonly Aabb[],
) {
  const { Transform, Velocity, Player } = components;
  const query = world.query(Transform, Velocity, Player);

  return (dt: number, input: InputSnapshot): void => {
    const entities = query.entities;

    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i] as Entity;
      const transform = world.get(entity, Transform);
      const velocity = world.get(entity, Velocity);
      const player = world.get(entity, Player);
      if (transform === undefined || velocity === undefined || player === undefined) continue;

      // Snapshot the previous step before touching anything — this is what the renderer
      // interpolates from.
      transform.previousPosition.x = transform.position.x;
      transform.previousPosition.y = transform.position.y;
      transform.previousPosition.z = transform.position.z;
      transform.previousYaw = transform.yaw;
      transform.previousPitch = transform.pitch;
      player.previousEyeHeight = player.eyeHeight;

      // ---- look ----------------------------------------------------------------
      transform.yaw += input.lookYaw;
      transform.pitch = clamp(
        transform.pitch + input.lookPitch,
        -config.maxPitch,
        config.maxPitch,
      );

      // ---- desired horizontal velocity ------------------------------------------
      player.crouching = input.crouch;
      const speed = input.crouch
        ? config.crouchSpeed
        : input.sprint
          ? config.sprintSpeed
          : config.walkSpeed;

      // Yaw 0 faces -Z. Forward and right are the basis vectors for that heading.
      const sin = Math.sin(transform.yaw);
      const cos = Math.cos(transform.yaw);
      const forwardX = -sin;
      const forwardZ = -cos;
      const rightX = cos;
      const rightZ = -sin;

      desired.x = forwardX * input.forward + rightX * input.strafe;
      desired.z = forwardZ * input.forward + rightZ * input.strafe;

      // Normalize so diagonals are not faster than the cardinals.
      const magnitude = Math.hypot(desired.x, desired.z);
      if (magnitude > 1) {
        desired.x /= magnitude;
        desired.z /= magnitude;
      }
      desired.x *= speed;
      desired.z *= speed;

      // ---- accelerate ------------------------------------------------------------
      // Air control is deliberately weak: full authority mid-air makes a horror game
      // feel like a platformer, and removes the commitment that makes a chase tense.
      const acceleration =
        config.groundAcceleration * (player.grounded ? 1 : config.airControl);
      const blend = Math.min(1, acceleration * dt);
      velocity.linear.x += (desired.x - velocity.linear.x) * blend;
      velocity.linear.z += (desired.z - velocity.linear.z) * blend;

      // ---- vertical --------------------------------------------------------------
      if (input.jump && player.grounded) velocity.linear.y = config.jumpSpeed;
      velocity.linear.y = Math.max(
        velocity.linear.y - config.gravity * dt,
        -config.maxFallSpeed,
      );

      // ---- integrate and resolve --------------------------------------------------
      delta.x = velocity.linear.x * dt;
      delta.y = velocity.linear.y * dt;
      delta.z = velocity.linear.z * dt;

      moveAndCollide(
        transform.position,
        config.playerRadius,
        config.playerHeight,
        delta,
        colliders,
        result,
      );

      // A blocked axis must also kill its velocity, or the player keeps accelerating
      // into the wall and shoots off the moment they turn away from it.
      if (result.hitX) velocity.linear.x = 0;
      if (result.hitZ) velocity.linear.z = 0;
      if (result.hitY) velocity.linear.y = 0;
      player.grounded = result.grounded;

      // ---- crouch ---------------------------------------------------------------
      const targetEye = input.crouch ? config.crouchEyeHeight : config.eyeHeight;
      // Smoothed rather than snapped: an instant eye-height change reads as a glitch.
      player.eyeHeight += (targetEye - player.eyeHeight) * Math.min(1, 12 * dt);
    }
  };
}
