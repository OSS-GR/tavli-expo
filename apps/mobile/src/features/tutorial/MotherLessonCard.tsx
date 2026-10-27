/**
 * The Plakoto mother lesson (#149) ends with the card the app default
 * (`motherRule: "offerConcede"`) shows a player whose mother is pinned:
 * **Resign (lose 2)** or **Play on**, the same buttons as the game's
 * mother card (`GameScreen`). Here it is your opponent's card, so a tap
 * only says what that answer does. Nothing is played.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ActionButton } from '@/components/ActionButton';
import { GameCard } from '@/features/game/GameCard';

type Choice = 'resign' | 'playOn';

export function MotherLessonCard() {
  const { t } = useTranslation();
  const [choice, setChoice] = useState<Choice | null>(null);
  const outcome =
    choice === 'resign'
      ? t('tutorial.motherCard.resigned')
      : choice === 'playOn'
        ? t('tutorial.motherCard.playedOn')
        : null;
  return (
    <GameCard
      testID="tutorial-mother-card"
      title={t('tutorial.motherCard.title')}
      lines={[t('tutorial.motherCard.body'), ...(outcome === null ? [] : [outcome])]}>
      <ActionButton
        testID="tutorial-mother-resign"
        label={t('game.mother.resign')}
        kind="secondary"
        onPress={() => setChoice('resign')}
      />
      <ActionButton
        testID="tutorial-mother-play-on"
        label={t('game.mother.playOn')}
        kind="secondary"
        onPress={() => setChoice('playOn')}
      />
    </GameCard>
  );
}
