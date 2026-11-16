/**
 * The tour's move page (#573): a Portes game at the start, your dice 4
 * and 2, the real board with its cue rings. Step 1, a move by tap (tap a
 * checker, then a lit point); step 2, a move by drag; step 3, Confirm.
 * A second move made the same way as the first goes back, with a hint to
 * try the other way. Undo takes a move back before Confirm. The engine
 * decides what is legal (`legalNextMoves`); the page adds no rule.
 *
 * With the move list on (a screen reader, or Settings), the moves can be
 * played from its buttons; each counts for the step still open.
 */
import {
  applyGameAction,
  applyMoveToBoard,
  currentBoard,
  legalNextMoves,
  remainingDice,
  type GameFlow,
  type Move,
} from '@tavli/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, useWindowDimensions, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { MoveList } from '@/features/accessibility/MoveList';
import { useMoveListShown } from '@/features/accessibility/screenReader';
import { useBoardTheme } from '@/features/board/BoardCanvas';
import { countIn, slotOfDestination, slotOfOrigin } from '@/features/board/boardModel';
import { DiceRow } from '@/features/board/DiceRow';
import { moveFlights, type Flight } from '@/features/board/flights';
import { stackPosition, type BoardGeometry, type ScreenPoint } from '@/features/board/geometry';
import { InteractiveBoard } from '@/features/board/InteractiveBoard';
import { spaceKeyFor } from '@/features/board/screenLayout';
import { createGameFeedback, loadThemeSounds } from '@/features/feedback/feedback';
import { diceView } from '@/features/game/gameStore';
import { useAnnouncement } from '@/features/game/useAnnouncement';

import { Finger, FINGER_MS } from './Finger';
import {
  TOUR_MOVE_DICE,
  TOUR_VIEW,
  moveSteps,
  startTourMove,
  wayWanted,
  type MoveWay,
} from './tourBoard';
import { TourSteps } from './TourSteps';

export interface TryMoveProps {
  /** The steps are done: Next may go on. Called once. */
  onDone: () => void;
}

const SHOW_STILL_MS = 4000;

/** Where the top checker of `move`'s origin sits, and where it lands. */
function movePoints(
  geo: BoardGeometry,
  flow: GameFlow,
  move: Move,
): { from: ScreenPoint; to: ScreenPoint } | null {
  const board = currentBoard(flow);
  const origin = slotOfOrigin(move.from, 'white', TOUR_VIEW);
  const target = slotOfDestination(move.to, 'white', TOUR_VIEW);
  if (origin.kind === 'tray' || target.kind === 'tray') return null;
  const fromCount = countIn(board, origin, TOUR_VIEW);
  const toCount = countIn(board, target, TOUR_VIEW);
  if (fromCount === 0) return null;
  return {
    from: stackPosition(geo, origin, fromCount, fromCount - 1),
    to: stackPosition(geo, target, toCount + 1, toCount),
  };
}

export function TryMove({ onDone }: TryMoveProps) {
  const { t } = useTranslation();
  const theme = useBoardTheme();
  const reduceMotion = useReducedMotion();
  const showMoveList = useMoveListShown();
  const feedback = useMemo(() => createGameFeedback({ theme }), [theme]);
  useEffect(() => {
    loadThemeSounds(theme);
  }, [theme]);
  const windowSize = useWindowDimensions();
  const spaceKey = spaceKeyFor('tall', windowSize);

  const [flow, setFlow] = useState<GameFlow>(startTourMove);
  const [ways, setWays] = useState<readonly MoveWay[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [hint, setHint] = useState<'tap' | 'drag' | null>(null);
  const [flights, setFlights] = useState<readonly Flight[]>([]);
  const [showing, setShowing] = useState(0);
  const onFlightDone = useCallback(
    (id: string) => setFlights((old) => old.filter((f) => f.id !== id)),
    [],
  );
  const geoRef = useRef<BoardGeometry | null>(null);
  const [geo, setGeo] = useState<BoardGeometry | null>(null);
  const onGeometry = useCallback((next: BoardGeometry) => {
    geoRef.current = next;
    setGeo(next);
  }, []);

  const steps = moveSteps(ways, confirmed);
  const done = steps.confirmed;
  useEffect(() => {
    if (done) onDone();
    // Once: `onDone` may change on each render of the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);
  const status = done
    ? t('tour.move.confirmed')
    : hint === 'tap'
      ? t('tour.move.tapHint')
      : hint === 'drag'
        ? t('tour.move.dragHint')
        : null;
  useAnnouncement(status);

  const legal = confirmed ? [] : legalNextMoves(flow);
  const canConfirm = !confirmed && flow.phase === 'awaiting-confirm';
  const canUndo = !confirmed && flow.played.length > 0;

  const onMove = (move: Move, at: BoardGeometry | null, from: ScreenPoint | null, list = false) => {
    if (confirmed) return false;
    const way: MoveWay = list ? 'list' : from === null ? 'tap' : 'drag';
    const wanted = wayWanted(ways, way);
    if (wanted !== null) {
      setHint(wanted);
      feedback.event('invalidMove');
      return false;
    }
    const before = currentBoard(flow);
    const next = applyGameAction(flow, { type: 'move', player: 'white', move });
    setFlow(next);
    setWays([...ways, way]);
    setHint(null);
    setShowing(0);
    feedback.event(move.capture === 'hit' ? 'checkerHit' : 'checkerPlace');
    if (!reduceMotion && at !== null) {
      const after = applyMoveToBoard(before, 'white', move, TOUR_VIEW.direction);
      const added = moveFlights(at, TOUR_VIEW, 'white', move, before, after, {
        id: `tour:${next.played.length}:${ways.length}`,
        ...(from ? { from } : {}),
      });
      setFlights((old) => [...old, ...added]);
    }
    return true;
  };

  const undo = () => {
    if (!canUndo) return;
    setFlow(applyGameAction(flow, { type: 'undo', player: 'white' }));
    setWays(ways.slice(0, -1));
    setFlights([]);
    setHint(null);
  };

  // "Show me": the next step's gesture, on the first legal move.
  const nextWay: 'tap' | 'drag' | null = !steps.tapped ? 'tap' : !steps.dragged ? 'drag' : null;
  const demo = (() => {
    if (geo === null || nextWay === null) return null;
    const move = legal[0]?.moves[0];
    return move ? movePoints(geo, flow, move) : null;
  })();
  useEffect(() => {
    if (showing === 0) return;
    const id = setTimeout(
      () => setShowing(0),
      reduceMotion ? SHOW_STILL_MS : FINGER_MS[nextWay ?? 'tap'],
    );
    return () => clearTimeout(id);
  }, [showing, reduceMotion, nextWay]);

  const dice = diceView(TOUR_MOVE_DICE, remainingDice(flow));
  const board = currentBoard(flow);

  return (
    <View style={styles.page}>
      <View style={styles.pad}>
        <TourSteps
          steps={[
            { id: 'tap', label: t('tour.move.stepTap'), done: steps.tapped },
            { id: 'drag', label: t('tour.move.stepDrag'), done: steps.dragged },
            { id: 'confirm', label: t('tour.move.stepConfirm'), done: steps.confirmed },
          ]}
        />
        {status !== null ? (
          <Text
            testID={done ? 'tour-move-done' : 'tour-move-hint'}
            style={done ? styles.done : styles.hint}>
            {status}
          </Text>
        ) : null}
        {showMoveList ? <Text style={styles.note}>{t('tour.move.screenReader')}</Text> : null}
      </View>
      <View style={styles.boardArea} collapsable={false}>
        {/* The board canvas keeps its native parent (#173). */}
        <View style={styles.boardLayer} collapsable={false}>
          <InteractiveBoard
            testID="tour-move-board"
            accessibilityLabel={t('tour.move.board')}
            theme={theme}
            layout="tall"
            spaceKey={spaceKey}
            board={board}
            view={TOUR_VIEW}
            mover="white"
            legal={legal}
            positionKey={`tour-move:${flow.played.length}:${String(confirmed)}`}
            flights={flights}
            onFlightDone={onFlightDone}
            onMove={(move, at, from) => onMove(move, at, from)}
            onGeometry={onGeometry}
            onIllegalDrop={() => feedback.event('invalidMove')}
            onPickUp={() => feedback.event('checkerPickUp')}
            cue
          />
          {showing > 0 && demo !== null && nextWay !== null ? (
            <Finger key={showing} kind={nextWay} from={demo.from} to={demo.to} />
          ) : null}
        </View>
      </View>
      {showMoveList ? (
        <MoveList
          testID="tour-move-list"
          legal={legal}
          onMove={(move) => onMove(move, geoRef.current, null, true)}
        />
      ) : null}
      <View style={[styles.pad, styles.controls]}>
        <DiceRow testID="tour-move-dice" theme={theme} dice={dice} rollKey={null} />
        <ActionButton
          testID="tour-undo"
          kind="secondary"
          icon="undo"
          label={t('game.controls.undoLabel')}
          disabled={!canUndo}
          onPress={undo}
        />
        <ActionButton
          testID="tour-confirm"
          label={t('game.controls.confirm')}
          disabled={!canConfirm}
          grow
          onPress={() => {
            setConfirmed(true);
            feedback.event('checkerPlace');
          }}
        />
      </View>
      {nextWay !== null && !showMoveList ? (
        <View style={styles.showMe}>
          <ActionButton
            testID="tour-show-me"
            kind="text"
            size="small"
            label={t('tour.showMe')}
            onPress={() => setShowing((n) => n + 1)}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  page: {
    flex: 1,
    gap: theme.space.sm,
  },
  pad: {
    paddingHorizontal: theme.space.lg,
    gap: theme.space.xs,
  },
  hint: {
    ...theme.type.bodyStrong,
    color: theme.colors.accent,
  },
  done: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
  note: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  boardArea: {
    flex: 1,
  },
  boardLayer: {
    flex: 1,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  showMe: {
    alignItems: 'center',
  },
}));
