/**
 * The "All dice used. Confirm or undo." note (#575) shows on the first
 * `CONFIRM_HINT_TURNS` turns where it applies, then never again: after a
 * few turns the player knows Confirm and Undo, and the note is noise.
 *
 * The count of turns it showed is saved on this phone (the `Storage` port,
 * under `CONFIRM_HINT_KEY`). It holds no id, never leaves the phone and
 * never goes to analytics. Once the note shows in a turn, it stays for that
 * whole turn: an Undo and a new move neither hide it nor count it again.
 *
 * Screen readers lose nothing: the dice label says "0 left to play" and
 * Confirm is enabled. The note itself was never announced.
 */
import { useEffect } from 'react';
import { createStore, useStore } from 'zustand';

import { storage } from '@/services';

export const CONFIRM_HINT_KEY = 'confirmHintTurns';

/** Turns that show the note. */
export const CONFIRM_HINT_TURNS = 3;

interface ConfirmHintState {
  /** Turns that showed the note, on this phone. */
  readonly count: number;
  /** The turn that shows it now, so it stays for that turn. */
  readonly shownFor: string | null;
}

function readCount(): number {
  try {
    const saved = storage.getString(CONFIRM_HINT_KEY);
    if (saved === undefined) return 0;
    // A bad value counts as done: the note is only a nudge.
    const count = Number(saved);
    return Number.isInteger(count) && count >= 0 ? count : CONFIRM_HINT_TURNS;
  } catch {
    return 0;
  }
}

const confirmHintStore = createStore<ConfirmHintState>(() => ({
  count: readCount(),
  shownFor: null,
}));

function noteShown(turnKey: string): void {
  const count = confirmHintStore.getState().count + 1;
  confirmHintStore.setState({ count, shownFor: turnKey });
  try {
    storage.setString(CONFIRM_HINT_KEY, String(count));
  } catch {
    // Only a note: it may show once more in the next app run.
  }
}

/**
 * True when the note shows: `wanted` (all dice played, Confirm is yours)
 * on one of the first turns, or on the turn that already shows it.
 * `turnKey` names the turn for the app run (match, game and turn number).
 */
export function useConfirmHint(wanted: boolean, turnKey: string): boolean {
  const count = useStore(confirmHintStore, (s) => s.count);
  const shownFor = useStore(confirmHintStore, (s) => s.shownFor);
  const show = wanted && (shownFor === turnKey || count < CONFIRM_HINT_TURNS);
  useEffect(() => {
    if (show && shownFor !== turnKey) noteShown(turnKey);
  }, [show, shownFor, turnKey]);
  return show;
}

/** Tests: a new app run, which reads the saved count. */
export function reloadConfirmHintForTest(): void {
  confirmHintStore.setState({ count: readCount(), shownFor: null });
}

/** Tests: each test starts on a phone that never showed the note. */
export function resetConfirmHintForTest(): void {
  storage.remove(CONFIRM_HINT_KEY);
  reloadConfirmHintForTest();
}
