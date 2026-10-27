/**
 * The tutorial on the real board (`InteractiveBoard`), with fixed
 * positions and fixed dice: seven short lessons in Portes (#128, the
 * first-run tutorial), or four in Plakoto or Fevga (#149) or Asodio (#159,
 * `game`).
 *
 * Each lesson has one line of text, a ring on the checker to touch and,
 * after the checker is picked, the target ring. A wrong touch shakes the
 * text and shows a hint (no shake with Reduce motion on). After success,
 * **Next**. **Skip** is always there. The end card offers the first game.
 * With the move list on (a screen reader, or Settings), each lesson can
 * be played from its buttons too; they offer only the lesson's moves.
 * The Plakoto mother lesson ends with the "resign or play on" card
 * (`MotherLessonCard`) over the board. In Asodio the board marks the
 * checkers the quarter lock freezes, as in a real game.
 *
 * Landscape (#185): the screen turns with the phone. The lesson text, the
 * dice and Next sit in a column on the left; the classic wide board fills
 * the rest. The board keeps its place in the tree, so turning the phone
 * keeps a picked-up checker.
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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { MoveList } from '@/features/accessibility/MoveList';
import { useMoveListShown } from '@/features/accessibility/screenReader';
import { asodioMarks } from '@/features/board/asodio';
import { useBoardTheme } from '@/features/board/BoardCanvas';
import type { BoardView } from '@/features/board/boardModel';
import { DiceRow } from '@/features/board/DiceRow';
import { moveFlights, type Flight } from '@/features/board/flights';
import type { BoardGeometry } from '@/features/board/geometry';
import { InteractiveBoard } from '@/features/board/InteractiveBoard';
import { isLandscapeWindow } from '@/features/board/screenLayout';
import { createGameFeedback, loadThemeSounds } from '@/features/feedback/feedback';
import { Celebration } from '@/features/game/Celebration';
import { diceView } from '@/features/game/gameStore';
import { useAnnouncement } from '@/features/game/useAnnouncement';

import {
  LESSON_SETS,
  lessonDirection,
  lessonMoves,
  playLessonMove,
  startLesson,
  type LessonId,
  type TutorialGame,
} from './lessons';
import { MotherLessonCard } from './MotherLessonCard';

/** One shake of the lesson text: left, right, left, back. */
const SHAKE = [-8, 8, -5, 0] as const;
const SHAKE_STEP_MS = 50;

export interface TutorialScreenProps {
  /** The lesson set. Default: Portes. */
  game?: TutorialGame;
  /** Lesson `step` (from 1) was learnt. */
  onLessonDone: (step: number, lesson: LessonId) => void;
  /**
   * The last lesson was learnt. Runs at once, before Next, so leaving with
   * Back after the last move still counts as done.
   */
  onFinished: () => void;
  /** Skip was tapped on lesson `step`. */
  onSkip: (step: number, lesson: LessonId) => void;
  /** "Play your first game" on the end card. */
  onPlay: () => void;
  /** "Home" on the end card. */
  onHome: () => void;
}

/** The texts that differ per lesson set. Portes keeps its first keys. */
function setTexts(game: TutorialGame) {
  if (game === 'portes') {
    return {
      title: 'tutorial.title',
      skipHint: 'tutorial.skipHint',
      endTitle: 'tutorial.end.title',
      endBody: 'tutorial.end.body',
      play: 'tutorial.end.play',
    } as const;
  }
  return {
    title: `tutorial.games.${game}.title`,
    skipHint: `tutorial.games.${game}.skipHint`,
    endTitle: `tutorial.games.${game}.endTitle`,
    endBody: `tutorial.games.${game}.endBody`,
    play: `tutorial.games.${game}.play`,
  } as const;
}

export function TutorialScreen({
  game = 'portes',
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

  const lessons = LESSON_SETS[game];
  const texts = setTexts(game);
  // You play White, at the bottom. The board never turns.
  const direction = lessonDirection(game);
  const view: BoardView = useMemo(() => ({ viewer: 'white', direction }), [direction]);

  const [index, setIndex] = useState(0);
  const [flow, setFlow] = useState<GameFlow>(() => startLesson(lessons[0]!));
  const [wrong, setWrong] = useState(0);
  const [flights, setFlights] = useState<readonly Flight[]>([]);
  const onFlightDone = useCallback(
    (id: string) => setFlights((old) => old.filter((f) => f.id !== id)),
    [],
  );

  const showMoveList = useMoveListShown();
  // Portrait: the tall board, as before. Landscape: the classic wide board.
  const landscape = isLandscapeWindow(useWindowDimensions());
  // A checker in the air flies in the board's old place: it just lands.
  const [flightLandscape, setFlightLandscape] = useState(landscape);
  if (flightLandscape !== landscape) {
    setFlightLandscape(landscape);
    setFlights([]);
  }
  const geoRef = useRef<BoardGeometry | null>(null);
  const onGeometry = useCallback((geo: BoardGeometry) => {
    geoRef.current = geo;
  }, []);

  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.get() }] }));

  const lesson = lessons[index];
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
  useAnnouncement(lesson === undefined ? t(texts.endTitle) : status);

  const showWrong = () => {
    if (done) return;
    setWrong((n) => n + 1);
    feedback.event('invalidMove');
    if (reduceMotion) return;
    shake.set(withSequence(...SHAKE.map((x) => withTiming(x, { duration: SHAKE_STEP_MS }))));
  };

  /** A move from the board (`geo`) or from the move list (`geo` may be `null`: no flight). */
  const onMove = (move: Move, geo: BoardGeometry | null, from: { x: number; y: number } | null) => {
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
    if (!reduceMotion && geo !== null) {
      const after = applyMoveToBoard(before, 'white', move, direction);
      const added = moveFlights(geo, view, 'white', move, before, after, {
        id: `t${index}:${next.played.length}`,
        ...(from ? { from } : {}),
      });
      setFlights((old) => [...old, ...added]);
    }
    if (lesson.done(next)) {
      onLessonDone(index + 1, lesson.id);
      if (index === lessons.length - 1) onFinished();
    }
    return true;
  };

  const goNext = () => {
    const nextIndex = index + 1;
    const nextLesson = lessons[nextIndex];
    setIndex(nextIndex);
    setWrong(0);
    setFlights([]);
    if (nextLesson) setFlow(startLesson(nextLesson));
  };

  if (lesson === undefined) {
    return (
      <View testID="tutorial-screen" style={styles.screen(landscape)}>
        <View testID="tutorial-end" style={styles.end}>
          <Celebration kind="game" />
          <Text style={styles.endTitle} accessibilityRole="header">
            {t(texts.endTitle)}
          </Text>
          <Text style={styles.body}>{t(texts.endBody)}</Text>
          <View style={styles.endButtons}>
            <ActionButton testID="tutorial-play" label={t(texts.play)} onPress={onPlay} />
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
  // Plakoto: the "resign or play on" card after the mother is pinned.
  const motherCard = done && lesson.id === 'mother';
  const legal = lessonMoves(lesson, flow);
  const board = currentBoard(flow);
  // Asodio: the frozen checkers look darker. Other games have no marks.
  const marks = asodioMarks(board, flow.state.rules, view);

  const topBar = (
    <View style={styles.topBar}>
      <View style={styles.titles}>
        <Text style={styles.title} accessibilityRole="header">
          {t(texts.title)}
        </Text>
        <Text testID="tutorial-progress" style={styles.progress}>
          {t('tutorial.progress', { step: index + 1, count: lessons.length })}
        </Text>
      </View>
      <Pressable
        testID="tutorial-skip"
        accessibilityRole="button"
        accessibilityLabel={t('tutorial.skip')}
        accessibilityHint={t(texts.skipHint)}
        hitSlop={8}
        onPress={() => onSkip(index + 1, lesson.id)}
        style={({ pressed }) => [styles.skip, pressed && styles.pressed]}>
        <Text style={styles.skipText}>{t('tutorial.skip')}</Text>
      </Pressable>
    </View>
  );

  const card = (
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
  );

  const moveList = showMoveList ? (
    <MoveList
      testID="tutorial-move-list"
      legal={legal}
      onMove={(move) => onMove(move, geoRef.current, null)}
    />
  ) : null;

  const controls = (
    <View style={styles.controls}>
      <View style={styles.diceSlot}>
        <DiceRow testID="tutorial-dice" theme={theme} dice={dice} rollKey={null} />
      </View>
      {done ? (
        <ActionButton testID="tutorial-next" label={t('tutorial.next')} onPress={goNext} grow />
      ) : null}
    </View>
  );

  return (
    <View testID="tutorial-screen" style={styles.screen(landscape)}>
      {landscape ? (
        // The left column: the lesson scrolls when it is longer than the
        // screen is tall; the dice and Next stay at the bottom.
        <View testID="tutorial-side" style={styles.side}>
          {topBar}
          <ScrollView style={styles.sideScroll} alwaysBounceVertical={false}>
            {card}
          </ScrollView>
          {moveList}
          {controls}
        </View>
      ) : (
        <View style={styles.lead}>
          {topBar}
          {card}
        </View>
      )}

      <View style={styles.boardArea} collapsable={false}>
        {/* While the mother card covers the board, screen readers skip the board.
            It never flattens (`collapsable={false}`), so the board canvas keeps
            its native parent when those props change (#173). */}
        <View
          style={styles.boardLayer}
          collapsable={false}
          importantForAccessibility={motherCard ? 'no-hide-descendants' : 'auto'}
          accessibilityElementsHidden={motherCard}>
          <InteractiveBoard
            testID="tutorial-board"
            accessibilityLabel={t(`tutorial.lessons.${lesson.id}.board`)}
            theme={theme}
            layout={landscape ? 'classic' : 'tall'}
            board={board}
            view={view}
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
            onGeometry={onGeometry}
            marks={marks}
            cue
          />
        </View>
        {motherCard ? (
          // Scrolls when a small phone or a large font makes the card taller than the board.
          <ScrollView
            testID="tutorial-mother-overlay"
            style={styles.overlay}
            contentContainerStyle={styles.overlayContent}>
            <MotherLessonCard />
          </ScrollView>
        ) : null}
      </View>

      {landscape ? null : moveList}
      {landscape ? null : controls}
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  // Landscape keeps the notch, the round corners and the home bar free.
  screen: (landscape: boolean) => ({
    flex: 1,
    flexDirection: landscape ? 'row' : 'column',
    gap: theme.space.sm,
    backgroundColor: theme.colors.background,
    paddingTop: rt.insets.top + theme.space.xs,
    paddingBottom: Math.max(rt.insets.bottom, theme.space.sm),
    paddingLeft: landscape ? rt.insets.left : 0,
    paddingRight: landscape ? Math.max(rt.insets.right, theme.space.xs) : 0,
  }),
  lead: {
    gap: theme.space.sm,
  },
  // The left column in landscape (#185): room to read, the board gets the rest.
  side: {
    width: '38%',
    minWidth: 240,
    maxWidth: 340,
    gap: theme.space.sm,
  },
  sideScroll: {
    flexGrow: 0,
    flexShrink: 1,
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
  boardLayer: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: theme.space.sm,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    minHeight: theme.touch.button + theme.space.lg,
    paddingHorizontal: theme.space.lg,
    marginTop: 'auto',
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
