/**
 * "Continue game" on Home (wireframe 3): game, opponent, score, target and
 * time since the last save. The whole card is one target.
 */
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { ContinueSummary } from '@/features/match/summary';

export interface ContinueCardProps {
  summary: ContinueSummary;
  onPress: () => void;
}

export function ContinueCard({ summary, onPress }: ContinueCardProps) {
  const { t } = useTranslation();
  const title = t('home.continue.title');
  return (
    <Pressable
      testID="home-continue"
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${summary.game}, ${summary.status}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.play}>
        {/* U+25B6 U+FE0E: a play triangle as text, not the emoji. */}
        <Text style={styles.playIcon} importantForAccessibility="no">
          {'▶︎'}
        </Text>
      </View>
      <View style={styles.texts}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.line}>{summary.game}</Text>
        <Text style={styles.line}>{summary.status}</Text>
      </View>
      <Text style={styles.chevron} importantForAccessibility="no">
        {'›'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    padding: theme.space.lg,
    borderRadius: theme.radii.lg,
    borderWidth: 3,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface,
  },
  pressed: {
    opacity: 0.75,
  },
  play: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accent,
  },
  playIcon: {
    fontSize: 18,
    lineHeight: 22,
    color: theme.colors.onAccent,
  },
  texts: {
    flex: 1,
    gap: theme.space.xxs,
  },
  title: {
    ...theme.type.title,
    color: theme.colors.text,
  },
  line: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  chevron: {
    ...theme.type.title,
    color: theme.colors.textDim,
  },
}));
