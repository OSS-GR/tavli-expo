/**
 * The reminder card on Home (#404): asks a guest to save the account, or
 * a player with no account to play a friend online. `useReminderCard`
 * (`features/reminders/`) picks when. On the last ask the second button
 * is "Don't ask again".
 */
import { useTranslation } from 'react-i18next';

import type { ReminderKind } from '@/features/reminders/useReminderCard';

import { HomeBanner } from './HomeBanner';

export interface ReminderCardProps {
  readonly kind: ReminderKind;
  /** The last ask: the second button stops the asks. */
  readonly last: boolean;
  /** Save my account, or Play a friend. */
  readonly onAccept: () => void;
  /** Keep playing as a guest, or Not now. */
  readonly onDismiss: () => void;
  /** Don't ask again (the last ask only). */
  readonly onStop: () => void;
}

export function ReminderCard({ kind, last, onAccept, onDismiss, onStop }: ReminderCardProps) {
  const { t } = useTranslation();
  const guest = kind === 'guest';
  return (
    <HomeBanner
      testID={`home-reminder-${kind}`}
      icon={guest ? 'keyRound' : 'globe'}
      title={guest ? t('home.reminder.guest.title') : t('home.reminder.offline.title')}
      line={guest ? t('home.reminder.guest.body') : t('home.reminder.offline.body')}
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
