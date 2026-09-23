/**
 * The HUD: interaction prompt, subtitles, battery, and what you are carrying.
 *
 * Reads plain values handed in by `app/` and never touches game state (CLAUDE.md §2).
 * Updates are guarded so the DOM is only written when something actually changed —
 * setting textContent every frame allocates strings and forces layout.
 */
import type { FrameStats } from '@shared/stats.js';

export interface HudState {
  readonly prompt: string;
  readonly promptLocked: boolean;
  readonly subtitle: string;
  /** 0-1, or -1 to hide the battery entirely. */
  readonly battery: number;
  readonly flashlightOn: boolean;
  readonly hasKey: boolean;
  /** 0-100. */
  readonly sanity: number;
}

export interface Hud {
  update(state: HudState): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

const BASE = 'position:fixed;pointer-events:none;z-index:15;';

function element(tag: string, css: string): HTMLElement {
  const node = document.createElement(tag);
  node.style.cssText = BASE + css;
  return node;
}

export function createHud(parent: HTMLElement = document.body): Hud {
  const root = document.createElement('div');
  root.id = 'hud';
  root.style.cssText = BASE + 'inset:0;font:14px/1.5 system-ui,sans-serif;color:#d8d8d8;';

  // Centre prompt: what using the thing in front of you would do.
  const prompt = element(
    'p',
    'left:50%;top:56%;transform:translateX(-50%);margin:0;text-shadow:0 1px 3px #000;',
  );

  // Reticle: a small dot, so "looking at" is unambiguous.
  const reticle = element(
    'div',
    'left:50%;top:50%;width:4px;height:4px;margin:-2px 0 0 -2px;border-radius:50%;' +
      'background:rgba(230,230,230,.55);',
  );

  // Subtitles: the visual counterpart every informative cue must have
  // (docs/horror-design-principles.md).
  const subtitle = element(
    'p',
    'left:50%;bottom:9%;transform:translateX(-50%);margin:0;max-width:44rem;text-align:center;' +
      'color:#efefef;background:rgba(0,0,0,.6);padding:.2rem .7rem;border-radius:3px;',
  );

  const status = element(
    'div',
    'left:1.2rem;bottom:1.2rem;display:flex;flex-direction:column;gap:.35rem;',
  );
  const batteryWrap = document.createElement('div');
  batteryWrap.style.cssText =
    'width:120px;height:5px;background:rgba(255,255,255,.14);border-radius:3px;overflow:hidden';
  const batteryFill = document.createElement('div');
  batteryFill.style.cssText = 'height:100%;width:100%;background:#d8c48a;transition:width .2s';
  batteryWrap.appendChild(batteryFill);
  const carrying = document.createElement('p');
  carrying.style.cssText = 'margin:0;font-size:.8rem;color:#9d9d9d';
  status.append(batteryWrap, carrying);

  root.append(reticle, prompt, subtitle, status);
  parent.appendChild(root);

  // Cached so the DOM is written only on change.
  let lastPrompt = '\u0000';
  let lastSubtitle = '\u0000';
  let lastBattery = -2;
  let lastCarrying = '\u0000';
  let lastSanityBand = -1;

  return {
    update(state: HudState): void {
      if (state.prompt !== lastPrompt) {
        lastPrompt = state.prompt;
        prompt.textContent = state.prompt;
        prompt.style.color = state.promptLocked ? '#c98a8a' : '#e8e8e8';
      }

      if (state.subtitle !== lastSubtitle) {
        lastSubtitle = state.subtitle;
        subtitle.textContent = state.subtitle;
        subtitle.style.display = state.subtitle === '' ? 'none' : 'block';
      }

      if (state.battery !== lastBattery) {
        lastBattery = state.battery;
        batteryWrap.style.display = state.battery < 0 ? 'none' : 'block';
        batteryFill.style.width = `${Math.max(0, Math.min(1, state.battery)) * 100}%`;
        batteryFill.style.background = state.flashlightOn ? '#d8c48a' : '#6b6b6b';
      }

      const carryingText = state.hasKey ? 'carrying: a key' : '';
      if (carryingText !== lastCarrying) {
        lastCarrying = carryingText;
        carrying.textContent = carryingText;
      }

      // Banded, so the reticle is not restyled 60 times a second for a 0.1 change.
      const band = state.sanity < 25 ? 0 : state.sanity < 50 ? 1 : 2;
      if (band !== lastSanityBand) {
        lastSanityBand = band;
        reticle.style.background =
          band === 0 ? 'rgba(220,120,120,.75)' : band === 1 ? 'rgba(220,190,140,.65)' : 'rgba(230,230,230,.55)';
      }
    },

    setVisible(visible: boolean): void {
      root.style.display = visible ? 'block' : 'none';
    },

    dispose(): void {
      root.remove();
    },
  };
}

/** Unused re-export guard: keeps FrameStats imported where the HUD may later show it. */
export type { FrameStats };
