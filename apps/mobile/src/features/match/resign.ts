/**
 * Who may resign, and what a resign gives (wireframe 7, owner answer #63:
 * mono or diplo by the board, plus "Resign match"). The engine scores it;
 * this file only asks. Pure.
 */
import {
  matchPhase,
  opponent,
  resignGame,
  type GameResult,
  type MatchFlow,
  type PerPlayer,
  type PlayerId,
} from '@tavli/engine';
import type { TFunction } from 'i18next';

import { HUMAN_SIDE, type MatchMode } from './setup';

/**
 * The player who resigns from the menu: the human vs the bot; in
 * pass-and-play, the player whose turn it is. `null` when nobody can
 * (the match is over, or pass-and-play before the opening roll decides).
 */
export function resigningPlayer(flow: MatchFlow, mode: MatchMode): PlayerId | null {
  if (matchPhase(flow) === 'match-over') return null;
  if (mode === 'bot') return HUMAN_SIDE;
  if (flow.game.phase === 'opening-roll' || flow.game.phase === 'game-over') return null;
  return flow.game.state.toMove;
}

/** True when `player` can resign the game now (it has started and is not over). */
export function canResignGame(flow: MatchFlow, player: PlayerId | null): player is PlayerId {
  return player !== null && matchPhase(flow) === 'playing' && flow.game.phase !== 'opening-roll';
}

export interface ResignPreview {
  readonly result: GameResult;
  /** The match score after the resign. */
  readonly score: PerPlayer<number>;
}

/** What the opponent gets if `player` resigns the game now. */
export function previewResign(flow: MatchFlow, player: PlayerId): ResignPreview {
  // The moves of an unfinished turn do not count: the engine scores the turn start.
  const result = resignGame(flow.game.state, player);
  const winner = opponent(player);
  const score = { ...flow.match.score, [winner]: flow.match.score[winner] + result.points };
  return { result, score };
}

/**
 * What the opponent gets for the game in play when `player` resigns the
 * match (docs/rules/tavli-match.md, "Resigning"): the same as Resign game.
 * `null` when no game is in play (the opening roll, or a game that is
 * over): the score stays as it is.
 */
export function previewResignMatch(flow: MatchFlow, player: PlayerId): ResignPreview | null {
  return canResignGame(flow, player) ? previewResign(flow, player) : null;
}

export interface ResignMatchText {
  readonly lines: string[];
  /** The score after the resign, when a game in play adds points to it. */
  readonly note?: string;
}

/**
 * The text of the Resign match dialog, for the local and the online screen.
 * It says that the game in play counts, with its points, and shows the
 * score after the resign.
 */
export function resignMatchText(
  flow: MatchFlow,
  player: PlayerId,
  name: (player: PlayerId) => string,
  t: TFunction,
): ResignMatchText {
  const winner = name(opponent(player));
  const preview = previewResignMatch(flow, player);
  if (preview === null) return { lines: [t('game.resign.matchBody', { winner })] };
  return {
    lines: [t('game.resign.matchBodyGame', { winner, count: preview.result.points })],
    note: t('game.resign.after', {
      score: t('game.end.score', {
        white: name('white'),
        black: name('black'),
        whiteScore: preview.score.white,
        blackScore: preview.score.black,
      }),
      target: flow.match.targetPoints,
    }),
  };
}
