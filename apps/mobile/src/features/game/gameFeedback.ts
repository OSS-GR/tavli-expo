/**
 * Sound and haptics for what happens in a game.
 *
 * `flowEvents` reads the engine's event log: whatever sent the action (a
 * tap, a drag, the bot, a replay), a new move in the log plays its sound.
 * So the screens do not need a feedback call for each move.
 * `useGameFeedback` plays those events for a game store and preloads the
 * theme's sounds. UI-only events (a die lands, a checker is picked up) go
 * through the `event` function it returns.
 */
import { matchPhase, type MatchFlow, type MoveInput, type PlayerId } from '@tavli/engine';
import type { ThemeManifest } from '@tavli/themes';
import { useEffect, useMemo } from 'react';

import {
  createGameFeedback,
  loadThemeSounds,
  type FeedbackEvent,
  type GameFeedback,
} from '@/features/feedback/feedback';

import type { BoardStore, BoardStoreState } from './gameStore';

/** Both sides: in pass-and-play, every win is a person's win. */
const BOTH: readonly PlayerId[] = ['white', 'black'];

/**
 * A person won (not the bot, not a draw). The win jingle (`gameWin`,
 * `matchWin`) and the celebration on the end screens both use this.
 */
export function isHumanWin(
  winner: PlayerId | null | undefined,
  humans: readonly PlayerId[] = BOTH,
): boolean {
  return winner != null && humans.includes(winner);
}

/** The sound of one move: a hit (or pin), a bear-off, or a plain place. */
export function moveEvent({ capture, to }: Pick<MoveInput, 'capture' | 'to'>): FeedbackEvent {
  if (capture === 'hit' || capture === 'pin') return 'checkerHit';
  if (to === 'off') return 'bearOff';
  return 'checkerPlace';
}

/**
 * The game events between two flows of the same match, oldest first.
 *
 * `humans` are the sides a person plays. The win jingle plays only when one
 * of them wins: a bot's win or a draw plays no jingle.
 */
export function flowEvents(
  prev: MatchFlow,
  next: MatchFlow,
  humans: readonly PlayerId[] = BOTH,
): FeedbackEvent[] {
  if (prev === next) return [];
  // A new match (rematch) has a new log: nothing to play. An empty log
  // (an online view, #271) is the start of the next one.
  const newLog = prev.log.length > 0 && next.log[0] !== prev.log[0];
  if (newLog || next.log.length < prev.log.length) return [];
  const out: FeedbackEvent[] = [];
  for (const e of next.log.slice(prev.log.length)) {
    if (e.type === 'roll' || e.type === 'rollOpening') {
      out.push('diceRoll');
    } else if (e.type === 'move') {
      out.push(moveEvent(e.move));
    }
  }
  const before = matchPhase(prev);
  const after = matchPhase(next);
  if (after === 'match-over' && before !== 'match-over') {
    if (isHumanWin(next.match.winner, humans)) out.push('matchWin');
  } else if (after === 'game-over' && before !== 'game-over') {
    if (isHumanWin(next.match.games.at(-1)?.winner, humans)) out.push('gameWin');
  } else if (
    after === 'playing' &&
    next.game.phase === 'awaiting-roll' &&
    (prev.game.phase !== 'awaiting-roll' || prev.game.state.toMove !== next.game.state.toMove)
  ) {
    out.push('turnStart');
  }
  return out;
}

/** The events of one store update. A refused action (same flow, an error) is `invalidMove`. */
export function storeEvents(
  prev: BoardStoreState,
  next: BoardStoreState,
  humans: readonly PlayerId[] = BOTH,
): FeedbackEvent[] {
  if (next.flow === prev.flow) return next.lastError !== null ? ['invalidMove'] : [];
  return flowEvents(prev.flow, next.flow, humans);
}

/** An event that plays `at` ms after the store update (online, #271). */
export interface TimedEvent {
  readonly event: FeedbackEvent;
  readonly at: number;
}

/**
 * Picks the events of one store update, oldest first. Default:
 * `storeEvents`. A plain event plays at once; a `TimedEvent` later.
 */
export type StoreEventsOf = (
  prev: BoardStoreState,
  next: BoardStoreState,
  humans: readonly PlayerId[],
) => readonly (FeedbackEvent | TimedEvent)[];

/**
 * Plays sound and haptics for every change of `store`, with `theme`'s
 * sounds. Returns `event` for UI-only events such as `diceLand`.
 * `humans`: the sides a person plays (default both, for pass-and-play).
 * `eventsOf` reads the events of one update: an online game passes its
 * own (`features/online/onlineFeedback.ts`, #271).
 */
export function useGameFeedback(
  store: BoardStore,
  theme: ThemeManifest,
  humans: readonly PlayerId[] = BOTH,
  eventsOf: StoreEventsOf = storeEvents,
): GameFeedback {
  const feedback = useMemo(() => createGameFeedback({ theme }), [theme]);
  useEffect(() => {
    loadThemeSounds(theme);
  }, [theme]);
  useEffect(() => {
    // Timed events still to play. They stop with the screen.
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const unsubscribe = store.subscribe((next, prev) => {
      for (const item of eventsOf(prev, next, humans)) {
        if (typeof item === 'string' || item.at <= 0) {
          feedback.event(typeof item === 'string' ? item : item.event);
          continue;
        }
        const timer = setTimeout(() => {
          timers.delete(timer);
          feedback.event(item.event);
        }, item.at);
        timers.add(timer);
      }
    });
    return () => {
      unsubscribe();
      for (const timer of timers) clearTimeout(timer);
    };
  }, [store, feedback, humans, eventsOf]);
  return feedback;
}
