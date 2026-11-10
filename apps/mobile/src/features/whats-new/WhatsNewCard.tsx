/**
 * The one-time What's new card on Home (#471): after an update with new
 * entries, it opens the What's new page. `useWhatsNewCard` picks when.
 */
import { useTranslation } from 'react-i18next';

import { HomeBanner } from '@/features/home/HomeBanner';

export interface WhatsNewCardProps {
  /** Opens the What's new page. */
  readonly onOpen: () => void;
  /** Not now. */
  readonly onDismiss: () => void;
}

export function WhatsNewCard({ onOpen, onDismiss }: WhatsNewCardProps) {
  const { t } = useTranslation();
  return (
    <HomeBanner
      testID="home-whats-new"
      icon="sparkles"
      title={t('whatsNew.card.title')}
      line={t('whatsNew.card.body')}
      main={{ testID: 'home-whats-new-open', label: t('whatsNew.card.open'), onPress: onOpen }}
      other={{
        testID: 'home-whats-new-dismiss',
        label: t('whatsNew.card.dismiss'),
        onPress: onDismiss,
      }}
    />
  );
}
