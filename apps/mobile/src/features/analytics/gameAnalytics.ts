/**
 * Game events for analytics (issue #61): `game_started`, `game_finished`,
 * `game_abandoned`, `undo_used` and `resign`.
 *
 * The game store calls this after every action the engine accepts
 * (`createGameStore({ analytics })`), so screens do not have to. The
 * session registry (`features/match/sessions.ts`) calls `gameAbandoned`
 * when a new match replaces one that is not over.
 *
 * `durationSec` counts from the `game_started` this helper sent. A resumed
 * match (from the save slot) sends no `game_started`, so its game in play
 * has no `durationSec`: its start time was not saved. The next games of
 * that match have one again.
 *
 * Event plan: `docs/architecture/analytics-events.md`.
 */
import type { Analytics, Difficulty, GameMode, GameResultKind } from '@tavli/contracts';
import type { GameResult, MatchAction, MatchFlow } from '@tavli/engine';

import { analytics as appAnalytics } from '@/services';

export interface GameAnalyticsSetup {
  mode: GameMode;
  /** Only for `mode: 'bot'`. */
  botLevel?: Difficulty;
}

export interface GameAnalyticsDeps {
  analytics?: Analytics;
  /** Milliseconds. Tests pass a fake clock. */
  now?: () => number;
}

export interface GameAnalytics {
  /** A game began: a new match, the next game, or a rematch. */
  gameStarted: (flow: MatchFlow) => void;
  /**
   * After the engine accepted `action`. Sends `undo_used`, `resign`,
   * `game_finished`, and `game_started` for the next game.
   */
  actionApplied: (previous: MatchFlow, next: MatchFlow, action: MatchAction) => void;
  /** The player left a game that is not over. Does nothing for a finished game. */
  gameAbandoned: (flow: MatchFlow) => void;
}

/** mono (1 point), diplo (2 or more), resign, or draw. */
export function resultKind(result: GameResult): GameResultKind {
  if (result.reason === 'resigned') return 'resign';
  if (result.winner === null) return 'draw';
  return result.points >= 2 ? 'diplo' : 'mono';
}

/** Turns played: the engine's `turnNumber` is the turn in progress (1 at the start). */
function turnsPlayed(flow: MatchFlow): number {
  return Math.max(0, flow.game.state.turnNumber - 1);
}

function gameIsOver(flow: MatchFlow): boolean {
  return flow.game.phase === 'game-over';
}

export function createGameAnalytics(
  { mode, botLevel }: GameAnalyticsSetup,
  { analytics = appAnalytics, now = Date.now }: GameAnalyticsDeps = {},
): GameAnalytics {
  /** When the game in play started, or `null` for a resumed game (unknown). */
  let startedAt: number | null = null;
  /** The game already reported as finished or abandoned. */
  let closed: MatchFlow['game'] | null = null;

  const finished = (flow: MatchFlow, result: GameResultKind) => {
    if (closed === flow.game) return;
    closed = flow.game;
    analytics.track('game_finished', {
      mode,
      variant: flow.game.state.variant,
      result,
      turns: turnsPlayed(flow),
      ...(startedAt === null
        ? {}
        : { durationSec: Math.max(0, Math.round((now() - startedAt) / 1000)) }),
    });
  };

  const gameStarted = (flow: MatchFlow) => {
    startedAt = now();
    closed = null;
    analytics.track('game_started', {
      mode,
      variant: flow.game.state.variant,
      matchLength: flow.match.targetPoints,
      ...(mode === 'bot' && botLevel !== undefined ? { botLevel } : {}),
    });
  };

  return {
    gameStarted,
    actionApplied: (previous, next, action) => {
      if (action.type === 'undo') analytics.track('undo_used');
      if (action.type === 'resign' || action.type === 'resignMatch') analytics.track('resign');

      if (!gameIsOver(previous) && gameIsOver(next) && next.game.result !== null) {
        finished(next, resultKind(next.game.result));
      } else if (action.type === 'resignMatch' && !gameIsOver(previous)) {
        // Resigning the match mid-game also ends the game in play.
        finished(next, 'resign');
      }

      if (action.type === 'nextGame') gameStarted(next);
    },
    gameAbandoned: (flow) => {
      if (gameIsOver(flow) || flow.match.status === 'finished' || closed === flow.game) return;
      closed = flow.game;
      analytics.track('game_abandoned', {
        mode,
        variant: flow.game.state.variant,
        turn: flow.game.state.turnNumber,
      });
    },
  };
}
