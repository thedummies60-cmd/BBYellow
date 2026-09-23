import { describe, expect, it } from 'vitest';
import { MOVEMENT, validateNumbers } from '@game';

describe('MOVEMENT config', () => {
  it('is frozen, so a system cannot mutate shared balance data', () => {
    expect(Object.isFrozen(MOVEMENT)).toBe(true);
  });

  it('keeps sprint faster than walk, and walk faster than crouch', () => {
    expect(MOVEMENT.sprintSpeed).toBeGreaterThan(MOVEMENT.walkSpeed);
    expect(MOVEMENT.walkSpeed).toBeGreaterThan(MOVEMENT.crouchSpeed);
  });

  it('keeps the eye below the top of the collider', () => {
    // An eye above the player's own height sees through ceilings.
    expect(MOVEMENT.eyeHeight).toBeLessThan(MOVEMENT.playerHeight);
    expect(MOVEMENT.crouchEyeHeight).toBeLessThan(MOVEMENT.eyeHeight);
  });

  it('clamps pitch below the vertical', () => {
    expect(MOVEMENT.maxPitch).toBeLessThan(Math.PI / 2);
  });
});

describe('validateNumbers', () => {
  it('passes a well-formed config', () => {
    const config = { speed: 3, drag: 0 };
    expect(validateNumbers('t', config, { speed: 'positive', drag: 'nonNegative' })).toBe(
      config,
    );
  });

  it('names the offending field', () => {
    expect(() => validateNumbers('MOVEMENT', { gravity: -1 }, { gravity: 'positive' })).toThrow(
      /MOVEMENT\.gravity/,
    );
  });

  it('rejects NaN, which would otherwise poison every later calculation', () => {
    expect(() => validateNumbers('t', { gravity: NaN }, { gravity: 'positive' })).toThrow(
      /finite/,
    );
  });

  it('rejects Infinity', () => {
    expect(() => validateNumbers('t', { x: Infinity }, { x: 'finite' })).toThrow(/finite/);
  });

  it('rejects a non-number', () => {
    expect(() => validateNumbers('t', { x: '3' }, { x: 'finite' })).toThrow(/expected a number/);
  });

  it('rejects zero where a positive value is required', () => {
    expect(() => validateNumbers('t', { x: 0 }, { x: 'positive' })).toThrow(/positive/);
  });

  it('allows zero where non-negative is enough', () => {
    expect(() => validateNumbers('t', { x: 0 }, { x: 'nonNegative' })).not.toThrow();
  });

  it('catches a rule left behind by a renamed field', () => {
    // With a statically typed config, TypeScript rejects a stale rule outright. This
    // guard is for rules applied to config that is not statically known — anything
    // parsed at runtime — where a rename otherwise drops that field's validation
    // silently.
    const staleRules: Readonly<Record<string, 'positive'>> = { oldName: 'positive' };
    expect(() => validateNumbers('t', { newName: 1 }, staleRules)).toThrow(
      /missing from the config/,
    );
  });
});
