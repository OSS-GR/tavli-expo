/**
 * The board screen's view of an online store (#255).
 *
 * `GameScreen` reads a `BoardStore`: a flow that is never `null`, a match
 * key, the last error and `dispatch`. This wraps an `OnlineStore` that has
 * its first view. The snapshot is cached, so a change of another field
 * (`sending`, `notice`, …) does not render the board again.
 *
 * The match key names the game (`online:<gameId>`), not the store: a new
 * store for the same game (the screen opened again) does not read the
 * same events again (#216).
 */
import type { MatchFlow } from '@tavli/engine';

import type { BoardStore, BoardStoreState } from '@/features/game/gameStore';

import type { OnlineStore, OnlineStoreState } from './onlineStore';

/** `null` until the store has its first view. */
export function onlineBoardStore(store: OnlineStore, gameId: string): BoardStore | null {
  const first = store.getState().flow;
  if (first === null) return null;
  const matchKey = `online:${gameId}`;
  const dispatch = store.getState().dispatch;
  let flow: MatchFlow = first;
  let snapshot: BoardStoreState = {
    flow,
    matchKey,
    lastError: store.getState().lastError,
    dispatch,
  };

  const read = (state: OnlineStoreState): BoardStoreState => {
    // A store keeps its flow once it has one; keep the last one just in case.
    const next = state.flow ?? flow;
    if (next !== snapshot.flow || state.lastError !== snapshot.lastError) {
      flow = next;
      snapshot = { flow: next, matchKey, lastError: state.lastError, dispatch };
    }
    return snapshot;
  };

  return {
    getState: () => read(store.getState()),
    getInitialState: () => read(store.getState()),
    // Each listener keeps the snapshot it saw last: another listener may
    // have read the new one first.
    subscribe: (listener) => {
      let seen = read(store.getState());
      return store.subscribe((state) => {
        const next = read(state);
        if (next === seen) return;
        const before = seen;
        seen = next;
        listener(next, before);
      });
    },
  };
}
