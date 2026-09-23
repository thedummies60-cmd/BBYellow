/**
 * The audio mixer (CLAUDE.md §2).
 *
 * Owns the `AudioContext` and everything hanging off it. Voices are pooled and capped;
 * buffers are rendered once at load by `synth.ts`.
 *
 * Browsers start the context suspended and resume it only inside a user gesture — the
 * same click that grabs pointer lock (docs/browser-integration.md). A horror game
 * running silently is broken, not degraded, so `resume` reports whether it worked.
 */
import { createRng } from '@core';
import type { AudioCue, SoundId } from '@shared/audio-cue.js';
import {
  renderBreath,
  renderClick,
  renderDoor,
  renderFootstep,
  renderHeartbeat,
  renderPickup,
  renderRoomTone,
  renderStinger,
} from './synth.js';

/** Hard cap from CLAUDE.md §8. Beyond this, the oldest voice is stolen. */
export const MAX_VOICES = 32;

/** Distinct footstep renders, cycled so steps never repeat back to back. */
const FOOTSTEP_VARIANTS = 6;

export interface PlayOptions {
  /** World position, for panning and distance attenuation. Omit for a 2D cue. */
  readonly position?: { x: number; y: number; z: number };
  /** Multiplies the cue's own gain. */
  readonly gain?: number;
}

export interface Voice {
  stop(fadeSeconds?: number): void;
  setPosition(x: number, y: number, z: number): void;
  setGain(gain: number): void;
  setRate(rate: number): void;
  readonly playing: boolean;
}

export interface Mixer {
  /** Must be called from a user gesture. Resolves false if the browser refused. */
  resume(): Promise<boolean>;
  readonly running: boolean;
  play(cue: AudioCue, options?: PlayOptions): Voice | null;
  /** Moves the listener, so positional cues pan correctly. */
  setListener(x: number, y: number, z: number, yaw: number): void;
  setMasterGain(gain: number): void;
  readonly activeVoices: number;
  dispose(): void;
}

const NULL_VOICE: Voice = Object.freeze({
  stop: () => {},
  setPosition: () => {},
  setGain: () => {},
  setRate: () => {},
  playing: false,
});

export function createMixer(seed = 1): Mixer {
  const AudioContextCtor =
    window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (AudioContextCtor === undefined) {
    // No Web Audio at all: every call becomes a no-op rather than a crash.
    return {
      resume: () => Promise.resolve(false),
      running: false,
      play: () => null,
      setListener: () => {},
      setMasterGain: () => {},
      activeVoices: 0,
      dispose: () => {},
    };
  }

  const context = new AudioContextCtor();
  const master = context.createGain();
  master.gain.value = 0.9;
  master.connect(context.destination);

  // Buffers are rendered once, from a fixed seed: the same build always sounds the same.
  const rng = createRng(seed);
  const rate = context.sampleRate;

  const makeBuffer = (data: Float32Array): AudioBuffer => {
    const buffer = context.createBuffer(1, data.length, rate);
    // set() rather than copyToChannel(): the latter's typing demands a Float32Array
    // backed specifically by an ArrayBuffer, which our renderers do not promise.
    buffer.getChannelData(0).set(data);
    return buffer;
  };

  const footsteps: AudioBuffer[] = [];
  for (let i = 0; i < FOOTSTEP_VARIANTS; i++) footsteps.push(makeBuffer(renderFootstep(rate, rng)));
  let footstepIndex = 0;

  const buffers: Record<Exclude<SoundId, 'footstep'>, AudioBuffer> = {
    roomTone: makeBuffer(renderRoomTone(rate, rng)),
    door: makeBuffer(renderDoor(rate, rng)),
    stinger: makeBuffer(renderStinger(rate, rng)),
    heartbeat: makeBuffer(renderHeartbeat(rate)),
    pickup: makeBuffer(renderPickup(rate)),
    click: makeBuffer(renderClick(rate, rng)),
    breath: makeBuffer(renderBreath(rate, rng)),
  };

  const bufferFor = (sound: SoundId): AudioBuffer => {
    if (sound !== 'footstep') return buffers[sound];
    const buffer = footsteps[footstepIndex % footsteps.length] as AudioBuffer;
    footstepIndex++;
    return buffer;
  };

  interface LiveVoice {
    source: AudioBufferSourceNode;
    gain: GainNode;
    panner: PannerNode | null;
    startedAt: number;
    handle: Voice;
  }

  const live = new Set<LiveVoice>();
  let running = false;

  const stopVoice = (voice: LiveVoice, fadeSeconds: number): void => {
    if (!live.has(voice)) return;
    live.delete(voice);
    const now = context.currentTime;
    if (fadeSeconds > 0) {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
      voice.gain.gain.linearRampToValueAtTime(0, now + fadeSeconds);
      voice.source.stop(now + fadeSeconds + 0.02);
    } else {
      voice.source.stop();
    }
  };

  return {
    get running() {
      return running;
    },
    get activeVoices() {
      return live.size;
    },

    async resume(): Promise<boolean> {
      try {
        if (context.state === 'suspended') await context.resume();
        running = context.state === 'running';
        return running;
      } catch {
        running = false;
        return false;
      }
    },

    play(cue: AudioCue, options: PlayOptions = {}): Voice | null {
      if (context.state !== 'running') return NULL_VOICE;

      // Steal the oldest voice rather than refusing: a missing footstep is less wrong
      // than a missing scare, and the oldest is the least likely to still matter.
      if (live.size >= MAX_VOICES) {
        let oldest: LiveVoice | null = null;
        for (const voice of live) {
          if (oldest === null || voice.startedAt < oldest.startedAt) oldest = voice;
        }
        if (oldest !== null) stopVoice(oldest, 0.02);
      }

      const source = context.createBufferSource();
      source.buffer = bufferFor(cue.sound);
      source.loop = cue.loop === true;
      if (cue.pitchVariance !== undefined && cue.pitchVariance > 0) {
        source.playbackRate.value = 1 + rng.range(-cue.pitchVariance, cue.pitchVariance);
      }

      const gain = context.createGain();
      gain.gain.value = cue.gain * (options.gain ?? 1);

      let panner: PannerNode | null = null;
      if (options.position !== undefined) {
        panner = context.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 1.5;
        panner.maxDistance = cue.maxDistance ?? 25;
        panner.rolloffFactor = 1.4;
        panner.positionX.value = options.position.x;
        panner.positionY.value = options.position.y;
        panner.positionZ.value = options.position.z;
        source.connect(gain).connect(panner).connect(master);
      } else {
        source.connect(gain).connect(master);
      }

      const voice: LiveVoice = {
        source,
        gain,
        panner,
        startedAt: context.currentTime,
        handle: NULL_VOICE,
      };

      voice.handle = {
        get playing() {
          return live.has(voice);
        },
        stop: (fadeSeconds = 0.05) => stopVoice(voice, fadeSeconds),
        setPosition: (x, y, z) => {
          if (panner === null) return;
          panner.positionX.value = x;
          panner.positionY.value = y;
          panner.positionZ.value = z;
        },
        setGain: (value) => {
          gain.gain.value = value;
        },
        setRate: (value) => {
          source.playbackRate.value = value;
        },
      };

      source.onended = () => live.delete(voice);
      live.add(voice);
      source.start();
      return voice.handle;
    },

    setListener(x: number, y: number, z: number, yaw: number): void {
      const listener = context.listener;
      // Yaw 0 faces -Z, matching the game's convention.
      const forwardX = -Math.sin(yaw);
      const forwardZ = -Math.cos(yaw);
      if (listener.positionX !== undefined) {
        listener.positionX.value = x;
        listener.positionY.value = y;
        listener.positionZ.value = z;
        listener.forwardX.value = forwardX;
        listener.forwardY.value = 0;
        listener.forwardZ.value = forwardZ;
        listener.upX.value = 0;
        listener.upY.value = 1;
        listener.upZ.value = 0;
      } else {
        // Firefox still ships the deprecated call-style listener.
        listener.setPosition(x, y, z);
        listener.setOrientation(forwardX, 0, forwardZ, 0, 1, 0);
      }
    },

    setMasterGain(gain: number): void {
      master.gain.value = gain;
    },

    dispose(): void {
      for (const voice of [...live]) stopVoice(voice, 0);
      live.clear();
      master.disconnect();
      void context.close();
      running = false;
    },
  };
}
