import { describe, expect, it } from 'vitest';
import { vec3 } from '@core';
import {
  aabbFromBox,
  collidersFromLevel,
  createMoveResult,
  DEBUG_LEVEL,
  moveAndCollide,
  overlaps,
} from '@game';
import type { Aabb } from '@game';

const RADIUS = 0.32;
const HEIGHT = 1.8;

const box = (minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): Aabb => ({
  minX,
  minY,
  minZ,
  maxX,
  maxY,
  maxZ,
});

/** A floor at y=0 and a wall at x=2. */
const FLOOR = box(-50, -1, -50, 50, 0, 50);
const WALL = box(2, 0, -50, 3, 3, 50);

describe('overlaps', () => {
  it('detects intersection', () => {
    expect(overlaps(box(0, 0, 0, 1, 1, 1), box(0.5, 0.5, 0.5, 2, 2, 2))).toBe(true);
  });

  it('treats touching faces as separate', () => {
    // Otherwise a player resting exactly on the floor is permanently "colliding".
    expect(overlaps(box(0, 0, 0, 1, 1, 1), box(1, 0, 0, 2, 1, 1))).toBe(false);
  });

  it('requires overlap on every axis', () => {
    expect(overlaps(box(0, 0, 0, 1, 1, 1), box(0.5, 5, 0.5, 2, 6, 2))).toBe(false);
  });
});

describe('aabbFromBox', () => {
  it('builds a box around a centre', () => {
    expect(aabbFromBox({ x: 0, y: 1, z: 0 }, { x: 2, y: 2, z: 4 })).toEqual({
      minX: -1,
      maxX: 1,
      minY: 0,
      maxY: 2,
      minZ: -2,
      maxZ: 2,
    });
  });
});

describe('moveAndCollide', () => {
  const result = createMoveResult();

  it('moves freely through empty space', () => {
    const position = vec3(0, 1, 0);
    moveAndCollide(position, RADIUS, HEIGHT, vec3(0.5, 0, 0.25), [], result);
    expect(position.x).toBeCloseTo(0.5, 10);
    expect(position.z).toBeCloseTo(0.25, 10);
  });

  it('lands on the floor and reports grounded', () => {
    const position = vec3(0, 2, 0);
    moveAndCollide(position, RADIUS, HEIGHT, vec3(0, -3, 0), [FLOOR], result);
    expect(position.y).toBe(0);
    expect(result.grounded).toBe(true);
    expect(result.hitY).toBe(true);
  });

  it('does not report grounded while falling in mid-air', () => {
    const position = vec3(0, 5, 0);
    moveAndCollide(position, RADIUS, HEIGHT, vec3(0, -0.1, 0), [FLOOR], result);
    expect(result.grounded).toBe(false);
  });

  it('stops at a wall instead of passing through it', () => {
    const position = vec3(0, 0, 0);
    moveAndCollide(position, RADIUS, HEIGHT, vec3(5, 0, 0), [WALL], result);
    expect(position.x).toBeCloseTo(2 - RADIUS, 10);
    expect(result.hitX).toBe(true);
  });

  it('stops at a wall approached from the far side', () => {
    const position = vec3(6, 0, 0);
    moveAndCollide(position, RADIUS, HEIGHT, vec3(-5, 0, 0), [WALL], result);
    expect(position.x).toBeCloseTo(3 + RADIUS, 10);
  });

  it('slides along a wall rather than stopping dead', () => {
    // The reason resolution is per-axis: the blocked axis is cancelled, the rest apply.
    const position = vec3(0, 0, 0);
    moveAndCollide(position, RADIUS, HEIGHT, vec3(5, 0, 1), [WALL], result);
    expect(position.x).toBeCloseTo(2 - RADIUS, 10);
    expect(position.z).toBeCloseTo(1, 10); // still moved along the wall
    expect(result.hitZ).toBe(false);
  });

  it('bumps the ceiling without passing through', () => {
    const ceiling = box(-50, 3, -50, 50, 4, 50);
    const position = vec3(0, 0, 0);
    moveAndCollide(position, RADIUS, HEIGHT, vec3(0, 5, 0), [ceiling], result);
    expect(position.y).toBeCloseTo(3 - HEIGHT, 10);
    expect(result.hitY).toBe(true);
    expect(result.grounded).toBe(false);
  });

  it('steps onto a crate top when landing on it', () => {
    const crate = box(-1, 0, -1, 1, 0.8, 1);
    const position = vec3(0, 2, 0);
    moveAndCollide(position, RADIUS, HEIGHT, vec3(0, -2, 0), [crate, FLOOR], result);
    expect(position.y).toBeCloseTo(0.8, 10);
    expect(result.grounded).toBe(true);
  });

  it('resolves a corner where two walls meet', () => {
    const wallX = box(1, 0, -50, 2, 3, 50);
    const wallZ = box(-50, 0, 1, 50, 3, 2);
    const position = vec3(0, 0, 0);
    moveAndCollide(position, RADIUS, HEIGHT, vec3(3, 0, 3), [wallX, wallZ], result);
    expect(position.x).toBeCloseTo(1 - RADIUS, 10);
    expect(position.z).toBeCloseTo(1 - RADIUS, 10);
  });

  it('is not defeated by a fast move across a thick slab', () => {
    // Walls are slabs, not planes, precisely so one large step still overlaps them.
    const position = vec3(0, 0, 0);
    moveAndCollide(position, RADIUS, HEIGHT, vec3(2.5, 0, 0), [WALL], result);
    expect(position.x).toBeLessThan(2);
  });

  it('leaves position untouched for a zero delta', () => {
    const position = vec3(1, 2, 3);
    moveAndCollide(position, RADIUS, HEIGHT, vec3(0, 0, 0), [WALL, FLOOR], result);
    expect(position).toEqual({ x: 1, y: 2, z: 3 });
  });
});

describe('collidersFromLevel', () => {
  const colliders = collidersFromLevel(DEBUG_LEVEL);
  const result = createMoveResult();

  it('produces a shell plus one box per obstacle', () => {
    expect(colliders).toHaveLength(6 + DEBUG_LEVEL.boxes.length);
  });

  it('keeps the player inside the room', () => {
    const halfWidth = DEBUG_LEVEL.room.width / 2;
    const position = vec3(0, 0, 0);
    moveAndCollide(position, RADIUS, HEIGHT, vec3(100, 0, 0), colliders, result);
    expect(position.x).toBeLessThan(halfWidth);
    expect(position.x).toBeCloseTo(halfWidth - RADIUS, 10);
  });

  it('keeps the player inside along -Z too', () => {
    const halfDepth = DEBUG_LEVEL.room.depth / 2;
    const position = vec3(4, 0, 0);
    moveAndCollide(position, RADIUS, HEIGHT, vec3(0, 0, -100), colliders, result);
    expect(position.z).toBeGreaterThan(-halfDepth);
  });

  it('spawns the player somewhere they are not already stuck', () => {
    const spawn = vec3(
      DEBUG_LEVEL.spawn.position.x,
      DEBUG_LEVEL.spawn.position.y,
      DEBUG_LEVEL.spawn.position.z,
    );
    const before = { ...spawn };
    moveAndCollide(spawn, RADIUS, HEIGHT, vec3(0, -0.01, 0), colliders, result);
    expect(spawn.x).toBe(before.x);
    expect(spawn.z).toBe(before.z);
    expect(spawn.y).toBe(0); // resting on the floor, not inside geometry
  });
});
