/**
 * Which reminder card Home shows on this visit (#404), if any.
 *
 * Each time Home comes into view (`focused`), it checks once:
 *
 * - A phone with an online account (`hasOnlineAccount`) loads the session.
 *   A saved account (a key) stops the reminders for good. A guest gets the
 *   guest card ("Save your online games?"). Save opens Settings → Account,
 *   where every phone can add an email key (#433), and an iPhone Apple's.
 *   A guest from before #404 starts the clock here. No session, or no
 *   answer from the server: no card.
 * - A phone with no account gets the offline card ("Play online?"), only
 *   in a build with online play.
 * - A card shows only when an ask is due, and uses it as it shows: at
 *   most one card per visit. It goes when Home leaves the view.
 *
 * The card never shows over a game or a sheet: only on Home in view.
 */
import type { AuthProvider } from '@tavli/contracts';
import { useEffect, useState } from 'react';

import { hasOnlineAccount } from '@/features/online/accountHint';

import type { Reminders } from './reminders';
import { isLastAsk } from './schedule';

export type ReminderKind = 'guest' | 'offline';

export interface ReminderCardState {
  readonly kind: ReminderKind;
  /** The last ask: the card offers "Don't ask again". */
  readonly last: boolean;
}

export interface ReminderCardOptions {
  /** Home is in view. */
  readonly focused: boolean;
  readonly reminders: Reminders;
  /** `undefined`: this build has no online play. */
  readonly auth: AuthProvider | undefined;
}

export interface ReminderCard {
  readonly card: ReminderCardState | null;
  /** Hides the card (its main button, or Not now). */
  readonly hide: () => void;
  /** "Don't ask again". */
  readonly stop: () => void;
}

export function useReminderCard({ focused, reminders, auth }: ReminderCardOptions): ReminderCard {
  const [card, setCard] = useState<ReminderCardState | null>(null);

  useEffect(() => {
    if (!focused) return;
    let live = true;
    void pickCard(reminders, auth).then((kind) => {
      if (!live || kind === null || !reminders.due()) return;
      const last = isLastAsk(reminders.state());
      reminders.ask();
      setCard({ kind, last });
    });
    // Home left the view: the card goes, and a late answer shows nothing.
    return () => {
      live = false;
      setCard(null);
    };
  }, [focused, reminders, auth]);

  return {
    card,
    hide: () => setCard(null),
    stop: () => {
      reminders.stop();
      setCard(null);
    },
  };
}

/** The card this phone would get now, or `null`. Uses no ask. */
async function pickCard(
  reminders: Reminders,
  auth: AuthProvider | undefined,
): Promise<ReminderKind | null> {
  if (auth === undefined || reminders.state().stopped) return null;
  if (!hasOnlineAccount()) return reminders.due() ? 'offline' : null;
  const user = await auth.ready().catch(() => null);
  if (user === null) return null;
  if (!user.isGuest) {
    reminders.stop();
    return null;
  }
  reminders.start();
  return reminders.due() ? 'guest' : null;
}
