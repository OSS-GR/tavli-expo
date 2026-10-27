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
