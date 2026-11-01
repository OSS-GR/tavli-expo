/**
 * "Continue game" on Home (wireframe 3, #342): the saved game's board as it
 * was left, then game, opponent, score, target and time since the last
 * save. The whole card is one target.
 */
import { displayCaps } from '@tavli/ui';
import { useTranslation } from 'react-i18next';

import type { ContinueSummary } from '@/features/match/summary';

import { HomeHero, type HeroBoard } from './HomeHero';

export interface ContinueCardProps {
  summary: ContinueSummary;
  /** The saved position. Without it the card has no picture. */
  board?: HeroBoard;
  onPress: () => void;
}

export function ContinueCard({ summary, board, onPress }: ContinueCardProps) {
  const { t } = useTranslation();
  const title = t('home.continue.title');
  return (
    <HomeHero
      testID="home-continue"
      eyebrow={displayCaps(title)}
      title={summary.game}
      lines={[summary.status]}
      action={t('home.continue.resume')}
      accessibilityLabel={`${title}, ${summary.game}, ${summary.status}`}
      {...(board ? { board } : {})}
      onPress={onPress}
    />
  );
}
