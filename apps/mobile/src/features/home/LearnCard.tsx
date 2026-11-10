/**
 * "Learn to play" on Home (#128): offers the tutorial until the player
 * finishes it or taps "Not now". Settings and the rules page open it again.
 */
import { useTranslation } from 'react-i18next';

import { HomeBanner } from './HomeBanner';

export interface LearnCardProps {
  onStart: () => void;
  onDismiss: () => void;
}

export function LearnCard({ onStart, onDismiss }: LearnCardProps) {
  const { t } = useTranslation();
  return (
    <HomeBanner
      testID="home-learn"
      icon="graduation"
      title={t('home.learn.title')}
      line={t('home.learn.subtitle')}
      main={{ testID: 'home-learn-start', label: t('home.learn.start'), onPress: onStart }}
      other={{ testID: 'home-learn-dismiss', label: t('home.learn.dismiss'), onPress: onDismiss }}
    />
  );
}
