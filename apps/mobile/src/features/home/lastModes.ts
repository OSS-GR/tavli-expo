/**
 * The modes of the player's last matches (#517, Figma 01d S6): Home offers
 * Play ranked in the hero to a player who mostly plays ranked.
 *
 * Saved through the `Storage` port under `LAST_MODES_STORAGE_KEY`: the
 * newest mode first, at most `LAST_MODES_KEPT`. It holds no id, no name
 * and no game. It never leaves the phone and never goes to analytics.
 *
 * A match counts when it starts: a New game (bot or pass-and-play), a
 * ranked match found, or a friend game from an invite. A storage error is
 * no problem: the hero only falls back to Play vs bot.
 */
import type { Storage } from '@tavli/contracts';

import { storage as appStorage } from '@/services';

export type PlayMode = 'bot' | 'local' | 'friend' | 'ranked';

const PLAY_MODES: readonly PlayMode[] = ['bot', 'local', 'friend', 'ranked'];

/** Storage key. The saved value is a JSON list of modes, newest first. */
export const LAST_MODES_STORAGE_KEY = 'home.lastModes';

/** How many matches the phone keeps. */
export const LAST_MODES_KEPT = 3;

/**
 * A ranked regular: the newest match was ranked, and so were at least two
 * of the last three.
 */
export function isRankedRegular(modes: readonly PlayMode[]): boolean {
  const last = modes.slice(0, LAST_MODES_KEPT);
  return last[0] === 'ranked' && last.filter((mode) => mode === 'ranked').length >= 2;
}

/** Reads a saved list; anything else is no list. */
export function parseModes(text: string | undefined): PlayMode[] {
  if (text === undefined) return [];
  try {
    const value: unknown = JSON.parse(text);
    if (!Array.isArray(value)) return [];
    return value
      .filter((mode): mode is PlayMode => PLAY_MODES.includes(mode as PlayMode))
      .slice(0, LAST_MODES_KEPT);
  } catch {
    return [];
  }
}

export interface LastModes {
  /**
   * Notes a match that starts now. With a `once` key (a game id), the same
   * key counts once per app run: a screen that finds the same match again
   * does not count it twice. The key is kept in memory only, never saved.
   */
  record(mode: PlayMode, once?: string): void;
  /** The saved modes, newest first. */
  modes(): PlayMode[];
  /** `isRankedRegular` of the saved modes. */
  rankedRegular(): boolean;
}

export function createLastModes(storage: Storage): LastModes {
  const modes = (): PlayMode[] => {
    try {
      return parseModes(storage.getString(LAST_MODES_STORAGE_KEY));
    } catch {
      return [];
    }
  };
  const counted = new Set<string>();
  return {
    modes,
    record: (mode, once) => {
      if (once !== undefined) {
        if (counted.has(once)) return;
        counted.add(once);
      }
      const next = [mode, ...modes()].slice(0, LAST_MODES_KEPT);
      try {
        storage.setString(LAST_MODES_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Only a hint for the hero.
      }
    },
    rankedRegular: () => isRankedRegular(modes()),
  };
}

/** The app's one instance, on the app storage. */
export const lastModes: LastModes = createLastModes(appStorage);

/** Tests start with no match noted. */
export function forgetLastModesForTest(): void {
  try {
    appStorage.remove(LAST_MODES_STORAGE_KEY);
  } catch {
    // The next test reads no list either way.
  }
}
