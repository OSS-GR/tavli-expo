/**
 * Dice throw spike (#183), dev board screen only: swipe to throw two dice
 * onto the board.
 *
 * 1. The RNG rolls the dice first (`rollDice`).
 * 2. `planThrow` works out a path that ends on those values: the dice come
 *    in from the wall behind the throw, fly the way the finger went, as fast
 *    as it went (clamped), bounce off the walls of the field and stop.
 *    Where the finger was does not matter (`swipeToThrow`), so a swipe may
 *    start anywhere in this view, also under the board.
 * 3. Reanimated plays the plan back on the UI thread; a knock (sound and
 *    haptic, `features/feedback`) plays on each hit.
 *
 * A tap on the board, or the Roll button, throws too. The button is the
 * path for screen readers and for players who do not want to swipe. With
 * Reduce Motion on, the dice show at rest at once.
 *
 * Gestures follow the board rules (#174, #186): one touch is never both a
 * swipe and a tap. The pan covers the whole view and the tap only the
 * board; on nested views the first to activate cancels the other. The dice
 * roll in the field that holds the theme's dice area, on the tall or the
 * classic board (`throwField`).
 */
import { rollDice, type BoardState, type Dice, type Rng } from '@tavli/engine';
import type { ThemeManifest } from '@tavli/themes';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { GestureDetector, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import { Easing, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';
import { scheduleOnRN } from 'react-native-worklets';

import { ActionButton } from '@/components/ActionButton';
import {
  BoardCanvas,
  boardLayout,
  useBoardSpace,
  useBoardTheme,
  useHomeBoardSide,
} from '@/features/board/BoardCanvas';
import { layoutBoard, type BoardMarks, type BoardView } from '@/features/board/boardModel';
import { fitBoardWithShadow } from '@/features/board/geometry';
import { boardModeOf, useScreenLayout } from '@/features/board/screenLayout';
import { BOARD_GESTURES } from '@/features/board/interaction';
import {
  createGameFeedback,
  loadThemeSounds,
  type GameFeedback,
} from '@/features/feedback/feedback';
import { useAnnouncement } from '@/features/game/useAnnouncement';
import type { BoardLayoutMode } from '@/features/settings/settings';

import { boardThrowBox, throwBar, throwDieSize } from './throwField';
import {
  buttonThrow,
  hitCues,
  planThrow,
  restPlan,
  swipeToThrow,
  type Box,
  type ThrowBar,
  type ThrowPlan,
  type ThrowStart,
} from './throwPath';
import { ThrownDie } from './ThrownDie';

export interface DiceThrowBoardProps {
  board: BoardState;
  view: BoardView;
  marks?: BoardMarks;
  /** Where the dice come from. The animation never picks a value. */
  rng: Rng;
  /** Draw with this theme instead of the one in Settings. */
  theme?: ThemeManifest;
  /** The tall or the classic board. Default: the one picked in Settings (#184). */
  layout?: BoardLayoutMode;
  /** Sound and haptics. Default: the theme's, through `createGameFeedback`. */
  feedback?: GameFeedback;
  /** More controls under the Roll row. A swipe that starts on them throws too. */
  children?: ReactNode;
  testID?: string;
}

/**
 * Names each board this app run. `useAnnouncement` reads a keyed result
 * once per app run (#216), and the throw count starts again on a new board.
 */
let boardCount = 0;
const nextBoardKey = () => {
  boardCount += 1;
  return `throw-board-${boardCount}`;
};

interface Thrown {
  readonly key: number;
  readonly values: Dice;
  readonly plan: ThrowPlan;
}

export function DiceThrowBoard({
  board,
  view,
  marks,
  rng,
  theme: themeProp,
  layout: layoutProp,
  feedback: feedbackProp,
  children,
  testID = 'dice-throw',
}: DiceThrowBoardProps) {
  const { t } = useTranslation();
  const picked = useBoardTheme();
  const theme = themeProp ?? picked;
  const homeSide = useHomeBoardSide();
  // The Board layout setting; landscape draws the classic board (#185).
  const pickedLayout = boardModeOf(useScreenLayout().layout);
  const layout = layoutProp ?? pickedLayout;
  const [size, onLayout] = useBoardSpace();
  const geo = size ? fitBoardWithShadow(boardLayout(theme, layout, homeSide), size) : null;
  const reduceMotion = useReducedMotion();
  const feedback = useMemo(
    () => feedbackProp ?? createGameFeedback({ theme }),
    [feedbackProp, theme],
  );
  useEffect(() => {
    if (!feedbackProp) loadThemeSounds(theme);
  }, [feedbackProp, theme]);

  const [thrown, setThrown] = useState<Thrown | null>(null);
  const [resting, setResting] = useState(false);
  const turns = useRef(0);
  const [boardKey] = useState(nextBoardKey);
  const clock = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const throwFrom = (start: (box: Box, dieSize: number, bar?: ThrowBar) => ThrowStart) => {
    if (!geo) return;
    // The result first. The path is planned to land on it.
    const values = rollDice(rng);
    const box = boardThrowBox(geo);
    const dieSize = throwDieSize(geo);
    const bar = throwBar(geo);
    const tilt = geo.layout.dice.tilt;
    const input = {
      box,
      bar,
      start: start(box, dieSize, bar),
      dieSize,
      values,
      tilts: [tilt[0], tilt[1]] as const,
    };
    turns.current += 1;
    setResting(false);
    setThrown({
      key: turns.current,
      values,
      plan: reduceMotion ? restPlan(input) : planThrow(input),
    });
  };

  // Only the swipe's direction and speed count, not where it was.
  const onSwipe = (dx: number, dy: number, vx?: number, vy?: number) => {
    throwFrom((box, dieSize, bar) =>
      swipeToThrow(
        { x: dx, y: dy },
        vx === undefined || vy === undefined ? undefined : { x: vx, y: vy },
        box,
        dieSize,
        bar,
      ),
    );
  };
  const onButton = () => throwFrom((box) => buttonThrow(box, turns.current));

  // Play the plan: the clock runs from 0 to the end of the throw.
  const onRest = () => setResting(true);
  useEffect(() => {
    if (thrown === null) return;
    const { durationMs } = thrown.plan;
    feedback.event('diceRoll');
    const timers = hitCues(thrown.plan.hits).map((ms) =>
      setTimeout(() => feedback.event('diceLand'), ms),
    );
    clock.set(0);
    clock.set(
      withTiming(durationMs, { duration: durationMs, easing: Easing.linear }, (finished) => {
        'worklet';
        if (finished) scheduleOnRN(onRest);
      }),
    );
    return () => timers.forEach(clearTimeout);
    // Only a new throw restarts the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thrown?.key]);

  const result =
    thrown && resting
      ? t('dev.board.throw.result', { first: thrown.values[0], second: thrown.values[1] })
      : null;
  useAnnouncement(result, thrown ? `${boardKey}:${thrown.key}` : undefined);

  // A swipe throws. It covers the whole view, so it may start under the
  // board (on the Roll row or the controls). An active pan cancels a button
  // press under the finger, so a swipe that starts on a button only throws.
  // No spread inside the config: the Worklets plugin does not allow it (#174).
  const pan = usePanGesture({
    minDistance: BOARD_GESTURES.pan.minDistance,
    testID: `${testID}-pan`,
    onBegin: (e) => {
      'worklet';
      startX.set(e.x);
      startY.set(e.y);
    },
    onDeactivate: (e) => {
      'worklet';
      if (!e.canceled) {
        scheduleOnRN(onSwipe, e.x - startX.get(), e.y - startY.get(), e.velocityX, e.velocityY);
      }
    },
  });
  // A tap on the board throws too, like tap-to-roll on the game board. Only
  // on the board: an active tap would cancel the press of a button under it.
  const tap = useTapGesture({
    maxDistance: BOARD_GESTURES.tap.maxDistance,
    maxDuration: BOARD_GESTURES.tap.maxDuration,
    testID: `${testID}-tap`,
    onDeactivate: (e) => {
      'worklet';
      if (!e.canceled) scheduleOnRN(onButton);
    },
  });

  const dieSize = geo ? throwDieSize(geo) : 0;

  return (
    <GestureDetector gesture={pan}>
      <View testID={`${testID}-area`} style={styles.wrap}>
        <GestureDetector gesture={tap}>
          <View
            testID={testID}
            style={styles.space}
            onLayout={onLayout}
            accessible
            accessibilityRole="image"
            accessibilityLabel={t('dev.board.throw.boardLabel')}>
            {size && geo ? (
              <BoardCanvas
                theme={theme}
                geo={geo}
                size={size}
                picture={layoutBoard(geo, board, view, marks)}
                testID={`${testID}-canvas`}>
                {thrown
                  ? thrown.plan.dice.map((track, i) => (
                      <ThrownDie
                        key={`${thrown.key}-${i}`}
                        style={theme.dice}
                        track={track}
                        sampleMs={thrown.plan.sampleMs}
                        size={dieSize}
                        clock={clock}
                      />
                    ))
                  : null}
              </BoardCanvas>
            ) : null}
          </View>
        </GestureDetector>
        <View style={styles.row}>
          {/* Read out by `useAnnouncement` (both platforms), not by a live region. */}
          <Text testID={`${testID}-result`} style={styles.result}>
            {result ?? t('dev.board.throw.hint')}
          </Text>
          <ActionButton
            testID={`${testID}-roll`}
            label={t('dev.board.throw.roll')}
            disabled={!geo}
            onPress={onButton}
          />
        </View>
        {children}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    alignSelf: 'stretch',
  },
  space: {
    flex: 1,
    alignSelf: 'stretch',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.sm,
  },
  result: {
    ...theme.type.body,
    flex: 1,
    color: theme.colors.text,
  },
}));
