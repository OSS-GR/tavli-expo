/**
 * Which releases of What's new this phone has seen (#471), saved through
 * the `Storage` port under `WHATS_NEW_STORAGE_KEY`. Home shows its card
 * once when a newer release is in the app (`due`).
 *
 * The saved value is the date of the newest release seen. It holds no id
 * and no account. It never leaves the phone and never goes to analytics.
 *
 * - A new player (no consent answer saved yet) has seen everything: the
 *   consent screen calls `begin()` right before the first answer, which
 *   saves the newest release. A new player never hears of "new" things.
 * - A player who updates from a build before this page has a consent
 *   answer and no saved value: everything is new to them.
 * - A saved date that the list does not have (an older build after a
 *   newer one) counts as seen.
 *
 * A storage error is no problem: the card is only a nudge.
 */
import type { Storage } from '@tavli/contracts';

import { CONSENT_STORAGE_KEY } from '@/features/privacy/consent';
import { storage as appStorage } from '@/services';

import { RELEASES, type WhatsNewRelease } from './releases';

/** Storage key. The saved value is a release date, `YYYY-MM-DD`. */
export const WHATS_NEW_STORAGE_KEY = 'whatsNewSeen';

export interface WhatsNewSeen {
  /** True when the app has a release this phone has not seen. */
  due(): boolean;
  /** Marks every release seen (the card showed, or the page opened). */
  markSeen(): void;
  /**
   * Call right before the consent answer is saved: a new player has seen
   * everything. Does nothing once a value or a consent answer is saved.
   */
  begin(): void;
}

export function createWhatsNewSeen(
  storage: Storage,
  releases: readonly WhatsNewRelease[] = RELEASES,
): WhatsNewSeen {
  const newest = releases[0]?.date;
  const read = (): string | undefined => {
    try {
      return storage.getString(WHATS_NEW_STORAGE_KEY);
    } catch {
      return undefined;
    }
  };
  const answered = (): boolean => {
    try {
      return storage.getString(CONSENT_STORAGE_KEY) !== undefined;
    } catch {
      return false;
    }
  };
  const save = () => {
    if (newest === undefined) return;
    try {
      storage.setString(WHATS_NEW_STORAGE_KEY, newest);
    } catch {
      // Only a nudge: the card may show once more.
    }
  };
  return {
    due: () => {
      if (newest === undefined) return false;
      const saved = read();
      // No value: new to a player from before this page, nothing new
      // before the first consent answer.
      if (saved === undefined) return answered();
      // Seen only an older release: the newer ones are new. An unknown
      // date counts as seen.
      return releases.findIndex((release) => release.date === saved) > 0;
    },
    markSeen: save,
    begin: () => {
      // A player who answers again (a new consent text) keeps the card.
      if (read() === undefined && !answered()) save();
    },
  };
}

/** The app's What's new state, on the app's storage. */
export const whatsNewSeen = createWhatsNewSeen(appStorage);

/** Tests only: every release seen, so Home shows no card. */
export function markWhatsNewSeenForTest(): void {
  whatsNewSeen.markSeen();
}

/** Tests only: no saved value, as on a phone from before this page. */
export function forgetWhatsNewForTest(): void {
  appStorage.remove(WHATS_NEW_STORAGE_KEY);
}
