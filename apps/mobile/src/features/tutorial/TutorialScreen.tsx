/**
 * The first-run tutorial (#128): seven short lessons in Portes on the real
 * board (`InteractiveBoard`), with fixed positions and fixed dice.
 *
 * Each lesson has one line of text, a ring on the checker to touch and,
 * after the checker is picked, the target ring. A wrong touch shakes the
 * text and shows a hint (no shake with Reduce motion on). After success,
 * **Next**. **Skip** is always there. The end card offers the first game.
 *
 * The lessons and their rules live in `lessons.ts`; the engine decides
 * what is legal. This screen only shows them. The route sends analytics
 * and saves the tutorial status (callbacks).
 */
import {
  applyMoveToBoard,
  currentBoard,
  remainingDice,
  type GameFlow,
  type Move,
} from '@tavli/engine';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { useBoardTheme } from '@/features/board/BoardCanvas';
import type { BoardView } from '@/features/board/boardModel';
import { DiceRow } from '@/features/board/DiceRow';
import { moveFlights, type Flight } from '@/features/board/flights';
import type { BoardGeometry } from '@/features/board/geometry';
import { InteractiveBoard } from '@/features/board/InteractiveBoard';
import { createGameFeedback, loadThemeSounds } from '@/features/feedback/feedback';
import { Celebration } from '@/features/game/Celebration';
import { diceView } from '@/features/game/gameStore';
import { useAnnouncement } from '@/features/game/useAnnouncement';

import { LESSONS, lessonMoves, playLessonMove, startLesson, type LessonId } from './lessons';

/** You play White, at the bottom. The board never turns. */
const VIEW: BoardView = { viewer: 'white', direction: 'contrary' };
/** One shake of the lesson text: left, right, left, back. */
const SHAKE = [-8, 8, -5, 0] as const;
const SHAKE_STEP_MS = 50;

export interface TutorialScreenProps {
  /** Lesson `step` (from 1) was learnt. */
  onLessonDone: (step: number, lesson: LessonId) => void;
  /** The last lesson was learnt: the end card shows. */
  onFinished: () => void;
  /** Skip was tapped on lesson `step`. */
  onSkip: (step: number, lesson: LessonId) => void;
  /** "Play your first game" on the end card. */
  onPlay: () => void;
  /** "Home" on the end card. */
  onHome: () => void;
}

export function TutorialScreen({
  onLessonDone,
  onFinished,
  onSkip,
  onPlay,
  onHome,
}: TutorialScreenProps) {
  const { t } = useTranslation();
  const theme = useBoardTheme();
  const reduceMotion = useReducedMotion();
  const feedback = useMemo(() => createGameFeedback({ theme }), [theme]);
  useEffect(() => {
    loadThemeSounds(theme);
  }, [theme]);

  const [index, setIndex] = useState(0);
  const [flow, setFlow] = useState<GameFlow>(() => startLesson(LESSONS[0]!));
  const [wrong, setWrong] = useState(0);
  const [flights, setFlights] = useState<readonly Flight[]>([]);
  const onFlightDone = useCallback(
    (id: string) => setFlights((old) => old.filter((f) => f.id !== id)),
    [],
  );

  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.get() }] }));

  const lesson = LESSONS[index];
  const done = lesson !== undefined && lesson.done(flow);
  // What a screen reader hears when it changes: the hint, or the success line.
  const status =
    lesson === undefined
      ? null
      : done
        ? t(`tutorial.lessons.${lesson.id}.done`)
        : wrong > 0
          ? t(`tutorial.lessons.${lesson.id}.hint`)
          : null;
  useAnnouncement(lesson === undefined ? t('tutorial.end.title') : status);

  const showWrong = () => {
    if (done) return;
    setWrong((n) => n + 1);
    feedback.event('invalidMove');
    if (reduceMotion) return;
    shake.set(withSequence(...SHAKE.map((x) => withTiming(x, { duration: SHAKE_STEP_MS }))));
  };

  const onMove = (move: Move, geo: BoardGeometry, from: { x: number; y: number } | null) => {
    if (lesson === undefined) return false;
    const next = playLessonMove(lesson, flow, move);
    if (next === null) {
      showWrong();
      return false;
    }
    const before = currentBoard(flow);
    setFlow(next);
    feedback.event(
      move.capture === 'hit' ? 'checkerHit' : move.to === 'off' ? 'bearOff' : 'checkerPlace',
    );
    // With Reduce motion on, checkers jump to their place: no flight.
    if (!reduceMotion) {
      const after = applyMoveToBoard(before, 'white', move, 'contrary');
      const added = moveFlights(geo, VIEW, 'white', move, before, after, {
        id: `t${index}:${next.played.length}`,
        ...(from ? { from } : {}),
      });
      setFlights((old) => [...old, ...added]);
    }
    if (lesson.done(next)) onLessonDone(index + 1, lesson.id);
    return true;
  };

  const goNext = () => {
    const nextIndex = index + 1;
    const nextLesson = LESSONS[nextIndex];
    setIndex(nextIndex);
    setWrong(0);
    setFlights([]);
    if (nextLesson) setFlow(startLesson(nextLesson));
    else onFinished();
  };

  if (lesson === undefined) {
    return (
      <View testID="tutorial-screen" style={styles.screen}>
        <View testID="tutorial-end" style={styles.end}>
          <Celebration kind="game" />
          <Text style={styles.endTitle} accessibilityRole="header">
            {t('tutorial.end.title')}
          </Text>
          <Text style={styles.body}>{t('tutorial.end.body')}</Text>
          <View style={styles.endButtons}>
            <ActionButton testID="tutorial-play" label={t('tutorial.end.play')} onPress={onPlay} />
            <ActionButton
              testID="tutorial-home"
              kind="text"
              label={t('tutorial.end.home')}
              onPress={onHome}
            />
          </View>
        </View>
      </View>
    );
  }

  const dice = diceView(lesson.dice, remainingDice(flow));
  const legal = lessonMoves(lesson, flow);

  return (
    <View testID="tutorial-screen" style={styles.screen}>
      <View style={styles.topBar}>
        <View style={styles.titles}>
          <Text style={styles.title} accessibilityRole="header">
            {t('tutorial.title')}
          </Text>
          <Text testID="tutorial-progress" style={styles.progress}>
            {t('tutorial.progress', { step: index + 1, count: LESSONS.length })}
          </Text>
        </View>
        <Pressable
          testID="tutorial-skip"
          accessibilityRole="button"
          accessibilityLabel={t('tutorial.skip')}
          accessibilityHint={t('tutorial.skipHint')}
          hitSlop={8}
          onPress={() => onSkip(index + 1, lesson.id)}
          style={({ pressed }) => [styles.skip, pressed && styles.pressed]}>
          <Text style={styles.skipText}>{t('tutorial.skip')}</Text>
        </Pressable>
      </View>

      <Animated.View testID="tutorial-card" style={[styles.card, shakeStyle]}>
        <Text style={styles.lessonTitle} accessibilityRole="header">
          {t(`tutorial.lessons.${lesson.id}.title`)}
        </Text>
        <Text style={styles.body}>{t(`tutorial.lessons.${lesson.id}.body`)}</Text>
        {status !== null ? (
          <Text
            testID={done ? 'tutorial-success' : 'tutorial-hint'}
            style={done ? styles.success : styles.hint}
            accessibilityLiveRegion="polite">
            {status}
          </Text>
        ) : null}
      </Animated.View>

      <View style={styles.boardArea}>
        <InteractiveBoard
          testID="tutorial-board"
          accessibilityLabel={t(`tutorial.lessons.${lesson.id}.board`)}
          theme={theme}
          board={currentBoard(flow)}
          view={VIEW}
          mover="white"
          legal={legal}
          positionKey={`${index}:${flow.played.length}`}
          flights={flights}
          onFlightDone={onFlightDone}
          onMove={onMove}
          onBoardTap={showWrong}
          onMissTap={showWrong}
          onIllegalDrop={showWrong}
          onPickUp={() => feedback.event('checkerPickUp')}
          cue
        />
      </View>

      <View style={styles.controls}>
        <View style={styles.diceSlot}>
          <DiceRow testID="tutorial-dice" theme={theme} dice={dice} rollKey={null} />
        </View>
        {done ? (
          <ActionButton testID="tutorial-next" label={t('tutorial.next')} onPress={goNext} grow />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    gap: theme.space.sm,
    backgroundColor: theme.colors.background,
    paddingTop: rt.insets.top + theme.space.xs,
    paddingBottom: Math.max(rt.insets.bottom, theme.space.sm),
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingHorizontal: theme.space.lg,
  },
  titles: {
    flex: 1,
  },
  title: {
    ...theme.type.title,
    color: theme.colors.text,
  },
  progress: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  skip: {
    minHeight: theme.touch.minTarget,
    minWidth: theme.touch.minTarget,
    justifyContent: 'center',
    paddingHorizontal: theme.space.md,
  },
  skipText: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
    textDecorationLine: 'underline',
  },
  pressed: {
    opacity: 0.7,
  },
  card: {
    gap: theme.space.xs,
    marginHorizontal: theme.space.lg,
    padding: theme.space.md,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  lessonTitle: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
  body: {
    ...theme.type.body,
    color: theme.colors.text,
  },
  hint: {
    ...theme.type.bodyStrong,
    color: theme.colors.accent,
  },
  success: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
  boardArea: {
    flex: 1,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    minHeight: theme.touch.button + theme.space.lg,
    paddingHorizontal: theme.space.lg,
  },
  diceSlot: {
    alignItems: 'center',
  },
  end: {
    flex: 1,
    justifyContent: 'center',
    gap: theme.space.lg,
    paddingHorizontal: theme.space.xl,
  },
  endTitle: {
    ...theme.type.title,
    color: theme.colors.text,
    textAlign: 'center',
  },
  endButtons: {
    gap: theme.space.sm,
  },
}));
