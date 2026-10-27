/**
 * The board screen (wireframe 6): the board, the opening roll card and the
 * controls row. Game logic stays in the engine; this screen only sends
 * actions to the game store and shows the result.
 */
import { applyMoveToBoard, type Move, type PlayerId } from '@tavli/engine';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { useBoardTheme } from '@/features/board/BoardCanvas';
import type { BoardView } from '@/features/board/boardModel';
import { DiceRow } from '@/features/board/DiceRow';
import { moveFlights, type Flight } from '@/features/board/flights';
import type { BoardGeometry } from '@/features/board/geometry';
import { InteractiveBoard } from '@/features/board/InteractiveBoard';
import { useSettings } from '@/features/settings/store';

import { useGameFeedback } from './gameFeedback';
import { turnView, useGameStore, type GameStore } from './gameStore';
import { nextOpeningRoller, openingStatus } from './opening';
import { OpeningCard } from './OpeningCard';

/** How long the opening result stays on screen. */
export const OPENING_RESULT_MS = 1500;

export interface GameScreenProps {
  store: GameStore;
  /**
   * `perPlayer`: each player taps for their own opening die (pass-and-play).
   * `one`: one tap rolls both (vs bot).
   */
  openingTaps?: 'one' | 'perPlayer';
}

export function GameScreen({ store, openingTaps = 'perPlayer' }: GameScreenProps) {
  const { t } = useTranslation();
  const theme = useBoardTheme();
  const flow = useGameStore(store, (s) => s.flow);
  const dispatch = useGameStore(store, (s) => s.dispatch);
  const flipMode = useSettings((s) => s.boardFlipMode);
  const autoConfirm = useSettings((s) => s.autoConfirmMoves);
  // Sound and haptics: moves, rolls and wins play by themselves (from the engine log).
  const feedback = useGameFeedback(store, theme);

  const view = useMemo(() => turnView(flow), [flow]);
  const { game, phase } = view;
  const names = flow.match.players;
  const gameKey = String(flow.match.games.length);

  // Pass-and-play "flip": the player to move sits at the bottom.
  const viewer: PlayerId = flipMode === 'flip' && phase !== 'opening-roll' ? view.toMove : 'white';
  const boardView: BoardView = { viewer, direction: game.state.rules.movement.direction };

  // The opening card: while rolling, then the result for a moment.
  const opening = openingStatus(game);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const decided = opening?.kind === 'decided';
  useEffect(() => {
    if (!decided) return;
    const timer = setTimeout(() => setDismissed(gameKey), OPENING_RESULT_MS);
    return () => clearTimeout(timer);
  }, [decided, gameKey]);
  const showOpening = opening !== null && !(decided && dismissed === gameKey);

  const roller = nextOpeningRoller(game);
  const canRoll = phase === 'awaiting-roll' || roller !== null;

  const roll = () => {
    if (phase === 'awaiting-roll') {
      dispatch({ type: 'roll', player: view.toMove });
    } else if (roller !== null) {
      dispatch({ type: 'rollOpening', player: roller });
      if (openingTaps === 'one' && roller === 'white') {
        dispatch({ type: 'rollOpening', player: 'black' });
      }
    }
  };
  const onDiceLanded = () => feedback.event('diceLand');

  // Checkers in the air. A flight is only for the view it was made in.
  const [flights, setFlights] = useState<readonly Flight[]>([]);
  const onFlightDone = (id: string) => setFlights((old) => old.filter((f) => f.id !== id));

  const onMove = (move: Move, geo: BoardGeometry, from: { x: number; y: number } | null) => {
    const mover = view.toMove;
    const direction = game.state.rules.movement.direction;
    const before = view.board;
    const ok = dispatch({ type: 'move', player: mover, move, autoConfirm });
    // The move's sound and haptic play from the engine log (useGameFeedback).
    if (!ok) return false;
    // The turn ended (auto-confirm) and the board turns: skip the flight.
    const next = store.getState().flow.game;
    const turnEnded = next.state.toMove !== mover || next.phase === 'awaiting-roll';
    if (turnEnded && flipMode === 'flip') return true;
    const after = applyMoveToBoard(before, mover, move, direction);
    const id = `m${store.getState().flow.log.length}`;
    const added = moveFlights(geo, boardView, mover, move, before, after, {
      id,
      ...(from ? { from } : {}),
    });
    setFlights((old) => [...old, ...added]);
    return true;
  };

  // The dice of the opening already rolled in the card: show them at rest.
  const fromOpening = game.opening !== null && game.lastTurn === null;
  const rollKey = fromOpening ? null : `${gameKey}:${game.state.turnNumber}`;

  let controls;
  if (phase === 'opening-roll') {
    const label =
      openingTaps === 'perPlayer' && roller !== null
        ? t('game.roll.openingFor', { name: names[roller] })
        : t('game.roll.opening');
    controls = (
      <ActionButton
        testID="roll-button"
        label={label}
        subtitle={t('game.roll.orTapBoard')}
        onPress={roll}
        grow
      />
    );
  } else if (phase === 'awaiting-roll') {
    controls = (
      <ActionButton
        testID="roll-button"
        label={t('game.roll.dice')}
        subtitle={t('game.roll.orTapBoard')}
        onPress={roll}
        grow
      />
    );
  } else {
    controls = (
      <View style={styles.diceSlot}>
        <DiceRow
          testID="dice-row"
          theme={theme}
          dice={view.dice}
          rollKey={rollKey}
          onLanded={onDiceLanded}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.boardArea}>
        <InteractiveBoard
          testID="game-board"
          theme={theme}
          board={view.board}
          view={boardView}
          mover={view.toMove}
          legal={showOpening ? [] : view.legal}
          positionKey={String(flow.log.length)}
          flights={flights}
          onFlightDone={onFlightDone}
          onMove={onMove}
          onBoardTap={() => {
            if (canRoll) roll();
          }}
          onPickUp={() => feedback.event('checkerPickUp')}
          onIllegalDrop={() => feedback.event('invalidMove')}
        />
        {showOpening && opening ? (
          <Pressable
            testID="opening-overlay"
            style={styles.overlay}
            // A tap closes the result early; while rolling, a tap rolls.
            onPress={decided ? () => setDismissed(gameKey) : roll}
            accessible={false}>
            <OpeningCard
              theme={theme}
              status={opening}
              names={names}
              roundKey={`${gameKey}:${game.opening?.ties.length ?? 0}`}
              onDieLanded={onDiceLanded}
            />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.controls}>{controls}</View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingBottom: Math.max(rt.insets.bottom, theme.space.sm),
  },
  boardArea: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    minHeight: theme.touch.button + theme.space.lg,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.sm,
  },
  diceSlot: {
    flex: 1,
    alignItems: 'center',
  },
}));
