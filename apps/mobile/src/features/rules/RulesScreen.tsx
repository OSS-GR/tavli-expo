/**
 * How to play a game (#112, #124): one page each for Portes, Plakoto, Fevga
 * and Asodio, and a short Tavli page (the match rotation).
 *
 * Each section has a header, so screen readers can jump between them, and
 * reads top to bottom. Nothing has a fixed height: the text wraps at large
 * font sizes and the page scrolls.
 */
import type { TutorialGame } from '@tavli/contracts';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { TUTORIAL_GAMES } from '@/features/match/routes';
import type { OtherVersion } from '@/features/match/setup';

import {
  RULES_PAGES,
  TAVLI_GAMES,
  TAVLI_SECTION,
  isRulesGame,
  paragraphs,
  rulesTitleKey,
  versionSection,
  type RulesGame,
  type RulesSection,
  type RulesVariant,
} from './content';
import { StartPicture } from './StartPicture';

export interface RulesScreenProps {
  /** `null`: an id with no rules page. */
  variant: RulesVariant | null;
  /**
   * The rules version of the game in play or chosen, when it is not the
   * default (#241, `parseRulesVersion`). A section on top says what it changes.
   */
  version?: OtherVersion | null;
  /** Opens the page of one game (links on the Tavli page). */
  onOpenRules: (game: RulesGame) => void;
  /**
   * Opens the lessons of a game: Portes (#128), Plakoto or Fevga (#149),
   * Asodio (#159). Shown on those four pages, not on the Tavli page.
   */
  onLearnToPlay?: (game: TutorialGame) => void;
}

/** The rules pages that have lessons on the board: every game, not the Tavli match. */
function tutorialGameOf(variant: RulesVariant | null): TutorialGame | null {
  return TUTORIAL_GAMES.find((game) => game === variant) ?? null;
}

export function RulesScreen({
  variant,
  version = null,
  onOpenRules,
  onLearnToPlay,
}: RulesScreenProps) {
  const { t } = useTranslation();
  const lessons = tutorialGameOf(variant);
  return (
    <ScrollView
      testID="rules-screen"
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic">
      {lessons !== null && onLearnToPlay ? (
        <ActionButton
          testID="rules-learn-to-play"
          kind="secondary"
          label={t('tutorial.openFromRules')}
          onPress={() => onLearnToPlay(lessons)}
        />
      ) : null}
      {isRulesGame(variant) && version !== null ? (
        <Section section={versionSection(version)} />
      ) : null}
      {isRulesGame(variant) ? (
        RULES_PAGES[variant].map((section) => (
          <Section key={section.id} section={section} game={variant} />
        ))
      ) : variant === 'tavli' ? (
        <>
          <Section section={TAVLI_SECTION} />
          <View style={styles.links}>
            {TAVLI_GAMES.map((game) => (
              <ActionButton
                key={game}
                testID={`rules-open-${game}`}
                kind="secondary"
                label={t(rulesTitleKey(game))}
                onPress={() => onOpenRules(game)}
              />
            ))}
          </View>
        </>
      ) : (
        <Text testID="rules-unknown" style={styles.body}>
          {t('rules.unknown')}
        </Text>
      )}
    </ScrollView>
  );
}

function Section({ section, game }: { section: RulesSection; game?: RulesGame }) {
  const { t } = useTranslation();
  const lines = paragraphs(section.body.map((key) => t(key)));
  return (
    <View testID={`rules-section-${section.id}`} style={styles.section}>
      <Text style={styles.heading} accessibilityRole="header">
        {t(section.title)}
      </Text>
      {section.picture && game ? <StartPicture game={game} /> : null}
      {lines.map((line, index) => (
        <View key={index} style={styles.line}>
          <Text
            style={styles.bullet}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants">
            {'•'}
          </Text>
          <Text style={styles.body}>{line}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    gap: theme.space.xl,
    paddingHorizontal: theme.space.xl,
    paddingTop: theme.space.lg,
    paddingBottom: Math.max(rt.insets.bottom, theme.space.xl),
  },
  section: {
    gap: theme.space.sm,
  },
  heading: {
    ...theme.type.title,
    color: theme.colors.text,
  },
  line: {
    flexDirection: 'row',
    gap: theme.space.sm,
  },
  bullet: {
    ...theme.type.body,
    color: theme.colors.accent,
  },
  body: {
    ...theme.type.body,
    flex: 1,
    color: theme.colors.text,
  },
  links: {
    gap: theme.space.md,
  },
}));
