/**
 * The threat, tested headless.
 *
 * Every behaviour a player could call unfair is asserted here: that crouching hides you,
 * that walls block sight, that it gives up, that you can outrun it.
 */
import { describe, expect, it } from 'vitest';
import { vec3 } from '@core';
import { DEBUG_LEVEL, MOVEMENT, THREAT, collidersFromLevel, hasLineOfSight, updateStalker } from '@game';
import type { Aabb, Stalker } from '@game';

const STEP = 1 / 60;
const PATROL = [
  { x: -5, y: 0, z: 0 },
  { x: 5, y: 0, z: 0 },
];

function makeStalker(x = 0, z = 0, yaw = 0): Stalker {
  return {
    state: 'patrol',
    position: vec3(x, 0, z),
    previousPosition: vec3(x, 0, z),
    yaw,
    previousYaw: yaw,
    patrolIndex: 0,
    goal: vec3(x, 0, z),
    timer: 0,
    awareness: 0,
  };
}

/**
 * A patrol route along -Z, so a stalker walking it faces -Z.
 *
 * This matters: the stalker turns to face wherever it is heading, so sight tests must
 * put the player along the route. Standing them in front of a stalker that is about to
 * walk the other way tests nothing.
 */
const PATROL_Z = [
  { x: 0, y: 0, z: -10 },
  { x: 0, y: 0, z: 10 },
];

const deps = (colliders: readonly Aabb[] = [], patrol = PATROL) => ({
  config: THREAT,
  patrol,
  colliders,
});

const run = (
  stalker: Stalker,
  steps: number,
  player: { x: number; y: number; z: number },
  noiseRadius = 0,
  colliders: readonly Aabb[] = [],
  patrol = PATROL,
): string[] => {
  const events: string[] = [];
  for (let i = 0; i < steps; i++) {
    const event = updateStalker(
      stalker,
      { player: vec3(player.x, player.y, player.z), noiseRadius },
      deps(colliders, patrol),
      STEP,
    );
    if (event !== 'none') events.push(event);
    if (event === 'caught') break;
  }
  return events;
};

/** Facing -Z along the patrol route, with the player ahead of it. */
const seeing = (stalker: Stalker, steps: number, player: { x: number; y: number; z: number }) =>
  run(stalker, steps, player, 0, [], PATROL_Z);

describe('hasLineOfSight', () => {
  const wall: Aabb = { minX: -1, maxX: 1, minY: 0, maxY: 3, minZ: -0.2, maxZ: 0.2 };

  it('sees through empty space', () => {
    expect(hasLineOfSight(vec3(0, 1, -5), vec3(0, 1, 5), [])).toBe(true);
  });

  it('is blocked by a wall between the two points', () => {
    expect(hasLineOfSight(vec3(0, 1, -5), vec3(0, 1, 5), [wall])).toBe(false);
  });

  it('sees past the edge of a wall', () => {
    expect(hasLineOfSight(vec3(4, 1, -5), vec3(4, 1, 5), [wall])).toBe(true);
  });

  it('treats a zero-length ray as visible', () => {
    expect(hasLineOfSight(vec3(1, 1, 1), vec3(1, 1, 1), [wall])).toBe(true);
  });
});

describe('stalker', () => {
  describe('patrol', () => {
    it('walks toward its first patrol point', () => {
      const stalker = makeStalker(0, 0);
      stalker.patrolIndex = 0;
      run(stalker, 60, { x: 0, y: 0, z: 100 });
      expect(stalker.position.x).toBeLessThan(0); // heading to (-5, 0)
      expect(stalker.state).toBe('patrol');
    });

    it('advances to the next point on arrival', () => {
      const stalker = makeStalker(-5, 0);
      stalker.patrolIndex = 0;
      run(stalker, 5, { x: 0, y: 0, z: 100 });
      expect(stalker.patrolIndex).toBe(1);
    });

    it('ignores a distant player', () => {
      const stalker = makeStalker(0, 0);
      run(stalker, 120, { x: 0, y: 0, z: 200 });
      expect(stalker.state).toBe('patrol');
    });
  });

  describe('hearing', () => {
    it('investigates a noise it cannot see', () => {
      // Behind a wall: it hears, but has nothing to look at, so it stays investigating.
      const wall: Aabb = { minX: -4, maxX: 4, minY: 0, maxY: 3, minZ: 2.4, maxZ: 2.8 };
      const stalker = makeStalker(0, 0);
      const events = run(stalker, 30, { x: 0, y: 0, z: 5 }, THREAT.hearWalk, [wall]);
      expect(events).toContain('heard');
      expect(stalker.state).toBe('investigate');
    });

    it('hears, turns, and then sees — the noise gives you away', () => {
      // The emergent behaviour that makes sprinting a real decision.
      const stalker = makeStalker(0, 0);
      const events = run(stalker, 60, { x: 0, y: 0, z: 5 }, THREAT.hearWalk);
      expect(events).toContain('heard');
      expect(events).toContain('spotted');
      expect(stalker.state).toBe('hunt');
    });

    it('ignores a noise out of earshot', () => {
      const stalker = makeStalker(0, 0);
      run(stalker, 30, { x: 0, y: 0, z: 60 }, THREAT.hearWalk);
      expect(stalker.state).toBe('patrol');
    });

    it('cannot hear a crouching player', () => {
      // Crouching sets noiseRadius to 0 — the one reliable way past it. Placed behind
      // the stalker and behind a wall, so only hearing could give the player away.
      const wall: Aabb = { minX: -4, maxX: 4, minY: 0, maxY: 3, minZ: 1.4, maxZ: 1.8 };
      const stalker = makeStalker(0, 0);
      run(stalker, 60, { x: 0, y: 0, z: 3 }, 0, [wall]);
      expect(stalker.state).toBe('patrol');
    });

    it('hears a sprinting player from further away', () => {
      const wall: Aabb = { minX: -6, maxX: 6, minY: 0, maxY: 3, minZ: 5.4, maxZ: 5.8 };
      const walking = makeStalker(0, 0);
      run(walking, 20, { x: 0, y: 0, z: 11 }, THREAT.hearWalk, [wall]);
      expect(walking.state).toBe('patrol');

      const sprinting = makeStalker(0, 0);
      run(sprinting, 20, { x: 0, y: 0, z: 11 }, THREAT.hearSprint, [wall]);
      expect(sprinting.state).toBe('investigate');
    });

    it('returns to patrol when the trail goes cold', () => {
      const wall: Aabb = { minX: -4, maxX: 4, minY: 0, maxY: 3, minZ: 2.4, maxZ: 2.8 };
      const stalker = makeStalker(0, 0);
      run(stalker, 10, { x: 0, y: 0, z: 4 }, THREAT.hearWalk, [wall]);
      expect(stalker.state).toBe('investigate');

      const events = run(stalker, Math.ceil(THREAT.investigateDuration * 60) + 30, {
        x: 0,
        y: 0,
        z: 300,
      });
      expect(events).toContain('lost');
      expect(stalker.state).toBe('patrol');
    });
  });

  describe('sight', () => {
    it('hunts a player standing in front of it', () => {
      const stalker = makeStalker(0, 0, 0); // facing -Z, and patrolling that way
      const events = seeing(stalker, 60, { x: 0, y: 0, z: -6 });
      expect(events).toContain('spotted');
      expect(stalker.state).toBe('hunt');
    });

    it('does not see behind itself', () => {
      const stalker = makeStalker(0, 0, 0); // facing -Z
      run(stalker, 60, { x: 0, y: 0, z: 6 }); // player is behind
      expect(stalker.state).toBe('patrol');
    });

    it('does not see beyond its range', () => {
      const stalker = makeStalker(0, 0, 0);
      run(stalker, 60, { x: 0, y: 0, z: -(THREAT.sightRange + 5) });
      expect(stalker.state).toBe('patrol');
    });

    it('cannot see through a wall', () => {
      const wall: Aabb = { minX: -3, maxX: 3, minY: 0, maxY: 3, minZ: -3.2, maxZ: -2.8 };
      const stalker = makeStalker(0, 0, 0);
      run(stalker, 60, { x: 0, y: 0, z: -6 }, 0, [wall]);
      expect(stalker.state).toBe('patrol');
    });

    it('needs sustained sight, so a glimpse is not instant detection', () => {
      const stalker = makeStalker(0, 0, 0);
      const event = updateStalker(
        stalker,
        { player: vec3(0, 0, -6), noiseRadius: 0 },
        deps(),
        STEP,
      );
      expect(event).not.toBe('spotted');
      expect(stalker.state).toBe('patrol');
    });

    it('closes on the player while hunting', () => {
      const stalker = makeStalker(0, 0, 0);
      seeing(stalker, 60, { x: 0, y: 0, z: -10 });
      const distance = Math.abs(stalker.position.z - -10);
      expect(distance).toBeLessThan(10);
      expect(stalker.state).toBe('hunt');
    });

    it('searches the last known position after losing sight', () => {
      const stalker = makeStalker(0, 0, 0);
      seeing(stalker, 60, { x: 0, y: 0, z: -8 });
      expect(stalker.state).toBe('hunt');

      // Player vanishes far away and out of the cone.
      seeing(stalker, 30, { x: 0, y: 0, z: 400 });
      expect(stalker.state).toBe('search');
    });

    it('gives up eventually', () => {
      const stalker = makeStalker(0, 0, 0);
      seeing(stalker, 60, { x: 0, y: 0, z: -8 });
      const events = seeing(stalker, Math.ceil(THREAT.searchDuration * 60) + 120, {
        x: 0,
        y: 0,
        z: 400,
      });
      expect(events).toContain('lost');
      expect(stalker.state).toBe('patrol');
    });
  });

  describe('fairness', () => {
    it('is slower than a sprinting player, so a mistake is survivable', () => {
      expect(THREAT.huntSpeed).toBeLessThan(MOVEMENT.sprintSpeed);
    });

    it('catches a player who stands still next to it', () => {
      const stalker = makeStalker(0, 0, 0);
      const events = seeing(stalker, 600, { x: 0, y: 0, z: -3 });
      expect(events).toContain('caught');
    });

    it('never catches a player who keeps their distance', () => {
      // Out of sight range and silent: it never learns the player is there.
      const stalker = makeStalker(0, 0, 0);
      const events = run(stalker, 600, { x: 0, y: 0, z: -THREAT.sightRange - 6 });
      expect(events).not.toContain('caught');
    });
  });

  it('records its previous pose for interpolation', () => {
    const stalker = makeStalker(0, 0);
    stalker.patrolIndex = 0;
    run(stalker, 10, { x: 0, y: 0, z: 100 });
    expect(stalker.previousPosition.x).not.toBe(stalker.position.x);
  });

  it('is deterministic: the same run produces the same events', () => {
    const once = seeing(makeStalker(0, 0, 0), 200, { x: 0, y: 0, z: -8 });
    const twice = seeing(makeStalker(0, 0, 0), 200, { x: 0, y: 0, z: -8 });
    expect(once).toEqual(twice);
  });

  it('can patrol the shipped level without leaving it', () => {
    const colliders = collidersFromLevel(DEBUG_LEVEL);
    const start = DEBUG_LEVEL.patrol[0] ?? { x: 0, y: 0, z: 0 };
    const stalker = makeStalker(start.x, start.z);
    for (let i = 0; i < 3000; i++) {
      updateStalker(
        stalker,
        { player: vec3(0, 0, 500), noiseRadius: 0 },
        { config: THREAT, patrol: DEBUG_LEVEL.patrol, colliders },
        STEP,
      );
    }
    expect(Math.abs(stalker.position.x)).toBeLessThan(DEBUG_LEVEL.room.width / 2);
    expect(Math.abs(stalker.position.z)).toBeLessThan(DEBUG_LEVEL.room.depth / 2);
  });
});
