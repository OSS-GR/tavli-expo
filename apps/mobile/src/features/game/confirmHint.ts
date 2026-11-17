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
 *
 * The note for a die lost to the higher die rule (#579) works the same
 * way, with its own count (`lostDiceNote.higherDie`). A blocked die or the
 * rest of a double has no note (#596): the slashed die says it. Older
 * builds also saved `lostDiceNote.blocked` and `lostDiceNote.double`;
 * nothing reads them now.
 */
import { useEffect } from 'react';
import { createStore, useStore } from 'zustand';

import { storage } from '@/services';

export const CONFIRM_HINT_KEY = 'confirmHintTurns';

/** Turns that show each note. */
export const CONFIRM_HINT_TURNS = 3;

/** The notes that count their turns: "All dice used", and the higher die rule. */
export type TurnNote = 'confirm' | 'lost.higherDie';

const NOTES: readonly TurnNote[] = ['confirm', 'lost.higherDie'];

/** The storage key of a note's count. */
export function turnNoteKey(note: TurnNote): string {
  return note === 'confirm' ? CONFIRM_HINT_KEY : `lostDiceNote.${note.slice('lost.'.length)}`;
}

interface NoteState {
  /** Turns that showed the note, on this phone. */
  readonly count: number;
  /** The turn that shows it now, so it stays for that turn. */
  readonly shownFor: string | null;
}

type ConfirmHintState = Readonly<Record<TurnNote, NoteState>>;

function readCount(note: TurnNote): number {
  try {
    const saved = storage.getString(turnNoteKey(note));
    if (saved === undefined) return 0;
    // A bad value counts as done: the note is only a nudge.
    const count = Number(saved);
    return Number.isInteger(count) && count >= 0 ? count : CONFIRM_HINT_TURNS;
  } catch {
    return 0;
  }
}

function readAll(): ConfirmHintState {
  const all = {} as Record<TurnNote, NoteState>;
  for (const note of NOTES) all[note] = { count: readCount(note), shownFor: null };
  return all;
}

const confirmHintStore = createStore<ConfirmHintState>(() => readAll());

function noteShown(note: TurnNote, turnKey: string): void {
  const count = confirmHintStore.getState()[note].count + 1;
  confirmHintStore.setState({ [note]: { count, shownFor: turnKey } });
  try {
    storage.setString(turnNoteKey(note), String(count));
  } catch {
    // Only a note: it may show once more in the next app run.
  }
}

/**
 * True when `note` shows: `wanted` on one of the first turns, or on the
 * turn that already shows it. `turnKey` names the turn for the app run
 * (match, game and turn number). `null` for `note` never shows.
 */
export function useTurnNote(note: TurnNote | null, wanted: boolean, turnKey: string): boolean {
  const state = useStore(confirmHintStore, (s) => (note === null ? null : s[note]));
  const show =
    note !== null &&
    state !== null &&
    wanted &&
    (state.shownFor === turnKey || state.count < CONFIRM_HINT_TURNS);
  const shownFor = state?.shownFor ?? null;
  useEffect(() => {
    if (show && note !== null && shownFor !== turnKey) noteShown(note, turnKey);
  }, [show, note, shownFor, turnKey]);
  return show;
}

/** "All dice used": `wanted` is all dice played and Confirm is yours. */
export function useConfirmHint(wanted: boolean, turnKey: string): boolean {
  return useTurnNote('confirm', wanted, turnKey);
}

/** Tests: a new app run, which reads the saved counts. */
export function reloadConfirmHintForTest(): void {
  confirmHintStore.setState(readAll());
}

/** Tests: each test starts on a phone that never showed the notes. */
export function resetConfirmHintForTest(): void {
  for (const note of NOTES) storage.remove(turnNoteKey(note));
  reloadConfirmHintForTest();
}
