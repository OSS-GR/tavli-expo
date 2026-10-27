/**
 * Runs the game review (#215) off the first render. Each turn is one
 * ranking of the Analyzer, and a game has many, so the screen first shows
 * a busy state. The work goes in small steps on timers (the replay, then
 * one turn per step), so the screen stays responsive, and it stops when
 * the screen goes away. The result is the same for the same game.
 */
import type { Analyzer } from '@tavli/bot';
import type { MatchFlow, PlayerId } from '@tavli/engine';
import { useEffect, useState } from 'react';

import {
  biggestMistakes,
  gradeTurn,
  lastGameTurns,
  type GradedTurn,
  type Mistake,
  type PlayedTurn,
} from './review';

export type GameReview =
  | { readonly kind: 'busy' }
  | {
      readonly kind: 'done';
      readonly mistakes: readonly Mistake[];
      /** How many turns had a choice (0: nothing to review). */
      readonly graded: number;
    }
  /** The Analyzer cannot read this game (no evaluator for its variant). */
  | { readonly kind: 'failed' };

const BUSY: GameReview = { kind: 'busy' };

export function useGameReview(
  flow: MatchFlow,
  players: readonly PlayerId[],
  analyzer: Analyzer,
): GameReview {
  // The result belongs to the flow it was made for.
  const [result, setResult] = useState<{ flow: MatchFlow; review: GameReview } | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let turns: PlayedTurn[] | null = null;
    const graded: GradedTurn[] = [];
    let next = 0;
    const finish = (review: GameReview) => setResult({ flow, review });
    const step = () => {
      try {
        if (turns === null) turns = lastGameTurns(flow, players);
        else {
          const turn = turns[next];
          next += 1;
          const grade = turn === undefined ? null : gradeTurn(analyzer, turn);
          if (grade !== null) graded.push(grade);
        }
      } catch (error) {
        console.warn('could not review the game', error);
        finish({ kind: 'failed' });
        return;
      }
      if (next >= turns.length)
        finish({ kind: 'done', mistakes: biggestMistakes(graded), graded: graded.length });
      else timer = setTimeout(step, 0);
    };
    timer = setTimeout(step, 0);
    return () => clearTimeout(timer);
  }, [flow, players, analyzer]);

  return result !== null && result.flow === flow ? result.review : BUSY;
}
