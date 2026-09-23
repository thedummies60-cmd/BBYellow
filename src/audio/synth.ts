/**
 * Procedurally rendered sound (docs/asset-pipeline.md).
 *
 * The demo ships no recorded audio, so every sound is generated into a Float32Array at
 * load. That keeps the bundle tiny and the repository free of binaries, and it makes the
 * waveform generation *testable* — these are pure functions of a sample rate and a
 * seeded RNG, with no `AudioContext` anywhere.
 *
 * This is placeholder audio in the same sense the box geometry is placeholder art:
 * recorded material replaces it through the asset pipeline without the mixer changing.
 */
import type { Rng } from '@core';

/** Exponential decay envelope — the shape almost every percussive sound needs. */
const decay = (t: number, tau: number): number => Math.exp(-t / tau);

/** Raised-cosine fade, for loops that must not click at the seam. */
const fade = (position: number, length: number): number =>
  position < length ? 0.5 - 0.5 * Math.cos((Math.PI * position) / length) : 1;

/**
 * A one-pole low-pass, applied in place.
 *
 * Unfiltered white noise reads as a hiss, not a footstep. The cutoff is what separates
 * a boot on concrete from a tape hiss.
 */
function lowPass(samples: Float32Array, cutoff: number, sampleRate: number): void {
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / sampleRate;
  const alpha = dt / (rc + dt);
  let previous = 0;
  for (let i = 0; i < samples.length; i++) {
    previous += alpha * ((samples[i] as number) - previous);
    samples[i] = previous;
  }
}

function highPass(samples: Float32Array, cutoff: number, sampleRate: number): void {
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / sampleRate;
  const alpha = rc / (rc + dt);
  let previousIn = 0;
  let previousOut = 0;
  for (let i = 0; i < samples.length; i++) {
    const input = samples[i] as number;
    previousOut = alpha * (previousOut + input - previousIn);
    previousIn = input;
    samples[i] = previousOut;
  }
}

/** Peak-normalises to `target`, so cue volumes are set by the mixer, not by luck. */
export function normalize(samples: Float32Array, target = 0.9): Float32Array {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const magnitude = Math.abs(samples[i] as number);
    if (magnitude > peak) peak = magnitude;
  }
  if (peak === 0) return samples;
  const gain = target / peak;
  for (let i = 0; i < samples.length; i++) samples[i] = (samples[i] as number) * gain;
  return samples;
}

const alloc = (seconds: number, sampleRate: number): Float32Array =>
  new Float32Array(Math.max(1, Math.floor(seconds * sampleRate)));

/**
 * A footstep: a filtered noise burst with a short body.
 *
 * Varied per step by the seeded RNG — identical footsteps read as a machine, and the
 * ear notices long before the eye does.
 */
export function renderFootstep(sampleRate: number, rng: Rng): Float32Array {
  const samples = alloc(0.18, sampleRate);
  const tau = 0.035 + rng.range(-0.008, 0.008);
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    samples[i] = (rng.next() * 2 - 1) * decay(t, tau);
  }
  lowPass(samples, 900 + rng.range(-150, 150), sampleRate);
  highPass(samples, 90, sampleRate);
  return normalize(samples, 0.75);
}

/**
 * Room tone: a slow noise bed under a low drone.
 *
 * Loops, so both ends are faded and the length is chosen to avoid an obvious period.
 */
export function renderRoomTone(sampleRate: number, rng: Rng): Float32Array {
  const seconds = 6;
  const samples = alloc(seconds, sampleRate);
  const length = samples.length;
  const fadeLength = Math.floor(0.25 * sampleRate);

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const drone =
      Math.sin(2 * Math.PI * 47 * t) * 0.35 +
      Math.sin(2 * Math.PI * 71.3 * t) * 0.18 +
      Math.sin(2 * Math.PI * 23.5 * t) * 0.22;
    samples[i] = drone + (rng.next() * 2 - 1) * 0.5;
  }
  lowPass(samples, 220, sampleRate);

  // Equal-power crossfade at the seam, or the loop clicks once every six seconds.
  for (let i = 0; i < length; i++) {
    const head = fade(i, fadeLength);
    const tail = fade(length - 1 - i, fadeLength);
    samples[i] = (samples[i] as number) * Math.min(head, tail);
  }
  return normalize(samples, 0.5);
}

/** A door: a resonant creak that rises, then the thud of it settling. */
export function renderDoor(sampleRate: number, rng: Rng): Float32Array {
  const samples = alloc(1.1, sampleRate);
  let phase = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    const progress = Math.min(1, t / 0.75);
    // Creak: a swept tone roughened by noise, the way a hinge actually sounds.
    const frequency = 120 + progress * 260 + Math.sin(2 * Math.PI * 11 * t) * 25;
    phase += (2 * Math.PI * frequency) / sampleRate;
    const rough = 0.6 + 0.4 * rng.next();
    const creak = Math.sin(phase) * rough * decay(t, 0.4) * (1 - progress * 0.35);
    // Thud as it comes to rest.
    const thudT = Math.max(0, t - 0.78);
    const thud = Math.sin(2 * Math.PI * 62 * thudT) * decay(thudT, 0.06) * (t > 0.78 ? 1 : 0);
    samples[i] = creak * 0.7 + thud * 0.9;
  }
  lowPass(samples, 2600, sampleRate);
  return normalize(samples, 0.8);
}

/** The stinger: a dissonant cluster with an instant attack and a long tail. */
export function renderStinger(sampleRate: number, rng: Rng): Float32Array {
  const samples = alloc(1.8, sampleRate);
  // A minor second and a tritone above the root — the intervals the ear reads as wrong.
  const partials = [138.6, 146.8, 196.0, 293.7];
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    let value = 0;
    for (let p = 0; p < partials.length; p++) {
      const frequency = partials[p] as number;
      value += Math.sin(2 * Math.PI * frequency * t) * decay(t, 0.55 - p * 0.09);
    }
    // A noise transient on the attack gives it the crack that sells the hit.
    value += (rng.next() * 2 - 1) * decay(t, 0.02) * 1.4;
    samples[i] = value * 0.3;
  }
  highPass(samples, 60, sampleRate);
  return normalize(samples, 0.95);
}

/** Heartbeat: the double thump, played faster as sanity falls. */
export function renderHeartbeat(sampleRate: number): Float32Array {
  const samples = alloc(0.85, sampleRate);
  const beat = (t: number, at: number, strength: number): number => {
    const local = t - at;
    if (local < 0) return 0;
    return Math.sin(2 * Math.PI * 54 * local) * decay(local, 0.07) * strength;
  };
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    samples[i] = beat(t, 0, 1) + beat(t, 0.24, 0.62);
  }
  lowPass(samples, 180, sampleRate);
  return normalize(samples, 0.85);
}

/** Pickup: a short bright two-tone blip, so success is unmistakable. */
export function renderPickup(sampleRate: number): Float32Array {
  const samples = alloc(0.35, sampleRate);
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    const frequency = t < 0.08 ? 660 : 880;
    samples[i] = Math.sin(2 * Math.PI * frequency * t) * decay(t, 0.12) * 0.8;
  }
  return normalize(samples, 0.7);
}

/** A dry click, for a locked door or a dead battery. */
export function renderClick(sampleRate: number, rng: Rng): Float32Array {
  const samples = alloc(0.09, sampleRate);
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    samples[i] = (rng.next() * 2 - 1) * decay(t, 0.008);
  }
  highPass(samples, 800, sampleRate);
  return normalize(samples, 0.55);
}

/** The stalker: a breathing rasp, pitched low and moving. */
export function renderBreath(sampleRate: number, rng: Rng): Float32Array {
  const samples = alloc(2.4, sampleRate);
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate;
    // Two slow inhale/exhale swells across the loop.
    const envelope = Math.max(0, Math.sin(2 * Math.PI * (t / 1.2)));
    samples[i] = (rng.next() * 2 - 1) * envelope * envelope;
  }
  lowPass(samples, 1100, sampleRate);
  highPass(samples, 140, sampleRate);
  const fadeLength = Math.floor(0.15 * sampleRate);
  for (let i = 0; i < samples.length; i++) {
    samples[i] =
      (samples[i] as number) * Math.min(fade(i, fadeLength), fade(samples.length - 1 - i, fadeLength));
  }
  return normalize(samples, 0.7);
}
