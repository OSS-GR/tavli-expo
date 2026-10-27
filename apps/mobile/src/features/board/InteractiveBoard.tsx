/**
 * The playing board: drag a checker, or tap it and then tap a target.
 *
 * - A selected or dragged checker gets a ring. Its legal targets light up:
 *   a dashed ring and a ghost checker (wireframe 6c).
 * - Drag and drop on a target moves it. A drop anywhere else flies back
 *   with a short animation and a warning haptic.
 * - A tap selects a checker; a tap on one of its targets moves it.
 * - With `paths` (#180) a checker also lights the targets it reaches with
 *   several dice ("2+3"). A tap or a drop there plays each step in order.
 * - Moves, hits and undos fly as short animations (`flights.ts`).
 *
 * Two gestures race (`BOARD_GESTURES`, #174): a pan for the drag and a tap
 * for tap-tap. Hit-testing uses the same rects that draw the points
 * (`geometry.ts`). The layout comes from `boardLayout`: the tall or the
 * classic board (`layout`, #184), mirrored with Settings → Home board on
 * the bottom left (#175), so the touches follow it. The gestures and the
 * animations run on the UI thread; only the result of a touch (select,
 * move, cancel) goes to the JS thread.
 */
import type { BoardState, Move, PlayerId, SourceMoves } from '@tavli/engine';
import type { ThemeManifest } from '@tavli/themes';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import {
  GestureDetector,
  useCompetingGestures,
  usePanGesture,
  useTapGesture,
} from 'react-native-gesture-handler';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { StyleSheet } from 'react-native-unistyles';

import type { BoardLayoutMode } from '@/features/settings/settings';

import { BoardCanvas, boardLayout, useBoardSpace, useHomeBoardSide } from './BoardCanvas';
import { layoutBoard, type BoardMarks, type BoardView } from './boardModel';
import type { MovePath } from './combined';
import type { Flight } from './flights';
import { fitBoardWithShadow, type BoardGeometry } from './geometry';
import {
  BOARD_GESTURES,
  buildSources,
  dragPoint,
  panEnd,
  pickSource,
  resolveDrop,
  resolveTap,
  type MovableSource,
} from './interaction';
import type { BoardHighlights, Mark } from './skia/BoardScene';
import { DragChecker, FlightChecker } from './skia/MovingCheckers';

/** Time for a dropped checker to fly back to where it came from. */
export const RETURN_MS = 160;

export interface InteractiveBoardProps {
  theme: ThemeManifest;
  /**
   * The tall board on its side (default: the tutorial) or the classic wide
   * board (the game screen with Settings → Board layout → Classic, #184).
   */
  layout?: BoardLayoutMode;
  /** The board as it is now (with the moves of this turn). */
  board: BoardState;
  view: BoardView;
  /** The player who may move now. */
  mover: PlayerId;
  /** Legal single moves now (`legalNextMoves`). Empty: nothing to touch. */
  legal: readonly SourceMoves[];
  /** Changes whenever the position or the legal moves change. Clears the selection. */
  positionKey: string;
  /** Checkers in the air (from the screen). */
  flights: readonly Flight[];
  onFlightDone: (id: string) => void;
  /**
   * A legal move was made. `from` is the drop point, or `null` for a tap.
   * Returns `false` if the move was not played (the checker flies back).
   */
  onMove: (move: Move, geo: BoardGeometry, from: { x: number; y: number } | null) => boolean;
  /**
   * One checker moved with several dice (#180, `flowPaths`): targets past
   * the single ones. Lit only with `onSteps`. Default: none (the tutorial).
   */
  paths?: readonly MovePath[];
  /**
   * A combined target was chosen: play `steps` in order. Same `from` as
   * `onMove`. Returns `false` if nothing was played (the checker flies back).
   */
  onSteps?: (
    steps: readonly Move[],
    geo: BoardGeometry,
    from: { x: number; y: number } | null,
  ) => boolean;
  /** A tap that did not touch a movable checker (e.g. tap the board to roll). */
  onBoardTap?: () => void;
  /** A checker was selected, and the next tap hit no target (the selection is dropped). */
  onMissTap?: () => void;
  /**
   * Ring every movable checker while none is selected: "touch this one"
   * (the tutorial). Off in a game, where most checkers can move.
   */
  cue?: boolean;
  /** A checker was picked up / dropped where it may not go. */
  onPickUp?: () => void;
  onIllegalDrop?: () => void;
  /** Called with the board geometry after each layout (the screen needs it for undo flights). */
  onGeometry?: (geo: BoardGeometry) => void;
  /** Extra marks: Asodio checkers frozen by the quarter lock. */
  marks?: BoardMarks;
  /** What a screen reader says for the board, e.g. which checkers are pinned. */
  accessibilityLabel?: string;
  testID?: string;
}

function highlightsFor(
  source: MovableSource | undefined,
  cues: readonly MovableSource[],
): BoardHighlights | undefined {
  if (source === undefined) {
    if (cues.length === 0) return undefined;
    return { select: null, targets: [], cues: cues.map((s) => s.checker) };
  }
  const targets: Mark[] = source.targets.map((t) => ({
    key: t.key,
    x: t.landing.x,
    y: t.landing.y,
    r: t.r,
    ...(t.moves.length > 1 ? { steps: t.moves.length } : {}),
  }));
  return { select: source.checker, targets };
}

export function InteractiveBoard({
  theme,
  layout = 'tall',
  board,
  view,
  mover,
  legal,
  positionKey,
  flights,
  onFlightDone,
  onMove,
  paths,
  onSteps,
  onBoardTap,
  onMissTap,
  cue = false,
  onPickUp,
  onIllegalDrop,
  onGeometry,
  marks,
  accessibilityLabel,
  testID,
}: InteractiveBoardProps) {
  const [size, onLayout] = useBoardSpace();
  const homeSide = useHomeBoardSide();
  const geo = useMemo(
    () => (size ? fitBoardWithShadow(boardLayout(theme, layout, homeSide), size) : null),
    [size, theme, layout, homeSide],
  );
  useEffect(() => {
    if (geo) onGeometry?.(geo);
  }, [geo, onGeometry]);
  const picture = geo ? layoutBoard(geo, board, view, marks) : null;
  const combined = onSteps && legal.length > 0 ? (paths ?? []) : [];
  const sources = geo ? buildSources(geo, board, view, mover, legal, combined) : [];

  // JS state: the selected source (tap-tap, or the one being dragged) and
  // the checker hidden while it is dragged. Both belong to one position:
  // when `positionKey` changes they are gone.
  const [selection, setSelection] = useState<{ key: string; source: number } | null>(null);
  const [drag, setDrag] = useState<{ key: string; checker: string } | null>(null);
  const selected = selection?.key === positionKey ? selection.source : null;
  const dragKey = drag?.key === positionKey ? drag.checker : null;
  const setSelected = (source: number | null) =>
    setSelection(source === null ? null : { key: positionKey, source });
  const setDragKey = (checker: string | null) =>
    setDrag(checker === null ? null : { key: positionKey, checker });

  // UI-thread state of the drag.
  const dragIndex = useSharedValue(-1);
  const dragging = useSharedValue(false);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const dragR = useSharedValue(1);
  const dragVisible = useSharedValue(0);

  // A dropped checker is replaced by its flight, or just lands (the move
  // that ends a turn has no flight). Hide the drag copy once the new
  // position shows. Only after a drop: a flight that lands while another
  // checker is dragged must not hide that one.
  const dropped = useRef(false);
  useEffect(() => {
    if (!dropped.current) return;
    dropped.current = false;
    dragVisible.set(0);
  }, [positionKey, flights, dragVisible]);

  const onReturned = () => {
    dragVisible.set(0);
    setDragKey(null);
  };

  // Fly the dragged checker back to where it came from, then show it again.
  const flyBack = (source: number) => {
    const home = sources[source]?.checker;
    if (home) {
      dragX.set(withTiming(home.x, { duration: RETURN_MS }));
      dragY.set(
        withTiming(home.y, { duration: RETURN_MS }, (finished) => {
          if (finished) scheduleOnRN(onReturned);
        }),
      );
    } else {
      onReturned();
    }
  };

  const doMove = (source: number, target: number, from: { x: number; y: number } | null) => {
    const moves = sources[source]?.targets[target]?.moves ?? [];
    const [move] = moves;
    setSelected(null);
    const played =
      move !== undefined &&
      geo !== null &&
      (moves.length > 1 ? (onSteps?.(moves, geo, from) ?? false) : onMove(move, geo, from));
    if (played) {
      if (from) dropped.current = true;
      setDragKey(null);
    } else if (from) {
      flyBack(source);
    }
  };

  const onTap = (x: number, y: number) => {
    const result = resolveTap(sources, selected, x, y);
    if (result.kind === 'move') {
      doMove(result.source, result.target, null);
    } else if (result.kind === 'select') {
      setSelected(result.source);
      onPickUp?.();
    } else {
      setSelected(null);
      if (sources.length === 0 || selected === null) onBoardTap?.();
      // A second tap on the selected checker only drops it; a tap elsewhere missed.
      else if (pickSource(sources, x, y, 0) !== selected) onMissTap?.();
    }
  };
  const onDragStart = (source: number) => {
    setSelected(source);
    setDragKey(sources[source]?.checker.key ?? null);
    onPickUp?.();
  };
  const onDrop = (source: number, x: number, y: number) => {
    const result = resolveDrop(sources, source, x, y);
    if (result.kind === 'move') {
      doMove(source, result.target, { x, y });
      return;
    }
    if (result.kind === 'illegal') onIllegalDrop?.();
    flyBack(source);
  };
  // The system took the touch away (a call, the app went to the background):
  // no move, the checker flies back.
  const onDragCanceled = (source: number) => {
    setSelected(null);
    flyBack(source);
  };

  // The drag. It activates only after the finger moves `TAP_SLOP`, so a
  // touch that stays put is left to the tap below.
  const pan = usePanGesture({
    // No spread here: the Worklets Babel plugin does not allow one in a gesture config.
    minDistance: BOARD_GESTURES.pan.minDistance,
    // Lets tests drive the gestures (`touch()` in test/gestureHandlerMock.tsx).
    testID: testID ? `${testID}-pan` : 'board-pan',
    onBegin: (e) => {
      'worklet';
      dragging.set(false);
      startX.set(e.x);
      startY.set(e.y);
      const i = pickSource(sources, e.x, e.y);
      dragIndex.set(i);
      const s = sources[i];
      if (s !== undefined) {
        dragX.set(s.checker.x);
        dragY.set(s.checker.y);
        dragR.set(s.checker.r);
      }
    },
    onActivate: (e) => {
      'worklet';
      const i = dragIndex.get();
      const s = sources[i];
      // A swipe that does not start on a movable checker does nothing.
      if (s === undefined) return;
      const p = dragPoint(s.checker, { x: startX.get(), y: startY.get() }, e);
      dragX.set(p.x);
      dragY.set(p.y);
      dragging.set(true);
      dragVisible.set(1);
      scheduleOnRN(onDragStart, i);
    },
    onUpdate: (e) => {
      'worklet';
      const s = sources[dragIndex.get()];
      if (!dragging.get() || s === undefined) return;
      const p = dragPoint(s.checker, { x: startX.get(), y: startY.get() }, e);
      dragX.set(p.x);
      dragY.set(p.y);
    },
    onFinalize: (e) => {
      'worklet';
      const i = dragIndex.get();
      const s = sources[i];
      const end = panEnd(dragging.get(), e.canceled);
      if (end === 'cancel') {
        scheduleOnRN(onDragCanceled, i);
      } else if (end === 'drop') {
        // The drop point is where the checker is, not where the finger is.
        const p = s ? dragPoint(s.checker, { x: startX.get(), y: startY.get() }, e) : e;
        scheduleOnRN(onDrop, i, p.x, p.y);
      }
      dragging.set(false);
      dragIndex.set(-1);
    },
  });

  // Tap-tap. It fails once the finger moves more than `TAP_SLOP` (then the
  // pan above takes over) or stays down longer than `TAP_MAX_MS`.
  const tap = useTapGesture({
    maxDistance: BOARD_GESTURES.tap.maxDistance,
    maxDuration: BOARD_GESTURES.tap.maxDuration,
    testID: testID ? `${testID}-tap` : 'board-tap',
    onDeactivate: (e) => {
      'worklet';
      if (!e.canceled) scheduleOnRN(onTap, e.x, e.y);
    },
  });

  // Race: the first gesture to activate cancels the other.
  const gesture = useCompetingGestures(pan, tap);

  const current = selected === null ? undefined : sources[selected];
  const highlights = highlightsFor(current, cue && !dragKey ? sources : []);
  const hidden = new Set<string>();
  for (const f of flights) if (f.hide) hidden.add(f.hide);
  if (dragKey) hidden.add(dragKey);

  return (
    <GestureDetector gesture={gesture}>
      <View
        testID={testID}
        style={styles.space}
        onLayout={onLayout}
        {...(accessibilityLabel
          ? { accessible: true, accessibilityLabel, accessibilityRole: 'image' as const }
          : {})}>
        {size && geo && picture ? (
          <BoardCanvas
            theme={theme}
            geo={geo}
            size={size}
            picture={picture}
            hidden={hidden}
            {...(highlights ? { highlights } : {})}
            testID={testID ? `${testID}-canvas` : undefined}>
            {flights.map((f) => (
              <FlightChecker key={f.id} theme={theme} flight={f} onDone={onFlightDone} />
            ))}
            <DragChecker
              theme={theme}
              owner={mover}
              x={dragX}
              y={dragY}
              r={dragR}
              visible={dragVisible}
            />
          </BoardCanvas>
        ) : null}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  space: {
    flex: 1,
    alignSelf: 'stretch',
  },
});
