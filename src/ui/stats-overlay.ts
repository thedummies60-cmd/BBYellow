/**
 * Debug overlay for the budgets in CLAUDE.md §8.
 *
 * A budget you cannot measure is not a constraint, and `docs/performance-budgets.md`
 * points at this overlay as the way to read frame time. Enabled with `?stats=1` or
 * `VITE_DEBUG_OVERLAY`.
 *
 * Reads a plain `FrameStats` from `shared/`, never the renderer: `ui/` sits above
 * `render/` and may not reach into it (CLAUDE.md §2).
 */
import type { FrameStats } from '@shared/stats.js';

/** Refresh rate. Rewriting DOM text 60x a second allocates strings and is unreadable. */
const UPDATE_INTERVAL_MS = 250;

export interface StatsOverlay {
  /** Call every frame; it throttles itself. */
  update(stats: Readonly<FrameStats>, nowMs: number): void;
  dispose(): void;
}

const BUDGET = Object.freeze({
  frameMs: 16.6,
  drawCalls: 300,
  triangles: 1_500_000,
});

export function createStatsOverlay(parent: HTMLElement = document.body): StatsOverlay {
  const element = document.createElement('pre');
  element.id = 'stats';
  element.setAttribute('aria-hidden', 'true'); // debug chrome, not content
  element.style.cssText = [
    'position:fixed',
    'top:8px',
    'left:8px',
    'margin:0',
    'padding:6px 8px',
    'font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace',
    'color:#cfcfcf',
    'background:rgba(0,0,0,.65)',
    'border:1px solid rgba(255,255,255,.12)',
    'border-radius:3px',
    'pointer-events:none',
    'white-space:pre',
    'z-index:10',
  ].join(';');
  parent.appendChild(element);

  let lastUpdate = -Infinity;

  /** Marks a value that has blown its budget, so the overlay reads at a glance. */
  const flag = (value: number, budget: number): string => (value > budget ? ' !' : '');

  return {
    update(stats: Readonly<FrameStats>, nowMs: number): void {
      if (nowMs - lastUpdate < UPDATE_INTERVAL_MS) return;
      lastUpdate = nowMs;

      element.textContent = [
        `fps    ${stats.fps.toFixed(0).padStart(6)}`,
        `frame  ${stats.frameMs.toFixed(2).padStart(6)} ms${flag(stats.frameMs, BUDGET.frameMs)}`,
        `  sim  ${stats.simMs.toFixed(2).padStart(6)} ms`,
        `  draw ${stats.renderMs.toFixed(2).padStart(6)} ms`,
        `calls  ${String(stats.drawCalls).padStart(6)}${flag(stats.drawCalls, BUDGET.drawCalls)}`,
        `tris   ${String(stats.triangles).padStart(6)}${flag(stats.triangles, BUDGET.triangles)}`,
        `steps  ${String(stats.steps).padStart(6)}`,
        `ents   ${String(stats.entities).padStart(6)}`,
        stats.droppedTime > 0 ? `dropped ${stats.droppedTime.toFixed(2)}s !` : '',
      ]
        .filter(Boolean)
        .join('\n');
    },

    dispose(): void {
      element.remove();
    },
  };
}
