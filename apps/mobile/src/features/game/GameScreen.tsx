/**
 * The board screen (wireframe 6): the player strips, the board, the cards
 * over it (opening roll, no legal moves, game and match end) and the
 * controls row (Roll, or Undo · dice · Confirm).
 *
 * Game logic stays in the engine. This screen sends actions to the game
 * store and shows the result.
 */
import { applyMoveToBoard, type Move, type PlayerId } from '@tavli/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { useBoardTheme } from '@/features/board/BoardCanvas';
import { toneOf, type BoardView } from '@/features/board/boardModel';
import { DiceRow } from '@/features/board/DiceRow';
import { moveFlights, type Flight } from '@/features/board/flights';
import type { BoardGeometry } from '@/features/board/geometry';
import { InteractiveBoard } from '@/features/board/InteractiveBoard';
import { useSettings } from '@/features/settings/store';

import { GameCard } from './GameCard';
import { useGameFeedback } from './gameFeedback';
import { diceView, turnView, useGameStore, type DieView, type GameStore } from './gameStore';
import { nextOpeningRoller, openingStatus } from './opening';
import { OpeningCard } from './OpeningCard';
import { PlayerStrip } from './PlayerStrip';
import { passNotice, winType } from './turnNotices';

/** How long the opening result stays on screen. */
export const OPENING_RESULT_MS = 1500;
/** The "no legal moves" card closes by itself after this time (wireframe 6f). */
export const PASS_NOTICE_MS = 3000;

export interface GameScreenProps {
  store: GameStore;
  /**
   * `perPlayer`: each player taps for their own opening die (pass-and-play).
   * `one`: one tap rolls both (vs bot).
   */
  openingTaps?: 'one' | 'perPlayer';
}

const other = (player: PlayerId): PlayerId => (player === 'white' ? 'black' : 'white');

export function GameScreen({ store, openingTaps = 'perPlayer' }: GameScreenProps) {
  const { t } = useTranslation();
  const theme = useBoardTheme();
  const flow = useGameStore(store, (s) => s.flow);
  const dispatch = useGameStore(store, (s) => s.dispatch);
  const rematch = useGameStore(store, (s) => s.rematch);
  const flipMode = useSettings((s) => s.boardFlipMode);
  const autoConfirm = useSettings((s) => s.autoConfirmMoves);
  const showPips = useSettings((s) => s.showPipCounts);
  // Sound and haptics: moves, rolls and wins play by themselves (from the engine log).
  const feedback = useGameFeedback(store, theme);

  const view = useMemo(() => turnView(flow), [flow]);
  const { game, phase } = view;
  const { match } = flow;
  const names = match.players;
  const gameKey = String(match.games.length);
  const direction = game.state.rules.movement.direction;

  // "No legal moves": the flow has passed the turn already; the card says why.
  const pass = passNotice(flow);
  const [passDismissed, setPassDismissed] = useState<string | null>(null);
  const passKey = pass?.key ?? null;
  const showPass = pass !== null && passDismissed !== pass.key;
  // Keyed on the pass, not the notice object (a new one on each render).
  useEffect(() => {
    if (!showPass || passKey === null) return;
    const timer = setTimeout(() => setPassDismissed(passKey), PASS_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [showPass, passKey]);

  // Pass-and-play "flip": the player to move sits at the bottom. While the
  // pass card shows, the board stays with the player who passed.
  const active: PlayerId = showPass && pass ? pass.player : view.toMove;
  const viewer: PlayerId = flipMode === 'flip' && phase !== 'opening-roll' ? active : 'white';
  const boardView: BoardView = { viewer, direction };

  // The opening card: while rolling, then the result for a moment.
  const opening = openingStatus(game);
  const [openingDismissed, setOpeningDismissed] = useState<string | null>(null);
  const decided = opening?.kind === 'decided';
  useEffect(() => {
    if (!decided) return;
    const timer = setTimeout(() => setOpeningDismissed(gameKey), OPENING_RESULT_MS);
    return () => clearTimeout(timer);
  }, [decided, gameKey]);
  const showOpening = opening !== null && !(decided && openingDismissed === gameKey);

  const roller = nextOpeningRoller(game);
  const canRoll = !showPass && (phase === 'awaiting-roll' || roller !== null);

  const roll = () => {
    if (!canRoll) return;
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

  // Checkers in the air. A flight belongs to the view it was made in.
  const [flights, setFlights] = useState<readonly Flight[]>([]);
  const onFlightDone = useCallback(
    (id: string) => setFlights((old) => old.filter((f) => f.id !== id)),
    [],
  );
  const geoRef = useRef<BoardGeometry | null>(null);
  const onGeometry = useCallback((geo: BoardGeometry) => {
    geoRef.current = geo;
  }, []);

  const onMove = (move: Move, geo: BoardGeometry, from: { x: number; y: number } | null) => {
    const mover = view.toMove;
    const before = view.board;
    const ok = dispatch({ type: 'move', player: mover, move, autoConfirm });
    // The move's sound and haptic play from the engine log (useGameFeedback).
    if (!ok) return false;
    // The turn ended (auto-confirm) and the board turns: no flight, and the
    // flights still in the air belong to the old view.
    const next = store.getState().flow.game;
    const turnEnded = next.state.toMove !== mover || next.phase === 'awaiting-roll';
    if (turnEnded && flipMode === 'flip') {
      setFlights([]);
      return true;
    }
    const after = applyMoveToBoard(before, mover, move, direction);
    const added = moveFlights(geo, boardView, mover, move, before, after, {
      id: `m${store.getState().flow.log.length}`,
      ...(from ? { from } : {}),
    });
    setFlights((old) => [...old, ...added]);
    return true;
  };

  const undo = () => {
    const last = game.played[game.played.length - 1];
    const mover = view.toMove;
    const before = view.board;
    if (!dispatch({ type: 'undo', player: mover }) || last === undefined) return;
    const geo = geoRef.current;
    if (geo === null) return;
    const after = turnView(store.getState().flow).board;
    const back = moveFlights(geo, boardView, mover, last, before, after, {
      id: `u${store.getState().flow.log.length}`,
      undo: true,
    });
    setFlights(back);
  };

  const confirm = () => {
    if (dispatch({ type: 'confirm', player: view.toMove })) setFlights([]);
  };

  // Dice in the controls row: this turn's, or the faded dice of a pass.
  const passDice: DieView[] = pass ? diceView(pass.dice, []) : [];
  const dice = showPass ? passDice : view.dice;
  // The opening dice already rolled in the card: show them at rest.
  const fromOpening = game.opening !== null && game.lastTurn === null;
  const rollKey = fromOpening || showPass ? null : `${gameKey}:${game.state.turnNumber}`;

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
  } else if (phase === 'awaiting-roll' && !showPass) {
    controls = (
      <ActionButton
        testID="roll-button"
        label={t('game.roll.dice')}
        subtitle={t('game.roll.orTapBoard')}
        onPress={roll}
        grow
      />
    );
  } else if (phase === 'moving' || phase === 'awaiting-confirm' || showPass) {
    controls = (
      <>
        <ActionButton
          testID="undo-button"
          label={t('game.controls.undo')}
          kind="secondary"
          disabled={!view.canUndo}
          onPress={undo}
        />
        <View style={styles.diceSlot}>
          <DiceRow
            testID="dice-row"
            theme={theme}
            dice={dice}
            rollKey={rollKey}
            onLanded={onDiceLanded}
          />
        </View>
        <ActionButton
          testID="confirm-button"
          label={t('game.controls.confirm')}
          disabled={!view.canConfirm}
          onPress={confirm}
        />
      </>
    );
  }

  // Cards over the board, at most one at a time.
  let card = null;
  if (view.matchPhase === 'match-over' && match.winner !== null) {
    card = (
      <GameCard
        testID="match-end-card"
        title={t('game.end.matchWinner', { name: names[match.winner] })}
        lines={[
          t('game.end.score', {
            white: names.white,
            black: names.black,
            whiteScore: match.score.white,
            blackScore: match.score.black,
          }),
          t('game.end.target', { target: match.targetPoints }),
        ]}>
        <ActionButton
          testID="rematch-button"
          label={t('game.end.rematch')}
          subtitle={t('game.end.starts', { name: names[match.winner] })}
          onPress={() => {
            setFlights([]);
            // Game and turn numbers start again: forget the closed cards.
            setPassDismissed(null);
            setOpeningDismissed(null);
            rematch();
          }}
        />
      </GameCard>
    );
  } else if (view.matchPhase === 'game-over' && game.result !== null) {
    const { result } = game;
    const winner = result.winner;
    const type = winType(result);
    card = (
      <GameCard
        testID="game-end-card"
        title={
          winner === null ? t('game.end.draw') : t('game.end.gameWinner', { name: names[winner] })
        }
        chip={t(`game.end.${type}`, { count: result.points })}
        lines={[
          t('game.end.score', {
            white: names.white,
            black: names.black,
            whiteScore: match.score.white,
            blackScore: match.score.black,
          }),
          t('game.end.target', { target: match.targetPoints }),
        ]}>
        <ActionButton
          testID="next-game-button"
          label={t('game.end.next')}
          {...(match.nextStarter
            ? { subtitle: t('game.end.starts', { name: names[match.nextStarter] }) }
            : {})}
          onPress={() => {
            setFlights([]);
            dispatch({ type: 'nextGame' });
          }}
        />
      </GameCard>
    );
  } else if (showPass && pass) {
    card = (
      <GameCard
        testID="pass-card"
        title={t('game.pass.title')}
        lines={[
          t('game.pass.body', { name: names[pass.player], dice: pass.dice.join('-') }),
          t('game.pass.next', { name: names[other(pass.player)] }),
        ]}
        footnote={t('game.pass.autoClose')}>
        <ActionButton
          testID="pass-ok-button"
          label={t('game.pass.ok')}
          kind="secondary"
          onPress={() => setPassDismissed(pass.key)}
        />
      </GameCard>
    );
  } else if (showOpening && opening) {
    card = (
      <Pressable
        testID="opening-overlay"
        // The whole board area: a tap anywhere closes the result early;
        // while rolling, a tap rolls ("or tap the board").
        style={styles.tapArea}
        onPress={decided ? () => setOpeningDismissed(gameKey) : roll}
        accessible={false}>
        <OpeningCard
          theme={theme}
          status={opening}
          names={names}
          roundKey={`${gameKey}:${game.opening?.ties.length ?? 0}`}
          onDieLanded={onDiceLanded}
        />
      </Pressable>
    );
  }

  const blocked = card !== null;
  const playing = phase !== 'opening-roll' && view.matchPhase === 'playing';
  const top = other(viewer);
  const strip = (player: PlayerId, testID: string) => (
    <PlayerStrip
      testID={testID}
      name={names[player]}
      checker={theme.checkers[toneOf(player)]}
      pips={showPips ? view.pips[player] : null}
      score={match.score[player]}
      target={match.targetPoints}
      active={playing && active === player}
    />
  );

  return (
    <View style={styles.screen}>
      {strip(top, 'strip-top')}
      <View style={styles.boardArea}>
        <InteractiveBoard
          testID="game-board"
          theme={theme}
          board={view.board}
          view={boardView}
          mover={view.toMove}
          legal={blocked ? [] : view.legal}
          positionKey={String(flow.log.length)}
          flights={flights}
          onFlightDone={onFlightDone}
          onMove={onMove}
          onGeometry={onGeometry}
          onBoardTap={roll}
          onPickUp={() => feedback.event('checkerPickUp')}
          onIllegalDrop={() => feedback.event('invalidMove')}
        />
        {view.canConfirm && !blocked ? (
          <View style={styles.hintRow} pointerEvents="none">
            <Text testID="confirm-hint" style={styles.hint}>
              {t('game.controls.allUsed')}
            </Text>
          </View>
        ) : null}
        {card ? <View style={styles.overlay}>{card}</View> : null}
      </View>
      {strip(viewer, 'strip-bottom')}
      <View style={styles.controls}>{controls}</View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    gap: theme.space.xs,
    paddingTop: theme.space.xs,
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
  tapArea: {
    flex: 1,
    justifyContent: 'center',
  },
  hintRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: theme.space.md,
    alignItems: 'center',
  },
  hint: {
    ...theme.type.bodyStrong,
    overflow: 'hidden',
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.sm,
    borderRadius: theme.radii.pill,
    color: theme.colors.text,
    backgroundColor: theme.colors.backgroundDeep,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    minHeight: theme.touch.button + theme.space.lg,
    paddingHorizontal: theme.space.lg,
  },
  diceSlot: {
    flex: 1,
    alignItems: 'center',
  },
}));
