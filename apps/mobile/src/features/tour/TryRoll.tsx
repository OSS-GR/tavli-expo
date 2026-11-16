/**
 * The tour's roll page (#573): the real board and the real dice throw.
 * Step 1, tap Roll; step 2, swipe across the board. A tap on the board
 * rolls too, and counts as the tap. The dice are fixed (`TOUR_ROLLS`):
 * nothing is played. With a screen reader on, the swipe step is not
 * asked for (a screen reader takes the swipe), so Roll alone finishes
 * the page. "Show me" draws the swipe on the board.
 */
import type { DieValue } from '@tavli/engine';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, useWindowDimensions, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { useScreenReaderEnabled } from '@/features/accessibility/screenReader';
import { useBoardTheme } from '@/features/board/BoardCanvas';
import { boardDiceBox, settleTargets } from '@/features/board/boardDice';
import { DiceRow } from '@/features/board/DiceRow';
import type { BoardGeometry } from '@/features/board/geometry';
import { InteractiveBoard } from '@/features/board/InteractiveBoard';
import { spaceKeyFor } from '@/features/board/screenLayout';
import { BoardThrow, type ThrowSwipe } from '@/features/dice-throw/BoardThrow';
import { createGameFeedback, loadThemeSounds } from '@/features/feedback/feedback';
import { useAnnouncement } from '@/features/game/useAnnouncement';

import { Finger, FINGER_MS } from './Finger';
import { TOUR_ROLLS, TOUR_VIEW, tourBoard } from './tourBoard';
import { TourSteps } from './TourSteps';

export interface TryRollProps {
  /** The steps are done: Next may go on. Called once. */
  onDone: () => void;
}

const SHOW_STILL_MS = 4000;

function shownDice(values: readonly [DieValue, DieValue]) {
  const [a, b] = values;
  const all = a === b ? [a, a, a, a] : [a, b];
  return all.map((value) => ({ value, used: false }));
}

export function TryRoll({ onDone }: TryRollProps) {
  const { t } = useTranslation();
  const theme = useBoardTheme();
  const reduceMotion = useReducedMotion();
  const screenReader = useScreenReaderEnabled();
  const feedback = useMemo(() => createGameFeedback({ theme }), [theme]);
  useEffect(() => {
    loadThemeSounds(theme);
  }, [theme]);
  const board = useMemo(() => tourBoard(), []);
  const windowSize = useWindowDimensions();
  const spaceKey = spaceKeyFor('tall', windowSize);

  const [geo, setGeo] = useState<BoardGeometry | null>(null);
  const onGeometry = useCallback((next: BoardGeometry) => setGeo(next), []);
  const [tapped, setTapped] = useState(false);
  const [swiped, setSwiped] = useState(false);
  const [rolls, setRolls] = useState(0);
  const [throwing, setThrowing] = useState<{
    key: string;
    values: readonly [DieValue, DieValue];
    swipe: ThrowSwipe | null;
  } | null>(null);
  const [showing, setShowing] = useState(0);

  const last = rolls > 0 ? TOUR_ROLLS[(rolls - 1) % TOUR_ROLLS.length]! : null;
  const done = tapped && (swiped || screenReader);
  useEffect(() => {
    if (done) onDone();
    // Once: `onDone` may change on each render of the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);
  useAnnouncement(last ? t('tour.roll.rolled', { a: last[0], b: last[1] }) : null);

  const roll = (way: 'tap' | 'swipe', swipe: ThrowSwipe | null) => {
    if (throwing !== null) return;
    const values = TOUR_ROLLS[rolls % TOUR_ROLLS.length]!;
    setRolls(rolls + 1);
    if (way === 'tap') setTapped(true);
    else setSwiped(true);
    setShowing(0);
    if (!reduceMotion && geo !== null) setThrowing({ key: String(rolls), values, swipe });
  };

  // "Show me": the mark goes away by itself.
  useEffect(() => {
    if (showing === 0) return;
    const id = setTimeout(() => setShowing(0), reduceMotion ? SHOW_STILL_MS : FINGER_MS.swipe);
    return () => clearTimeout(id);
  }, [showing, reduceMotion]);

  const dice = last ? shownDice(last) : [];
  const diceBox = geo !== null && last ? boardDiceBox(geo, dice.length) : null;
  const settle =
    diceBox !== null
      ? settleTargets(diceBox, dice.length, theme.layouts['portrait-rotated'].dice.tilt)
      : null;

  return (
    <View style={styles.page}>
      <View style={styles.pad}>
        <TourSteps
          steps={[
            { id: 'tap', label: t('tour.roll.stepTap'), done: tapped },
            ...(screenReader
              ? []
              : [{ id: 'swipe', label: t('tour.roll.stepSwipe'), done: swiped }]),
          ]}
        />
        {done ? (
          <Text testID="tour-roll-done" style={styles.done}>
            {t('tour.roll.done')}
          </Text>
        ) : null}
      </View>
      <View style={styles.boardArea} collapsable={false}>
        {/* The board canvas keeps its native parent (#173). */}
        <View style={styles.boardLayer} collapsable={false}>
          <InteractiveBoard
            testID="tour-roll-board"
            accessibilityLabel={t('tour.roll.board')}
            theme={theme}
            layout="tall"
            spaceKey={spaceKey}
            board={board}
            view={TOUR_VIEW}
            mover="white"
            legal={[]}
            positionKey="tour-roll"
            flights={[]}
            onFlightDone={() => {}}
            onMove={() => false}
            onGeometry={onGeometry}
            onBoardTap={(at) => roll('tap', { x: at.x, y: at.y })}
            onBoardSwipe={(swipe) => roll('swipe', swipe)}
            overlay={
              throwing !== null && geo !== null ? (
                <BoardThrow
                  key={throwing.key}
                  theme={theme}
                  values={throwing.values}
                  swipe={throwing.swipe}
                  nearEnd="bottom"
                  settle={settle}
                  geo={geo}
                  feedback={feedback}
                  onDone={() => setThrowing(null)}
                />
              ) : null
            }
          />
          {diceBox ? (
            <View
              testID="tour-dice"
              pointerEvents="none"
              collapsable={false}
              style={[
                styles.dice,
                { left: diceBox.left, top: diceBox.top },
                throwing !== null && styles.hidden,
              ]}>
              <DiceRow
                theme={theme}
                dice={dice}
                rollKey={throwing !== null ? null : String(rolls)}
                rest={!reduceMotion}
                onLanded={() => feedback.event('diceLand')}
                size={diceBox.size}
                pairSize={diceBox.pairSize}
              />
            </View>
          ) : null}
          {showing > 0 && geo !== null ? (
            <Finger
              key={showing}
              kind="swipe"
              from={{ x: geo.x + geo.width * 0.5, y: geo.y + geo.height * 0.82 }}
              to={{ x: geo.x + geo.width * 0.55, y: geo.y + geo.height * 0.38 }}
            />
          ) : null}
        </View>
      </View>
      <View style={[styles.pad, styles.controls]}>
        <ActionButton
          testID="tour-roll-button"
          label={t('game.roll.dice')}
          icon="dices"
          grow
          onPress={() => roll('tap', null)}
        />
        {screenReader ? null : (
          <ActionButton
            testID="tour-show-me"
            kind="text"
            label={t('tour.showMe')}
            onPress={() => setShowing((n) => n + 1)}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  page: {
    flex: 1,
    gap: theme.space.sm,
  },
  boardArea: {
    flex: 1,
  },
  boardLayer: {
    flex: 1,
  },
  dice: {
    position: 'absolute',
  },
  hidden: {
    opacity: 0,
  },
  pad: {
    paddingHorizontal: theme.space.lg,
    gap: theme.space.xs,
  },
  done: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
  },
}));
