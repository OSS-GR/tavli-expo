/**
 * Runs the game review (#215) off the first render. Each turn is one
 * ranking of the Analyzer, and a game has many, so the screen first shows
 * a busy state. The work goes in small steps on timers (the replay, then
 * one turn per step), so the screen stays responsive, and it stops when
 * the screen goes away. The result is the same for the same game.
 *
 * An error while it grades is a bug in the app or the bot (#220). It goes
 * to the `CrashReporter` port with safe context only: the game, the
 * variant and the turn index. Never names, positions or moves. The port
 * drops every report until the player allows it (`features/privacy`).
 */
import type { Analyzer } from '@tavli/bot';
import type { CrashReporter, MatchGame } from '@tavli/contracts';
import type { MatchFlow, PlayerId } from '@tavli/engine';
import { useEffect, useState } from 'react';

import { crashReporter } from '@/services';

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

/** Where the review failed, for the crash report. No personal data. */
export interface ReviewFailure {
  /** The game picked for the match (`portes`, `tavli`, …). */
  readonly game: MatchGame;
  /** The variant of the game under review. */
  readonly variant: string;
  /** The index of the turn being graded; `null` when the replay failed. */
  readonly turn: number | null;
}

/**
 * Sends a failed review to the crash reporter. A reporter error is
 * dropped: the screen still shows "cannot be reviewed".
 */
export function reportReviewFailure(
  reporter: CrashReporter,
  error: unknown,
  failure: ReviewFailure,
): void {
  try {
    reporter.captureException(error, {
      tags: { feature: 'review', game: failure.game, variant: failure.variant },
      extra: { turn: failure.turn },
    });
  } catch (reportError) {
    console.warn('could not report the failed review', reportError);
  }
}

export function useGameReview(
  flow: MatchFlow,
  players: readonly PlayerId[],
  analyzer: Analyzer,
  game: MatchGame,
  reporter: CrashReporter = crashReporter,
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
      // The turn being graded; `null` while the log is replayed.
      let index: number | null = null;
      try {
        if (turns === null) turns = lastGameTurns(flow, players);
        else {
          index = next;
          const turn = turns[next];
          next += 1;
          const grade = turn === undefined ? null : gradeTurn(analyzer, turn);
          if (grade !== null) graded.push(grade);
        }
      } catch (error) {
        console.warn('could not review the game', error);
        const variant = (index === null ? undefined : turns?.[index])?.state.variant;
        reportReviewFailure(reporter, error, {
          game,
          variant: variant ?? flow.game.state.variant,
          turn: index,
        });
        finish({ kind: 'failed' });
        return;
      }
      if (next >= turns.length)
        finish({ kind: 'done', mistakes: biggestMistakes(graded), graded: graded.length });
      else timer = setTimeout(step, 0);
    };
    timer = setTimeout(step, 0);
    return () => clearTimeout(timer);
  }, [flow, players, analyzer, game, reporter]);

  return result !== null && result.flow === flow ? result.review : BUSY;
}
