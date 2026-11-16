/**
 * How to play (#571, Figma frame 20): one place for the lessons and the
 * rules of every game. A row for the Tavli match, then one per game, each
 * with a short line and, for a game, its lesson progress. A row opens the
 * game's page (`RulesScreen`): the lessons on top, the rules below.
 *
 * Home's How to play link and Settings → Help open it (`/rules`). Rules in
 * a game or on New game open the game's page directly.
 */
import type { TutorialGame } from '@tavli/contracts';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { IconName } from '@/components/icons';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionCard, SectionRow } from '@/components/SectionCard';
import { LESSON_SETS } from '@/features/tutorial/lessons';
import type { LessonProgress } from '@/features/tutorial/progress';

import { RULES_GAMES, rulesTitleKey, type RulesVariant } from './content';
import { LessonDots, hubProgressText } from './LessonsCard';

/** One icon per game: Portes' doors, Plakoto's pin, Fevga's race, Asodio's quarters. */
const GAME_ICONS: Record<TutorialGame, IconName> = {
  portes: 'doorOpen',
  plakoto: 'layers',
  fevga: 'fastForward',
  asodio: 'chartPie',
};

export interface HowToPlayScreenProps {
  /** The lesson progress of each game. */
  progress: { readonly [G in TutorialGame]: LessonProgress };
  /** Opens a game's page, or the Tavli match page. */
  onOpen: (variant: RulesVariant) => void;
  onBack?: () => void;
}

export function HowToPlayScreen({ progress, onOpen, onBack }: HowToPlayScreenProps) {
  const { t } = useTranslation();
  return (
    <Screen>
      <ScreenHeader
        title={t('rules.hub.title')}
        {...(onBack ? { onBack } : {})}
        backLabel={t('common.back')}
        testID="how-to-play-back"
      />
      <ScrollView
        testID="how-to-play-screen"
        style={styles.scroll}
        contentContainerStyle={styles.content}>
        <SectionCard>
          <SectionRow
            testID="how-to-play-tavli"
            icon="dices"
            label={t('rules.hub.tavli')}
            hint={t('rules.hub.blurb.tavli')}
            onPress={() => onOpen('tavli')}
          />
          {RULES_GAMES.map((game) => (
            <SectionRow
              key={game}
              testID={`how-to-play-${game}`}
              icon={GAME_ICONS[game]}
              label={t(`games.${game}`)}
              hint={t(`rules.hub.blurb.${game}`)}
              below={<LessonDots count={LESSON_SETS[game].length} progress={progress[game]} />}
              accessibilityLabel={`${t(rulesTitleKey(game))}, ${t(`rules.hub.blurb.${game}`)}, ${hubProgressText(t, LESSON_SETS[game].length, progress[game])}`}
              onPress={() => onOpen(game)}
            />
          ))}
        </SectionCard>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  scroll: {
    flex: 1,
  },
  content: {
    gap: theme.space.md,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.sm,
    paddingBottom: rt.insets.bottom + theme.space.xl,
  },
}));
