/**
 * Dice throw spike (#183), dev board screen only: swipe on the board to
 * throw two dice onto it.
 *
 * 1. The RNG rolls the dice first (`rollDice`).
 * 2. `planThrow` works out a path that ends on those values: the dice fly
 *    the way the finger went, as fast as it went (clamped), bounce off the
 *    walls of the field and stop.
 * 3. Reanimated plays the plan back on the UI thread; a knock (sound and
 *    haptic, `features/feedback`) plays on each hit.
 *
 * A tap on the board, or the Roll button, throws too. The button is the
 * path for screen readers and for players who do not want to swipe. With
 * Reduce Motion on, the dice show at rest at once.
 *
 * Gestures follow the board rules (#174, #186): a pan and a tap race, so
 * one touch is never both. The dice roll in the field that holds the
 * theme's dice area, on the tall or the classic board (`throwField`).
 */
import { rollDice, type BoardState, type Dice, type Rng } from '@tavli/engine';
import type { ThemeManifest } from '@tavli/themes';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import {
  GestureDetector,
  useCompetingGestures,
  usePanGesture,
  useTapGesture,
} from 'react-native-gesture-handler';
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
import { BOARD_GESTURES } from '@/features/board/interaction';
import {
  createGameFeedback,
  loadThemeSounds,
  type GameFeedback,
} from '@/features/feedback/feedback';
import { useAnnouncement } from '@/features/game/useAnnouncement';
import type { BoardLayoutMode } from '@/features/settings/settings';
import { useSettings } from '@/features/settings/store';

import { boardThrowBox, throwDieSize } from './throwField';
import {
  buttonThrow,
  hitCues,
  planThrow,
  restPlan,
  swipeToThrow,
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
  testID?: string;
}

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
  testID = 'dice-throw',
}: DiceThrowBoardProps) {
  const { t } = useTranslation();
  const picked = useBoardTheme();
  const theme = themeProp ?? picked;
  const homeSide = useHomeBoardSide();
  // The Board layout from Settings (`useBoardLayoutMode` went away in #199).
  const pickedLayout = useSettings((s) => s.boardLayout);
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
  const clock = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const throwFrom = (start: (box: ReturnType<typeof boardThrowBox>) => ThrowStart) => {
    if (!geo) return;
    // The result first. The path is planned to land on it.
    const values = rollDice(rng);
    const box = boardThrowBox(geo);
    const tilt = geo.layout.dice.tilt;
    const input = {
      box,
      start: start(box),
      dieSize: throwDieSize(geo),
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

  const onSwipe = (x: number, y: number, x0: number, y0: number, vx?: number, vy?: number) => {
    throwFrom((box) =>
      swipeToThrow(
        { x, y },
        vx === undefined || vy === undefined ? undefined : { x: vx, y: vy },
        { x: x - x0, y: y - y0 },
        box,
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
  useAnnouncement(result, String(thrown?.key ?? ''));

  // A swipe throws. No spread inside the config: the Worklets plugin does not allow it (#174).
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
        scheduleOnRN(onSwipe, e.x, e.y, startX.get(), startY.get(), e.velocityX, e.velocityY);
      }
    },
  });
  // A tap throws too, like tap-to-roll on the game board.
  const tap = useTapGesture({
    maxDistance: BOARD_GESTURES.tap.maxDistance,
    maxDuration: BOARD_GESTURES.tap.maxDuration,
    testID: `${testID}-tap`,
    onDeactivate: (e) => {
      'worklet';
      if (!e.canceled) scheduleOnRN(onButton);
    },
  });
  const gesture = useCompetingGestures(pan, tap);

  const dieSize = geo ? throwDieSize(geo) : 0;

  return (
    <View style={styles.wrap}>
      <GestureDetector gesture={gesture}>
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
    </View>
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
