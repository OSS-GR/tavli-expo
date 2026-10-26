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
import { matchPhase, type MatchFlow } from '@tavli/engine';
import type { ThemeManifest } from '@tavli/themes';
import { useEffect, useMemo } from 'react';

import {
  createGameFeedback,
  loadThemeSounds,
  type FeedbackEvent,
  type GameFeedback,
} from '@/features/feedback/feedback';

import type { GameStore, GameStoreState } from './gameStore';

/** The game events between two flows of the same match, oldest first. */
export function flowEvents(prev: MatchFlow, next: MatchFlow): FeedbackEvent[] {
  if (prev === next) return [];
  // A new match (rematch) has a new log: nothing to play.
  if (next.log[0] !== prev.log[0] || next.log.length < prev.log.length) return [];
  const out: FeedbackEvent[] = [];
  for (const e of next.log.slice(prev.log.length)) {
    if (e.type === 'roll' || e.type === 'rollOpening') {
      out.push('diceRoll');
    } else if (e.type === 'move') {
      const { capture, to } = e.move;
      if (capture === 'hit' || capture === 'pin') out.push('checkerHit');
      else if (to === 'off') out.push('bearOff');
      else out.push('checkerPlace');
    }
  }
  const before = matchPhase(prev);
  const after = matchPhase(next);
  if (after === 'match-over' && before !== 'match-over') {
    out.push('matchWin');
  } else if (after === 'game-over' && before !== 'game-over') {
    out.push('gameWin');
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
export function storeEvents(prev: GameStoreState, next: GameStoreState): FeedbackEvent[] {
  if (next.flow === prev.flow) return next.lastError !== null ? ['invalidMove'] : [];
  return flowEvents(prev.flow, next.flow);
}

/**
 * Plays sound and haptics for every change of `store`, with `theme`'s
 * sounds. Returns `event` for UI-only events such as `diceLand`.
 */
export function useGameFeedback(store: GameStore, theme: ThemeManifest): GameFeedback {
  const feedback = useMemo(() => createGameFeedback({ theme }), [theme]);
  useEffect(() => {
    loadThemeSounds(theme);
  }, [theme]);
  useEffect(
    () =>
      store.subscribe((next, prev) => {
        for (const event of storeEvents(prev, next)) feedback.event(event);
      }),
    [store, feedback],
  );
  return feedback;
}
