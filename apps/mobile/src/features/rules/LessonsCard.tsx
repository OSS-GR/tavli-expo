/**
 * Lessons on the board, at the top of a game's How to play page (#571,
 * Figma frame 20): how many lessons there are and how many are done, and
 * one button: Start, Continue (the next lesson) or Play again.
 * `LessonDots` is the progress line the hub shows too.
 */
import type { TutorialGame } from '@tavli/contracts';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { CardFrame } from '@/components/SectionCard';
import { lessonsLearnt, lessonsOffer, type LessonProgress } from '@/features/tutorial/progress';

export interface LessonsCardProps {
  game: TutorialGame;
  /** How many lessons the set has. */
  count: number;
  progress: LessonProgress;
  /** Opens the lessons at lesson `start` (0-based). */
  onOpen: (game: TutorialGame, start: number) => void;
}

export function LessonsCard({ game, count, progress, onOpen }: LessonsCardProps) {
  const { t } = useTranslation();
  const offer = lessonsOffer(progress.status, progress.learnt, count);
  const learnt = lessonsLearnt(progress.status, progress.learnt, count);
  const line =
    learnt >= count
      ? t('rules.lessons.allDone', { total: count })
      : learnt > 0
        ? t('rules.lessons.someDone', { total: count, learnt })
        : t('rules.lessons.none', { total: count });
  return (
    <CardFrame testID="rules-lessons">
      <View style={styles.card}>
        <Text testID="rules-lessons-line" style={styles.line}>
          {line}
        </Text>
        <ActionButton
          testID="rules-lessons-button"
          kind={offer.kind === 'again' ? 'secondary' : 'primary'}
          label={t(`rules.lessons.${offer.kind}`)}
          onPress={() => onOpen(game, offer.kind === 'continue' ? offer.next : 0)}
        />
      </View>
    </CardFrame>
  );
}

/** The hub's progress line: "4 lessons", "1 of 4 lessons" or "Lessons done". */
export function hubProgressText(t: TFunction, count: number, progress: LessonProgress): string {
  const learnt = lessonsLearnt(progress.status, progress.learnt, count);
  return learnt >= count
    ? t('rules.hub.done')
    : learnt > 0
      ? t('rules.hub.some', { total: count, learnt })
      : t('rules.hub.none', { total: count });
}

/** One dot per lesson, the learnt ones filled, and a short line (the hub rows). */
export function LessonDots({ count, progress }: { count: number; progress: LessonProgress }) {
  const { t } = useTranslation();
  const learnt = lessonsLearnt(progress.status, progress.learnt, count);
  const text = hubProgressText(t, count, progress);
  return (
    <View style={styles.dots}>
      <View
        style={styles.dotRow}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        {Array.from({ length: count }, (_, i) => (
          <View key={i} style={styles.dot(i < learnt)} />
        ))}
      </View>
      <Text style={styles.dotText}>{text}</Text>
    </View>
  );
}

const DOT = 7;

const styles = StyleSheet.create((theme) => ({
  card: {
    gap: theme.space.md,
    padding: theme.space.lg,
  },
  line: {
    ...theme.type.body,
    color: theme.colors.textDim,
  },
  dots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingTop: theme.space.xs,
  },
  dotRow: {
    flexDirection: 'row',
    gap: 3,
  },
  dot: (filled: boolean) => ({
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 1,
    borderColor: filled ? theme.colors.accent : theme.colors.textDim,
    backgroundColor: filled ? theme.colors.accent : 'transparent',
  }),
  dotText: {
    ...theme.type.footnote,
    color: theme.colors.textDim,
  },
}));
