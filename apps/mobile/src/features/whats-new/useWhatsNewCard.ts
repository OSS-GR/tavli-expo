/**
 * The one-time What's new card on Home (#471).
 *
 * Each time Home comes into view (`focused`), it checks once: when the app
 * has a release this phone has not seen (`seen.due()`), the card shows and
 * every release counts as seen at once, so it shows on this visit only. It
 * goes when Home leaves the view, or on its buttons.
 *
 * It is another prompt for the save reminders (#404): Home shows no
 * reminder card that day (`reminders.otherPrompt()`).
 */
import { useEffect, useState } from 'react';

import type { Reminders } from '@/features/reminders/reminders';

import type { WhatsNewSeen } from './seen';

export interface WhatsNewCardOptions {
  /** Home is in view. */
  readonly focused: boolean;
  readonly seen: WhatsNewSeen;
  readonly reminders: Pick<Reminders, 'otherPrompt'>;
}

export interface WhatsNewCard {
  /** The card shows now. */
  readonly shown: boolean;
  /** Hides the card (its main button, or Not now). */
  readonly hide: () => void;
}

export function useWhatsNewCard({ focused, seen, reminders }: WhatsNewCardOptions): WhatsNewCard {
  // Checks again when `focused` changes (React's "adjust state on a prop
  // change"). Home out of view: no card.
  const [visit, setVisit] = useState(() => ({ focused, shown: focused && seen.due() }));
  if (visit.focused !== focused) setVisit({ focused, shown: focused && seen.due() });
  const { shown } = visit;

  // The card shows: every release counts as seen, so it shows on this visit only.
  useEffect(() => {
    if (!shown) return;
    seen.markSeen();
    reminders.otherPrompt();
  }, [shown, seen, reminders]);

  return { shown, hide: () => setVisit((v) => ({ ...v, shown: false })) };
}
