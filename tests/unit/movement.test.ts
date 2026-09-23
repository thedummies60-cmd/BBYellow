/**
 * The whole first-person controller, tested without a browser.
 *
 * This is the layering rule paying off: movement, look and collision are decided by
 * plain numbers, so every feel-critical behaviour is assertable.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createWorld, defineComponent, vec3 } from '@core';
import type { Entity, World } from '@core';
import {
  collidersFromLevel,
  createMovementSystem,
  DEBUG_LEVEL,
  MOVEMENT,
} from '@game';
import type { Aabb, Player, Transform, Velocity } from '@game';
import { IDLE_INPUT } from '@shared/input.js';
import type { InputSnapshot } from '@shared/input.js';

const Transform = defineComponent<Transform>('Transform');
const Velocity = defineComponent<Velocity>('Velocity');
const Player = defineComponent<Player>('Player');

const STEP = 1 / 60;
const FLOOR: Aabb = { minX: -50, maxX: 50, minY: -1, maxY: 0, minZ: -50, maxZ: 50 };

const input = (overrides: Partial<InputSnapshot> = {}): InputSnapshot => ({
  ...IDLE_INPUT,
  ...overrides,
});

interface Harness {
  world: World;
  player: Entity;
  update: (dt: number, snapshot: InputSnapshot) => void;
  transform: () => Transform;
  state: () => Player;
  velocity: () => Velocity;
  run: (steps: number, snapshot?: InputSnapshot) => void;
}

function harness(colliders: readonly Aabb[] = [FLOOR], yaw = 0): Harness {
  const world = createWorld();
  const player = world.create();
  world.add(player, Transform, {
    position: vec3(0, 0, 0),
    previousPosition: vec3(0, 0, 0),
    yaw,
    previousYaw: yaw,
    pitch: 0,
    previousPitch: 0,
  });
  world.add(player, Velocity, { linear: vec3() });
  world.add(player, Player, {
    grounded: true,
    crouching: false,
    eyeHeight: MOVEMENT.eyeHeight,
    previousEyeHeight: MOVEMENT.eyeHeight,
  });

  const update = createMovementSystem(
    world,
    { Transform, Velocity, Player },
    MOVEMENT,
    colliders,
  );

  const get = <T>(type: Parameters<typeof world.get<T>>[1]): T => {
    const value = world.get(player, type);
    if (value === undefined) throw new Error('component missing');
    return value;
  };

  return {
    world,
    player,
    update,
    transform: () => get<Transform>(Transform),
    state: () => get<Player>(Player),
    velocity: () => get<Velocity>(Velocity),
    run(steps, snapshot = IDLE_INPUT) {
      for (let i = 0; i < steps; i++) update(STEP, snapshot);
    },
  };
}

describe('movement system', () => {
  let h: Harness;
  beforeEach(() => {
    h = harness();
  });

  describe('walking', () => {
    it('moves forward along -Z at yaw 0', () => {
      h.run(60, input({ forward: 1 }));
      expect(h.transform().position.z).toBeLessThan(-1);
      expect(h.transform().position.x).toBeCloseTo(0, 6);
    });

    it('moves backward along +Z', () => {
      h.run(30, input({ forward: -1 }));
      expect(h.transform().position.z).toBeGreaterThan(0);
    });

    it('strafes right along +X', () => {
      h.run(30, input({ strafe: 1 }));
      expect(h.transform().position.x).toBeGreaterThan(0);
      expect(h.transform().position.z).toBeCloseTo(0, 6);
    });

    it('moves in the direction it is facing', () => {
      const turned = harness([FLOOR], Math.PI / 2); // yaw 90 degrees faces -X
      turned.run(60, input({ forward: 1 }));
      expect(turned.transform().position.x).toBeLessThan(-1);
      expect(turned.transform().position.z).toBeCloseTo(0, 4);
    });

    it('approaches but does not exceed walk speed', () => {
      h.run(240, input({ forward: 1 }));
      const { linear } = h.velocity();
      const speed = Math.hypot(linear.x, linear.z);
      expect(speed).toBeGreaterThan(MOVEMENT.walkSpeed * 0.98);
      expect(speed).toBeLessThanOrEqual(MOVEMENT.walkSpeed + 1e-9);
    });

    it('does not let diagonals outrun the cardinals', () => {
      // The classic bug: forward+strafe giving sqrt(2) times the intended speed.
      const straight = harness();
      straight.run(240, input({ forward: 1 }));
      const straightSpeed = Math.hypot(
        straight.velocity().linear.x,
        straight.velocity().linear.z,
      );

      const diagonal = harness();
      diagonal.run(240, input({ forward: 1, strafe: 1 }));
      const diagonalSpeed = Math.hypot(
        diagonal.velocity().linear.x,
        diagonal.velocity().linear.z,
      );

      expect(diagonalSpeed).toBeCloseTo(straightSpeed, 6);
    });

    it('sprints faster than it walks', () => {
      const walking = harness();
      walking.run(120, input({ forward: 1 }));
      const sprinting = harness();
      sprinting.run(120, input({ forward: 1, sprint: true }));
      expect(Math.abs(sprinting.transform().position.z)).toBeGreaterThan(
        Math.abs(walking.transform().position.z),
      );
    });

    it('crouches slower than it walks', () => {
      const walking = harness();
      walking.run(120, input({ forward: 1 }));
      const crouched = harness();
      crouched.run(120, input({ forward: 1, crouch: true }));
      expect(Math.abs(crouched.transform().position.z)).toBeLessThan(
        Math.abs(walking.transform().position.z),
      );
    });

    it('comes to rest when input stops', () => {
      h.run(60, input({ forward: 1 }));
      h.run(120);
      const { linear } = h.velocity();
      expect(Math.hypot(linear.x, linear.z)).toBeLessThan(0.01);
    });

    it('is frame-rate independent over the same simulated time', () => {
      const a = harness();
      for (let i = 0; i < 120; i++) a.update(1 / 120, input({ forward: 1 }));
      const b = harness();
      for (let i = 0; i < 60; i++) b.update(1 / 60, input({ forward: 1 }));
      // Different integration counts, so not identical — but within a few centimetres.
      expect(a.transform().position.z).toBeCloseTo(b.transform().position.z, 1);
    });
  });

  describe('look', () => {
    it('accumulates yaw', () => {
      h.run(1, input({ lookYaw: 0.5 }));
      expect(h.transform().yaw).toBeCloseTo(0.5, 10);
    });

    it('clamps pitch below the vertical', () => {
      // Past ±90° the camera gimbals and the horizon rolls.
      h.run(20, input({ lookPitch: 1 }));
      expect(h.transform().pitch).toBeLessThanOrEqual(MOVEMENT.maxPitch);

      const down = harness();
      down.run(20, input({ lookPitch: -1 }));
      expect(down.transform().pitch).toBeGreaterThanOrEqual(-MOVEMENT.maxPitch);
    });

    it('does not clamp yaw — you can keep turning', () => {
      h.run(100, input({ lookYaw: 0.1 }));
      expect(Math.abs(h.transform().yaw)).toBeGreaterThan(Math.PI * 2);
    });
  });

  describe('gravity and jumping', () => {
    it('falls when unsupported', () => {
      const air = harness([]);
      air.run(30);
      expect(air.transform().position.y).toBeLessThan(0);
      expect(air.state().grounded).toBe(false);
    });

    it('rests on the floor without sinking', () => {
      h.run(120);
      expect(h.transform().position.y).toBe(0);
      expect(h.state().grounded).toBe(true);
    });

    it('jumps and lands', () => {
      h.run(1); // settle onto the floor
      h.run(1, input({ jump: true }));
      expect(h.transform().position.y).toBeGreaterThan(0);

      h.run(120);
      expect(h.transform().position.y).toBe(0);
      expect(h.state().grounded).toBe(true);
    });

    it('cannot jump in mid-air', () => {
      const air = harness([]);
      air.run(10);
      const before = air.velocity().linear.y;
      air.run(1, input({ jump: true }));
      expect(air.velocity().linear.y).toBeLessThan(before);
    });

    it('caps fall speed', () => {
      const air = harness([]);
      air.run(600);
      expect(air.velocity().linear.y).toBe(-MOVEMENT.maxFallSpeed);
    });

    it('gives weaker control in the air than on the ground', () => {
      const ground = harness();
      ground.run(6, input({ forward: 1 }));

      const air = harness([]);
      air.run(6, input({ forward: 1 }));

      expect(Math.abs(air.velocity().linear.z)).toBeLessThan(
        Math.abs(ground.velocity().linear.z),
      );
    });
  });

  describe('collision', () => {
    const colliders = collidersFromLevel(DEBUG_LEVEL);

    it('cannot walk out of the room', () => {
      const room = harness(colliders);
      room.run(600, input({ forward: 1 }));
      const half = DEBUG_LEVEL.room.depth / 2;
      expect(room.transform().position.z).toBeGreaterThan(-half);
    });

    it('kills velocity into a wall so it does not spring away', () => {
      const room = harness(colliders);
      room.run(600, input({ forward: 1 }));
      expect(Math.abs(room.velocity().linear.z)).toBeLessThan(0.01);
    });

    it('stays inside the room from any heading', () => {
      const half = { x: DEBUG_LEVEL.room.width / 2, z: DEBUG_LEVEL.room.depth / 2 };
      for (let i = 0; i < 8; i++) {
        const room = harness(colliders, (i * Math.PI) / 4);
        room.run(400, input({ forward: 1, sprint: true }));
        const p = room.transform().position;
        expect(Math.abs(p.x)).toBeLessThan(half.x);
        expect(Math.abs(p.z)).toBeLessThan(half.z);
        expect(p.y).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('interpolation state', () => {
    it('records the previous step before moving', () => {
      h.run(30, input({ forward: 1 }));
      const t = h.transform();
      expect(t.previousPosition.z).not.toBe(t.position.z);
      // Exactly one step behind.
      const gap = Math.abs(t.position.z - t.previousPosition.z);
      expect(gap).toBeLessThan(MOVEMENT.walkSpeed * STEP + 1e-9);
    });

    it('records previous yaw and eye height too', () => {
      h.run(4, input({ lookYaw: 0.1, crouch: true }));
      const t = h.transform();
      expect(t.previousYaw).not.toBe(t.yaw);
      expect(h.state().previousEyeHeight).not.toBe(h.state().eyeHeight);
    });

    it('smooths the eye height into a crouch rather than snapping', () => {
      h.run(1, input({ crouch: true }));
      const afterOneStep = h.state().eyeHeight;
      expect(afterOneStep).toBeLessThan(MOVEMENT.eyeHeight);
      expect(afterOneStep).toBeGreaterThan(MOVEMENT.crouchEyeHeight);

      h.run(120, input({ crouch: true }));
      expect(h.state().eyeHeight).toBeCloseTo(MOVEMENT.crouchEyeHeight, 2);
    });

    it('stands back up when the crouch is released', () => {
      h.run(60, input({ crouch: true }));
      h.run(120);
      expect(h.state().eyeHeight).toBeCloseTo(MOVEMENT.eyeHeight, 2);
    });
  });

  it('does nothing without input', () => {
    h.run(60);
    const p = h.transform().position;
    expect(p.x).toBe(0);
    expect(p.z).toBe(0);
  });
});
