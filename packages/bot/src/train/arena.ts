/**
 * Matches for the training: a net against the medium bot. Dev only.
 */

import { DEFAULT_EVALUATORS, createBot } from '../create-bot';
import { createNetEvaluator } from '../evaluators/net';
import type { Net, NetGame } from '../evaluators/net';
import { simulate } from '../simulate';
import type { BotLevel, LevelPolicy } from '../types';

export interface MatchResult {
  readonly games: number;
  /** Games won by the net. */
  readonly wins: number;
  /** Draws (Plakoto: both mothers pinned). */
  readonly draws: number;
  /** Points won minus points lost by the net, per game. */
  readonly pointsPerGame: number;
}

/**
 * Plays `games` games of the net (as `hard`) against `opponent` (default
 * medium, the game's heuristic): half with each colour, on the same seed,
 * so both sides get the same dice (paired games).
 */
export function netVsLevel<S, C>(
  game: NetGame<S, C>,
  net: Net,
  games: number,
  seed: number,
  opponent: BotLevel = 'medium',
  hardPolicy?: LevelPolicy,
): MatchResult {
  const variant = game.variant;
  const heuristic = DEFAULT_EVALUATORS.get(variant.id)?.medium;
  if (heuristic === undefined) throw new Error(`no heuristic for ${variant.id}`);
  const bot = createBot({
    evaluators: new Map([
      [
        variant.id,
        {
          easy: heuristic,
          medium: heuristic,
          hard: createNetEvaluator(game, net, `${variant.id}-net-candidate`),
        },
      ],
    ]),
    ...(hardPolicy === undefined ? {} : { policies: { hard: hardPolicy } }),
  });
  const half = Math.floor(games / 2);
  const a = simulate({
    variant,
    bots: [
      { bot, difficulty: 'hard' },
      { bot, difficulty: opponent },
    ],
    games: half,
    seed,
  });
  const b = simulate({
    variant,
    bots: [
      { bot, difficulty: opponent },
      { bot, difficulty: 'hard' },
    ],
    games: half,
    seed,
  });
  const wins = a.wins[0] + b.wins[1];
  const points = a.points[0] - a.points[1] + b.points[1] - b.points[0];
  return {
    games: 2 * half,
    wins,
    draws: a.draws + b.draws,
    pointsPerGame: points / Math.max(1, 2 * half),
  };
}
