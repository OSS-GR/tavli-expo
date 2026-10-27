/**
 * How to play a game (#112, #124): one page each for Portes, Plakoto, Fevga
 * and Asodio, and a short Tavli page (the match rotation).
 *
 * Each section has a header, so screen readers can jump between them, and
 * reads top to bottom. Nothing has a fixed height: the text wraps at large
 * font sizes and the page scrolls.
 */
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';

import {
  RULES_PAGES,
  TAVLI_GAMES,
  TAVLI_SECTION,
  isRulesGame,
  paragraphs,
  rulesTitleKey,
  type RulesGame,
  type RulesSection,
  type RulesVariant,
} from './content';
import { StartPicture } from './StartPicture';

export interface RulesScreenProps {
  /** `null`: an id with no rules page. */
  variant: RulesVariant | null;
  /** Opens the page of one game (links on the Tavli page). */
  onOpenRules: (game: RulesGame) => void;
}

export function RulesScreen({ variant, onOpenRules }: RulesScreenProps) {
  const { t } = useTranslation();
  return (
    <ScrollView
      testID="rules-screen"
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic">
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
