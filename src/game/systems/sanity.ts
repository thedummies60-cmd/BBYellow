/**
 * Composure, drained by darkness and by being hunted (src/game/CLAUDE.md).
 *
 * Takes "am I lit" as a number rather than reading any light: `game/` does not know what
 * a light is. `app/` computes proximity to the level's light positions and the
 * flashlight, and hands the result in.
 */
import { clamp } from '@core';
import type { Sanity } from '../components/sanity.js';
import type { SanityConfig } from '../config/threat.js';

export interface SanityInput {
  /** 0 = pitch dark, 1 = fully lit. */
  readonly light: number;
  /** True while the stalker is hunting. */
  readonly hunted: boolean;
}

export function updateSanity(
  sanity: Sanity,
  input: SanityInput,
  config: SanityConfig,
  dt: number,
): void {
  sanity.previousValue = sanity.value;

  // Light and dark both act every step, weighted by how lit you are: standing at the
  // edge of a lamp's reach should feel like holding steady, not like winning.
  const rate =
    input.light * config.recoverInLight -
    (1 - input.light) * config.drainInDarkness -
    (input.hunted ? config.drainWhileHunted : 0);

  sanity.value = clamp(sanity.value + rate * dt, 0, 100);
}

/**
 * How lit a point is, from the level's lights and the flashlight.
 *
 * Simple inverse-distance falloff, taking the brightest contributor rather than summing:
 * standing between two dim lamps should not feel like standing under a floodlight.
 */
export function lightAt(
  x: number,
  z: number,
  lights: readonly { position: { x: number; y: number; z: number }; distance: number }[],
  litRadius: number,
  flashlightOn: boolean,
): number {
  let best = flashlightOn ? 0.75 : 0;
  for (let i = 0; i < lights.length; i++) {
    const light = lights[i];
    if (light === undefined) continue;
    const distance = Math.hypot(x - light.position.x, z - light.position.z);
    const reach = Math.min(light.distance, litRadius * 2);
    if (distance >= reach) continue;
    const contribution = 1 - distance / reach;
    if (contribution > best) best = contribution;
  }
  return clamp(best, 0, 1);
}
