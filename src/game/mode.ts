/**
 * Game mode state machine (CLAUDE.md §6).
 *
 * Replaces the `if (!gameOver && !paused && !menu && !loading)` checks that otherwise
 * spread through every system. Exactly one mode is active; illegal transitions are
 * rejected at the boundary instead of producing a state nobody designed for — such as
 * paused-while-dead, or a menu that is somehow also playing.
 */

export const GameMode = Object.freeze({
  Menu: 'menu',
  Loading: 'loading',
  Playing: 'playing',
  Paused: 'paused',
  GameOver: 'gameOver',
} as const);

export type GameMode = (typeof GameMode)[keyof typeof GameMode];

/** Legal transitions. Anything absent here is a bug, not an edge case. */
const TRANSITIONS: Readonly<Record<GameMode, readonly GameMode[]>> = Object.freeze({
  [GameMode.Menu]: [GameMode.Loading],
  [GameMode.Loading]: [GameMode.Playing, GameMode.Menu],
  [GameMode.Playing]: [GameMode.Paused, GameMode.GameOver, GameMode.Menu],
  [GameMode.Paused]: [GameMode.Playing, GameMode.Menu],
  [GameMode.GameOver]: [GameMode.Menu, GameMode.Loading],
});

/**
 * Modes in which the simulation clock advances.
 *
 * The single source of truth for "is the game running". Systems ask this rather than
 * each keeping their own pause flag — that is how a pause menu ends up stopping the
 * player but not the stalker.
 */
const SIMULATES: ReadonlySet<GameMode> = new Set<GameMode>([GameMode.Playing]);

export type ModeListener = (to: GameMode, from: GameMode) => void;

export interface ModeMachine {
  readonly current: GameMode;
  /** True while the simulation clock should advance. */
  readonly simulating: boolean;
  is(mode: GameMode): boolean;
  canEnter(mode: GameMode): boolean;
  /** Attempts a transition. Returns false and changes nothing if it is illegal. */
  enter(mode: GameMode): boolean;
  /** Subscribe to transitions. Returns an unsubscribe function (CLAUDE.md §4). */
  onChange(listener: ModeListener): () => void;
}

export function createModeMachine(initial: GameMode = GameMode.Menu): ModeMachine {
  let current = initial;
  const listeners = new Set<ModeListener>();

  return {
    get current() {
      return current;
    },

    get simulating() {
      return SIMULATES.has(current);
    },

    is(mode: GameMode): boolean {
      return current === mode;
    },

    canEnter(mode: GameMode): boolean {
      return TRANSITIONS[current].includes(mode);
    },

    enter(mode: GameMode): boolean {
      if (mode === current) return true;
      if (!TRANSITIONS[current].includes(mode)) return false;

      const from = current;
      current = mode;
      // Snapshot: a listener may unsubscribe, or transition again, during dispatch.
      for (const listener of [...listeners]) listener(mode, from);
      return true;
    },

    onChange(listener: ModeListener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
