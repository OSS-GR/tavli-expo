/**
 * The reminder card on Home (#404): asks a guest to save the account, or
 * a player with no account to play a friend online. `useReminderCard`
 * (`features/reminders/`) picks when. On the last ask the second button
 * is "Don't ask again". A guest with online wins sees their count
 * (`wins`, from `GuestReminderCard`, #463).
 */
import { useTranslation } from 'react-i18next';

import type { ReminderKind } from '@/features/reminders/useReminderCard';

import { HomeBanner } from './HomeBanner';

export interface ReminderCardProps {
  readonly kind: ReminderKind;
  /** The last ask: the second button stops the asks. */
  readonly last: boolean;
  /** The guest's online match wins: more than 0 puts the count in the line. */
  readonly wins?: number;
  /** The list held only the newest games: the guest may have won more ("at least"). */
  readonly winsAtLeast?: boolean;
  /** Save my account, or Play a friend. */
  readonly onAccept: () => void;
  /** Keep playing as a guest, or Not now. */
  readonly onDismiss: () => void;
  /** Don't ask again (the last ask only). */
  readonly onStop: () => void;
}

export function ReminderCard({
  kind,
  last,
  wins = 0,
  winsAtLeast = false,
  onAccept,
  onDismiss,
  onStop,
}: ReminderCardProps) {
  const { t } = useTranslation();
  const guest = kind === 'guest';
  const guestLine =
    wins > 0
      ? t(winsAtLeast ? 'home.reminder.guest.winsAtLeast' : 'home.reminder.guest.wins', {
          count: wins,
        })
      : t('home.reminder.guest.body');
  return (
    <HomeBanner
      testID={`home-reminder-${kind}`}
      icon={guest ? 'keyRound' : 'globe'}
      title={guest ? t('home.reminder.guest.title') : t('home.reminder.offline.title')}
      line={guest ? guestLine : t('home.reminder.offline.body')}
      main={{
        testID: 'home-reminder-accept',
        label: guest ? t('home.reminder.guest.save') : t('home.reminder.offline.play'),
        onPress: onAccept,
      }}
      other={
        last
          ? { testID: 'home-reminder-stop', label: t('home.reminder.stop'), onPress: onStop }
          : {
              testID: 'home-reminder-dismiss',
              label: guest ? t('home.reminder.guest.dismiss') : t('home.reminder.offline.dismiss'),
              onPress: onDismiss,
            }
      }
    />
  );
}
