/**
 * The audio cue table (CLAUDE.md §5).
 *
 * Every cue carries a subtitle, and `validateCues` rejects a table where one is missing.
 * `docs/horror-design-principles.md` promises that audio conveying information always
 * has a visual counterpart; this is where that promise is kept, at startup, rather than
 * being a line in a document nobody runs.
 *
 * An empty subtitle is allowed but must be written deliberately — it declares "this
 * sound carries no information", which is a design claim, not an oversight.
 */
import type { CueTable } from '@shared/audio-cue.js';

export const CUES: CueTable = Object.freeze({
  footstep: {
    sound: 'footstep',
    gain: 0.22,
    pitchVariance: 0.09,
    subtitle: '', // the player's own steps tell them nothing they do not already know
  },
  stalkerStep: {
    sound: 'footstep',
    gain: 0.5,
    pitchVariance: 0.07,
    maxDistance: 22,
    subtitle: '[footsteps, somewhere close]',
  },
  roomTone: {
    sound: 'roomTone',
    gain: 0.3,
    loop: true,
    subtitle: '',
  },
  doorOpen: {
    sound: 'door',
    gain: 0.6,
    pitchVariance: 0.05,
    maxDistance: 20,
    subtitle: '[a door drags open]',
  },
  doorLocked: {
    sound: 'click',
    gain: 0.5,
    subtitle: '[locked]',
  },
  pickup: {
    sound: 'pickup',
    gain: 0.45,
    subtitle: '[you pick something up]',
  },
  stinger: {
    sound: 'stinger',
    gain: 0.75,
    subtitle: '[something lunges]',
  },
  heartbeat: {
    sound: 'heartbeat',
    gain: 0.5,
    loop: true,
    subtitle: '[your heartbeat, loud]',
  },
  breath: {
    sound: 'breath',
    gain: 0.55,
    loop: true,
    maxDistance: 16,
    subtitle: '[ragged breathing, not yours]',
  },
  batteryDead: {
    sound: 'click',
    gain: 0.4,
    subtitle: '[the flashlight dies]',
  },
});

/**
 * Fails the build's startup rather than shipping a cue nobody can read.
 *
 * Checks the shape too: a gain outside 0-1 is a mixing bug that surfaces as clipping or
 * silence, both of which are easy to miss and hard to trace.
 */
export function validateCues(table: CueTable, name = 'CUES'): CueTable {
  for (const [id, cue] of Object.entries(table)) {
    if (typeof cue.subtitle !== 'string') {
      throw new Error(
        `${name}.${id}: every cue needs a subtitle — use '' to declare it carries no ` +
          'information (docs/horror-design-principles.md)',
      );
    }
    if (!Number.isFinite(cue.gain) || cue.gain < 0 || cue.gain > 1) {
      throw new Error(`${name}.${id}: gain must be between 0 and 1, got ${String(cue.gain)}`);
    }
    if (cue.maxDistance !== undefined && cue.maxDistance <= 0) {
      throw new Error(`${name}.${id}: maxDistance must be positive, got ${cue.maxDistance}`);
    }
  }
  return table;
}
