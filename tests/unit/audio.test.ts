/**
 * Waveform generation and the cue table, tested without an AudioContext.
 *
 * The synth renders into plain Float32Arrays precisely so this is possible — the
 * `AudioContext` only wraps the result.
 */
import { describe, expect, it } from 'vitest';
import { createRng } from '@core';
import {
  normalize,
  renderBreath,
  renderDoor,
  renderFootstep,
  renderHeartbeat,
  renderPickup,
  renderRoomTone,
  renderStinger,
} from '@audio';
import { CUES, validateCues } from '@game';
import type { CueTable } from '@shared/audio-cue.js';

const RATE = 44100;

const peak = (samples: Float32Array): number => {
  let max = 0;
  for (const sample of samples) max = Math.max(max, Math.abs(sample));
  return max;
};

const rms = (samples: Float32Array): number => {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
};

describe('synth', () => {
  const renderers = [
    ['footstep', () => renderFootstep(RATE, createRng(1))],
    ['roomTone', () => renderRoomTone(RATE, createRng(2))],
    ['door', () => renderDoor(RATE, createRng(3))],
    ['stinger', () => renderStinger(RATE, createRng(4))],
    ['heartbeat', () => renderHeartbeat(RATE)],
    ['pickup', () => renderPickup(RATE)],
    ['breath', () => renderBreath(RATE, createRng(5))],
  ] as const;

  for (const [name, render] of renderers) {
    describe(name, () => {
      const samples = render();

      it('produces audio, not silence', () => {
        expect(samples.length).toBeGreaterThan(100);
        expect(rms(samples)).toBeGreaterThan(0.001);
      });

      it('never clips', () => {
        // Above 1.0 the browser hard-clips and the sound distorts.
        expect(peak(samples)).toBeLessThanOrEqual(1);
      });

      it('contains no NaN', () => {
        // One NaN silences the whole voice, and the cause is invisible.
        // Counted in a loop, asserted once: an expect() per sample is ~200k calls.
        let bad = 0;
        for (const sample of samples) if (!Number.isFinite(sample)) bad++;
        expect(bad).toBe(0);
      });
    });
  }

  it('renders identically from the same seed', () => {
    expect(Array.from(renderFootstep(RATE, createRng(7)))).toEqual(
      Array.from(renderFootstep(RATE, createRng(7))),
    );
  });

  it('varies footsteps between draws, so they do not read as a machine', () => {
    const rng = createRng(11);
    const first = renderFootstep(RATE, rng);
    const second = renderFootstep(RATE, rng);
    expect(Array.from(first)).not.toEqual(Array.from(second));
  });

  it('fades looping buffers at both ends so the seam does not click', () => {
    const tone = renderRoomTone(RATE, createRng(3));
    expect(Math.abs(tone[0] as number)).toBeLessThan(0.02);
    expect(Math.abs(tone[tone.length - 1] as number)).toBeLessThan(0.02);
  });

  it('normalizes to the requested peak', () => {
    expect(peak(normalize(Float32Array.from([0.1, -0.2, 0.05]), 0.8))).toBeCloseTo(0.8, 6);
  });

  it('leaves a silent buffer alone rather than dividing by zero', () => {
    const silence = new Float32Array(16);
    expect(peak(normalize(silence))).toBe(0);
  });
});

describe('cue table', () => {
  it('validates as shipped', () => {
    expect(() => validateCues(CUES)).not.toThrow();
  });

  it('gives every cue a subtitle', () => {
    for (const [id, cue] of Object.entries(CUES)) {
      expect(typeof cue.subtitle, `${id} has no subtitle`).toBe('string');
    }
  });

  it('subtitles every cue that carries information', () => {
    // Cues a player must react to are useless without a readable equivalent.
    for (const id of ['doorLocked', 'stinger', 'breath', 'stalkerStep', 'batteryDead']) {
      expect((CUES[id]?.subtitle ?? '').length, `${id} needs a subtitle`).toBeGreaterThan(0);
    }
  });

  it('rejects a cue with no subtitle field', () => {
    const bad = { mystery: { sound: 'click', gain: 0.5 } } as unknown as CueTable;
    expect(() => validateCues(bad)).toThrow(/subtitle/);
  });

  it('rejects a gain that would clip', () => {
    const bad: CueTable = { loud: { sound: 'click', gain: 4, subtitle: '' } };
    expect(() => validateCues(bad)).toThrow(/gain/);
  });

  it('rejects a non-positive max distance', () => {
    const bad: CueTable = { near: { sound: 'click', gain: 0.5, subtitle: '', maxDistance: 0 } };
    expect(() => validateCues(bad)).toThrow(/maxDistance/);
  });
});
