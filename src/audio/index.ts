/** Public surface of audio/ (CLAUDE.md §6). */

export { createMixer, MAX_VOICES } from './mixer.js';
export type { Mixer, PlayOptions, Voice } from './mixer.js';

export {
  normalize,
  renderBreath,
  renderClick,
  renderDoor,
  renderFootstep,
  renderHeartbeat,
  renderPickup,
  renderRoomTone,
  renderStinger,
} from './synth.js';
