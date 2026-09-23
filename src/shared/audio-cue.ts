/**
 * Audio cue definitions.
 *
 * Lives in `shared/` because `game/` authors the cue table and `audio/` plays it, and
 * those two layers cannot import each other.
 *
 * Every cue carries a `subtitle`. That is the accessibility commitment in
 * `docs/horror-design-principles.md` made structural: a cue without one fails config
 * validation at startup, so a sound that conveys information cannot ship without a
 * readable equivalent.
 */

export type SoundId =
  | 'footstep'
  | 'roomTone'
  | 'door'
  | 'stinger'
  | 'heartbeat'
  | 'pickup'
  | 'click'
  | 'breath';

export interface AudioCue {
  /** Which synthesised waveform to play. */
  readonly sound: SoundId;
  /** 0-1, before distance attenuation. */
  readonly gain: number;
  /** Random pitch spread, so repeated cues do not read as a machine. */
  readonly pitchVariance?: number;
  readonly loop?: boolean;
  /**
   * Shown when subtitles are on. Empty string means "carries no information" — a choice
   * the author has to make explicitly rather than by omission.
   */
  readonly subtitle: string;
  /** Distance in metres at which the cue is inaudible. Omit for non-positional cues. */
  readonly maxDistance?: number;
}

export type CueId = string;
export type CueTable = Readonly<Record<CueId, AudioCue>>;
