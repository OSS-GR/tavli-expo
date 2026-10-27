/**
 * Matches for the training: a net against the medium bot. Dev only.
 */

import { portes } from '@tavli/engine';

import { createBot } from '../create-bot';
import { portesHeuristic } from '../evaluators/portes-heuristic';
import { createPortesNetEvaluator } from '../evaluators/portes-net';
import type { PortesNet } from '../evaluators/portes-net';
import { simulate } from '../simulate';
import type { BotLevel, LevelPolicy } from '../types';

export interface MatchResult {
  readonly games: number;
  /** Games won by the net. */
  readonly wins: number;
  /** Points won minus points lost by the net, per game. */
  readonly pointsPerGame: number;
}

/**
 * Plays `games` games of the net (as `hard`) against `opponent` (default
 * medium): half with each colour, on the same seed, so both sides get the
 * same dice (paired games).
 */
export function netVsLevel(
  net: PortesNet,
  games: number,
  seed: number,
  opponent: BotLevel = 'medium',
  hardPolicy?: LevelPolicy,
): MatchResult {
  const bot = createBot({
    evaluators: new Map([
      [
        'portes',
        {
          easy: portesHeuristic,
          medium: portesHeuristic,
          hard: createPortesNetEvaluator(net, 'portes-net-candidate'),
        },
      ],
    ]),
    ...(hardPolicy === undefined ? {} : { policies: { hard: hardPolicy } }),
  });
  const half = Math.floor(games / 2);
  const a = simulate({
    variant: portes,
    bots: [
      { bot, difficulty: 'hard' },
      { bot, difficulty: opponent },
    ],
    games: half,
    seed,
  });
  const b = simulate({
    variant: portes,
    bots: [
      { bot, difficulty: opponent },
      { bot, difficulty: 'hard' },
    ],
    games: half,
    seed,
  });
  const wins = a.wins[0] + b.wins[1];
  const points = a.points[0] - a.points[1] + b.points[1] - b.points[0];
  return { games: 2 * half, wins, pointsPerGame: points / Math.max(1, 2 * half) };
}
