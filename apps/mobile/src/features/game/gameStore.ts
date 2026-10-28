/**
 * A Zustand store around the engine's `MatchFlow` reducer.
 *
 * The engine owns every rule: this store only keeps the current flow and
 * feeds it actions with the injected `Rng` (the UI never picks dice).
 * `turnView` (below) computes what the screen needs from a flow.
 */
import {
  EngineError,
  applyMatchAction,
  canConfirm,
  canUndo,
  createMatchFlow,
  createRematchFlow,
  currentBoard,
  diceMoves,
  getPreset,
  legalNextMoves,
  matchPhase,
  pipCount,
  remainingDice,
  type BoardState,
  type DieValue,
  type GameFlow,
  type GamePhase,
  type MatchAction,
  type MatchFlow,
  type MatchPhase,
  type PerPlayer,
  type PlayerId,
  type Rng,
  type RuleSet,
  type SourceMoves,
} from '@tavli/engine';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

import type { GameAnalytics } from '@/features/analytics/gameAnalytics';
import { quietly } from '@/features/analytics/quietly';

export interface GameStoreOptions {
  players: PerPlayer<string>;
  /** Points to win the match. Default: the rules' target (3). */
  targetPoints?: number;
  /** Default: the `portes` preset. */
  rules?: RuleSet;
  rng: Rng;
  /** Go on with this flow (a saved match) instead of a new one. The other options are ignored. */
  flow?: MatchFlow;
  /**
   * Game events (#61): start, finish, undo and resign are sent from here.
   * A saved flow sends no `game_started` (the game started before).
   * The app sets it for every match (`features/match/appSessions.ts`,
   * which also sends `game_abandoned`). Leave it out in tests.
   * An error from it never fails or undoes a move: it is logged and dropped.
   */
  analytics?: GameAnalytics;
}

export interface GameStoreState {
  readonly flow: MatchFlow;
  /**
   * Names the match on this store for this app run: `m1`, `m2`, … from a
   * counter, new for each store and each rematch (never a time). Screen
   * reader events put it in their key, so each one is read once (#216).
   */
  readonly matchKey: string;
  /** The last action the engine refused, for logs and tests. `null` after a good one. */
  readonly lastError: string | null;
  /** Applies one action. Returns `false` (and keeps the flow) if the engine refuses it. */
  dispatch: (action: MatchAction) => boolean;
  /** A new match with the same players and rules; the last winner starts. */
  rematch: () => void;
}

export type GameStore = StoreApi<GameStoreState>;

let matchCount = 0;
const nextMatchKey = () => {
  matchCount += 1;
  return `m${matchCount}`;
};

export function createGameStore({
  players,
  targetPoints,
  rules,
  rng,
  flow: saved,
  analytics,
}: GameStoreOptions): GameStore {
  const ctx = { rng };
  const flow =
    saved ??
    createMatchFlow(
      {
        rules: rules ?? getPreset('portes'),
        players,
        ...(targetPoints === undefined ? {} : { targetPoints }),
      },
      ctx,
    );
  if (!saved && analytics) quietly(() => analytics.gameStarted(flow));
  return createStore<GameStoreState>()((set, get) => ({
    flow,
    matchKey: nextMatchKey(),
    lastError: null,
    dispatch: (action) => {
      const previous = get().flow;
      let next: MatchFlow;
      try {
        next = applyMatchAction(previous, action, ctx);
      } catch (error) {
        if (!(error instanceof EngineError)) throw error;
        set({ lastError: error.message });
        return false;
      }
      set({ flow: next, lastError: null });
      if (analytics) quietly(() => analytics.actionApplied(previous, next, action));
      return true;
    },
    rematch: () => {
      const next = createRematchFlow(get().flow, ctx);
      set({ flow: next, matchKey: nextMatchKey(), lastError: null });
      if (analytics) quietly(() => analytics.gameStarted(next));
    },
  }));
}

/** Reads the store in a component. */
export function useGameStore<T>(store: GameStore, selector: (state: GameStoreState) => T): T {
  return useStore(store, selector);
}

// ---------------------------------------------------------------------------
// What the screen needs, computed from a flow. Pure.

/** One die in the controls row. */
export interface DieView {
  readonly value: DieValue;
  /** Played this turn (or the turn passed): drawn faded. */
  readonly used: boolean;
}

export interface TurnView {
  readonly game: GameFlow;
  readonly phase: GamePhase;
  readonly matchPhase: MatchPhase;
  /** The player to move (a placeholder during the opening roll). */
  readonly toMove: PlayerId;
  /** The board with the moves played so far this turn. */
  readonly board: BoardState;
  readonly legal: readonly SourceMoves[];
  /** The dice of this turn: 2, or 4 for a double. Empty when nobody has rolled. */
  readonly dice: readonly DieView[];
  readonly canConfirm: boolean;
  readonly canUndo: boolean;
  readonly pips: PerPlayer<number>;
}

/**
 * Marks the dice of a roll that the played moves used. The dice still left
 * are matched from the end, so a double fades from the first die on.
 */
export function diceView(
  roll: readonly [DieValue, DieValue],
  left: readonly DieValue[],
): DieView[] {
  const pool = [...left];
  const dice = diceMoves(roll);
  const out: DieView[] = [];
  for (let k = dice.length - 1; k >= 0; k--) {
    const value = dice[k] as DieValue;
    const i = pool.indexOf(value);
    if (i >= 0) pool.splice(i, 1);
    out.unshift({ value, used: i < 0 });
  }
  return out;
}

export function turnView(flow: MatchFlow): TurnView {
  const game = flow.game;
  const board = currentBoard(game);
  const direction = game.state.rules.movement.direction;
  const roll = game.state.dice;
  const rolled = roll !== null && (game.phase === 'moving' || game.phase === 'awaiting-confirm');
  return {
    game,
    phase: game.phase,
    matchPhase: matchPhase(flow),
    toMove: game.state.toMove,
    board,
    legal: legalNextMoves(game),
    dice: rolled ? diceView(roll, remainingDice(game)) : [],
    canConfirm: canConfirm(game),
    canUndo: canUndo(game),
    pips: {
      white: pipCount(board, 'white', direction),
      black: pipCount(board, 'black', direction),
    },
  };
}
