/**
 * The playing board: drag a checker, or tap it and then tap a target.
 *
 * - Touch down on a movable checker picks it up (UI thread). Its legal
 *   targets light up: a dashed ring and a ghost checker (wireframe 6c).
 * - Drag and drop on a target moves it. A drop anywhere else flies back
 *   with a short animation and a warning haptic.
 * - A tap selects a checker; a tap on one of its targets moves it.
 * - Moves, hits and undos fly as short animations (`flights.ts`).
 *
 * Hit-testing uses the same rects that draw the points (`geometry.ts`).
 * The gesture and the animations run on the UI thread; only the result of
 * a touch (select, move, cancel) goes to the JS thread.
 */
import type { BoardState, Move, PlayerId, SourceMoves } from '@tavli/engine';
import type { ThemeManifest } from '@tavli/themes';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { StyleSheet } from 'react-native-unistyles';

import { BoardCanvas, portraitLayout, useBoardSpace } from './BoardCanvas';
import { layoutBoard, type BoardView } from './boardModel';
import type { Flight } from './flights';
import { fitBoardWithShadow, type BoardGeometry } from './geometry';
import {
  TAP_SLOP,
  buildSources,
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
  /** A tap that did not touch a movable checker (e.g. tap the board to roll). */
  onBoardTap?: () => void;
  /** A checker was picked up / dropped where it may not go. */
  onPickUp?: () => void;
  onIllegalDrop?: () => void;
  testID?: string;
}

function highlightsFor(source: MovableSource | undefined): BoardHighlights | undefined {
  if (source === undefined) return undefined;
  const targets: Mark[] = source.targets.map((t) => ({
    key: t.key,
    x: t.landing.x,
    y: t.landing.y,
    r: t.r,
  }));
  return { select: source.checker, targets };
}

export function InteractiveBoard({
  theme,
  board,
  view,
  mover,
  legal,
  positionKey,
  flights,
  onFlightDone,
  onMove,
  onBoardTap,
  onPickUp,
  onIllegalDrop,
  testID,
}: InteractiveBoardProps) {
  const [size, onLayout] = useBoardSpace();
  const geo = size ? fitBoardWithShadow(portraitLayout(theme), size) : null;
  const picture = geo ? layoutBoard(geo, board, view) : null;
  const sources = geo ? buildSources(geo, board, view, mover, legal) : [];

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
    const move = sources[source]?.targets[target]?.move;
    setSelected(null);
    if (move && geo && onMove(move, geo, from)) {
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

  const pan = usePanGesture({
    minDistance: 0,
    // Lets tests drive the gesture (createGestureController).
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
    onUpdate: (e) => {
      'worklet';
      const i = dragIndex.get();
      const s = sources[i];
      if (s === undefined) return;
      const dx = e.x - startX.get();
      const dy = e.y - startY.get();
      if (!dragging.get()) {
        if (dx * dx + dy * dy < TAP_SLOP * TAP_SLOP) return;
        dragging.set(true);
        dragVisible.set(1);
        scheduleOnRN(onDragStart, i);
      }
      dragX.set(s.checker.x + dx);
      dragY.set(s.checker.y + dy);
    },
    onFinalize: (e) => {
      'worklet';
      const dx = e.x - startX.get();
      const dy = e.y - startY.get();
      if (dragging.get()) {
        const i = dragIndex.get();
        const s = sources[i];
        if (e.canceled) {
          scheduleOnRN(onDragCanceled, i);
        } else {
          // The drop point is where the checker is, not where the finger started.
          const x = s ? s.checker.x + dx : e.x;
          const y = s ? s.checker.y + dy : e.y;
          scheduleOnRN(onDrop, i, x, y);
        }
      } else if (!e.canceled && dx * dx + dy * dy < TAP_SLOP * TAP_SLOP) {
        // Only a touch that stayed put is a tap; a swipe does nothing.
        scheduleOnRN(onTap, e.x, e.y);
      }
      dragging.set(false);
      dragIndex.set(-1);
    },
  });

  const current = selected === null ? undefined : sources[selected];
  const hidden = new Set<string>();
  for (const f of flights) if (f.hide) hidden.add(f.hide);
  if (dragKey) hidden.add(dragKey);

  return (
    <GestureDetector gesture={pan}>
      <View testID={testID} style={styles.space} onLayout={onLayout}>
        {size && geo && picture ? (
          <BoardCanvas
            theme={theme}
            geo={geo}
            size={size}
            picture={picture}
            hidden={hidden}
            {...(current ? { highlights: highlightsFor(current) } : {})}
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
