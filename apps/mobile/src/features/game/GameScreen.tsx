/**
 * The board screen (wireframe 6): the player strips, the board, the cards
 * over it (opening roll, no legal moves, game and match end) and the
 * controls row (Roll, or Undo · dice · Confirm).
 *
 * Game logic stays in the engine. This screen sends actions to the game
 * store and shows the result. Vs bot, the bot's turn runs here too
 * (`startBotTurn`), so its moves fly like a human's.
 */
import type { BotRunner, Difficulty } from '@tavli/contracts';
import {
  applyMoveToBoard,
  type Move,
  type PerPlayer,
  type PlayerId,
  type Rng,
} from '@tavli/engine';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
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
import { startBotTurn, type BotTiming } from '@/features/bot/botTurn';
import { playHaptic } from '@/features/feedback/feedback';
import type { BoardFlipMode } from '@/features/settings/settings';
import { useSettings } from '@/features/settings/store';

import { GameCard } from './GameCard';
import { diceView, turnView, useGameStore, type DieView, type GameStore } from './gameStore';
import { nextOpeningRoller, openingStatus } from './opening';
import { OpeningCard } from './OpeningCard';
import { PlayerStrip } from './PlayerStrip';
import { plainSeats, type Seat } from './seats';
import { passNotice, winType } from './turnNotices';

/** How long the opening result stays on screen. */
export const OPENING_RESULT_MS = 1500;
/** The "no legal moves" card closes by itself after this time (wireframe 6f). */
export const PASS_NOTICE_MS = 3000;
/** The same card when the bot cannot move (wireframe 6f: "closes after 2 s"). */
export const BOT_PASS_NOTICE_MS = 2000;

/** The bot's side in a game vs the bot. */
export interface BotSeat {
  readonly player: PlayerId;
  readonly difficulty: Difficulty;
  readonly runner: BotRunner;
  /** A UI RNG for think time and bot seeds. Never the dice RNG. */
  readonly rng: Rng;
  readonly timing?: Partial<BotTiming>;
}

export interface GameScreenProps {
  store: GameStore;
  /**
   * `perPlayer`: each player taps for their own opening die (pass-and-play).
   * `one`: one tap rolls both (vs bot).
   */
  openingTaps?: 'one' | 'perPlayer';
  /** Names and turn pills. Default: the names in the match. */
  seats?: PerPlayer<Seat>;
  /** Board view for this match. Default: Settings → Board view. */
  boardView?: BoardFlipMode;
  /** Vs bot: the bot plays this side. Its turn locks the board. */
  bot?: BotSeat;
  /** Stops the bot (the menu is open, or another screen is on top). */
  paused?: boolean;
  /** Shows the menu button (wireframe 7). */
  onOpenMenu?: () => void;
  /** Shows "Home" on the game-end and match-end cards. */
  onHome?: () => void;
  /** Shows "Change settings" on the match-end card. */
  onChangeSettings?: () => void;
}

const other = (player: PlayerId): PlayerId => (player === 'white' ? 'black' : 'white');

export function GameScreen({
  store,
  openingTaps = 'perPlayer',
  seats: givenSeats,
  boardView: givenBoardView,
  bot,
  paused = false,
  onOpenMenu,
  onHome,
  onChangeSettings,
}: GameScreenProps) {
  const { t } = useTranslation();
  const theme = useBoardTheme();
  const flow = useGameStore(store, (s) => s.flow);
  const dispatch = useGameStore(store, (s) => s.dispatch);
  const rematch = useGameStore(store, (s) => s.rematch);
  const settingsFlipMode = useSettings((s) => s.boardFlipMode);
  const flipMode = givenBoardView ?? settingsFlipMode;
  const autoConfirm = useSettings((s) => s.autoConfirmMoves);
  const showPips = useSettings((s) => s.showPipCounts);

  const view = useMemo(() => turnView(flow), [flow]);
  const { game, phase } = view;
  const { match } = flow;
  const seats = givenSeats ?? plainSeats(match.players, t('game.strip.turn'));
  const gameKey = String(match.games.length);
  const direction = game.state.rules.movement.direction;
  const botPlayer = bot?.player ?? null;

  // "No legal moves": the flow has passed the turn already; the card says why.
  const pass = passNotice(flow);
  const [passDismissed, setPassDismissed] = useState<string | null>(null);
  const showPass = pass !== null && passDismissed !== pass.key;
  const passMs = pass !== null && pass.player === botPlayer ? BOT_PASS_NOTICE_MS : PASS_NOTICE_MS;
  useEffect(() => {
    if (!showPass || pass === null) return;
    const timer = setTimeout(() => setPassDismissed(pass.key), passMs);
    return () => clearTimeout(timer);
  }, [showPass, pass, passMs]);

  // Pass-and-play "flip": the player to move sits at the bottom. While the
  // pass card shows, the board stays with the player who passed.
  const active: PlayerId = showPass && pass ? pass.player : view.toMove;
  const viewer: PlayerId =
    botPlayer !== null
      ? other(botPlayer)
      : flipMode === 'flip' && phase !== 'opening-roll'
        ? active
        : 'white';
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

  const matchOver = view.matchPhase === 'match-over' && match.winner !== null;
  const gameOver = view.matchPhase === 'game-over' && game.result !== null;
  const blocked = matchOver || gameOver || showPass || showOpening;
  const botsTurn =
    botPlayer !== null &&
    phase !== 'opening-roll' &&
    view.matchPhase === 'playing' &&
    view.toMove === botPlayer;

  const roller = nextOpeningRoller(game);
  const canRoll = !showPass && !botsTurn && (phase === 'awaiting-roll' || roller !== null);

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
  const onDiceLanded = () => playHaptic(theme, 'diceLand');

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

  /** Plays one move (human or bot) and lets the checker fly. Reads the store, not the render. */
  const playMove = (
    move: Move,
    geo: BoardGeometry | null,
    from: { x: number; y: number } | null,
    withAutoConfirm: boolean,
  ): boolean => {
    const now = turnView(store.getState().flow);
    const mover = now.toMove;
    const before = now.board;
    const ok = dispatch({ type: 'move', player: mover, move, autoConfirm: withAutoConfirm });
    if (!ok) return false;
    playHaptic(theme, move.capture === 'hit' ? 'checkerHit' : 'checkerPlace');
    // The turn ended (auto-confirm): the board may turn, so no flight.
    const next = store.getState().flow.game;
    if (geo === null || next.state.toMove !== mover || next.phase === 'awaiting-roll') {
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

  const onMove = (move: Move, geo: BoardGeometry, from: { x: number; y: number } | null) => {
    if (botsTurn) return;
    playMove(move, geo, from, autoConfirm);
  };

  const undo = (): boolean => {
    const now = store.getState().flow;
    const last = now.game.played[now.game.played.length - 1];
    const mover = now.game.state.toMove;
    const before = turnView(now).board;
    if (!dispatch({ type: 'undo', player: mover }) || last === undefined) return false;
    const geo = geoRef.current;
    if (geo === null) return true;
    const after = turnView(store.getState().flow).board;
    const back = moveFlights(geo, boardView, mover, last, before, after, {
      id: `u${store.getState().flow.log.length}`,
      undo: true,
    });
    setFlights(back);
    return true;
  };

  const confirm = (): boolean => {
    const mover = store.getState().flow.game.state.toMove;
    if (!dispatch({ type: 'confirm', player: mover })) return false;
    setFlights([]);
    return true;
  };

  // The bot's turn. It starts when nothing covers the board, and stops when
  // the screen pauses (menu) or goes away. Same key = same turn.
  const botActive = botsTurn && !blocked && !paused;
  const botKey = `${gameKey}:${game.state.turnNumber}`;
  const botRoll = useEffectEvent(() =>
    botPlayer === null ? false : dispatch({ type: 'roll', player: botPlayer }),
  );
  const botMove = useEffectEvent((move: Move) => playMove(move, geoRef.current, null, false));
  const botUndo = useEffectEvent(() => undo());
  const botConfirm = useEffectEvent(() => confirm());
  const botOptions = useEffectEvent(() => bot);
  useEffect(() => {
    const seat = botOptions();
    if (!botActive || seat === undefined) return;
    const handle = startBotTurn({
      player: seat.player,
      difficulty: seat.difficulty,
      runner: seat.runner,
      rng: seat.rng,
      ...(seat.timing ? { timing: seat.timing } : {}),
      getFlow: () => store.getState().flow,
      actions: { roll: botRoll, move: botMove, undo: botUndo, confirm: botConfirm },
      onError: (error) => console.error('bot turn failed', error),
    });
    return handle.cancel;
  }, [botActive, botKey, store]);

  // Texts that say "you" for the human vs the bot.
  const nameOf = (player: PlayerId) => seats[player].name;
  const isYou = (player: PlayerId) => seats[player].you;
  const scoreLine = t('game.end.score', {
    white: nameOf('white'),
    black: nameOf('black'),
    whiteScore: match.score.white,
    blackScore: match.score.black,
  });
  const startsLine = (player: PlayerId) =>
    isYou(player) ? t('game.end.starts_you') : t('game.end.starts', { name: nameOf(player) });
  const resignedLine = (loser: PlayerId) =>
    isYou(loser) ? t('game.end.resigned_you') : t('game.end.resigned', { name: nameOf(loser) });

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
        ? t('game.roll.openingFor', { name: nameOf(roller) })
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
  } else if (botsTurn && !showPass && view.matchPhase === 'playing') {
    const rolled = game.state.dice;
    controls = (
      <View testID="bot-turn" style={styles.botBox} accessibilityLiveRegion="polite">
        {dice.length > 0 ? (
          <DiceRow
            testID="dice-row"
            theme={theme}
            dice={dice}
            rollKey={rollKey}
            onLanded={onDiceLanded}
          />
        ) : null}
        <Text style={styles.botText}>
          {rolled !== null && phase !== 'awaiting-roll'
            ? t('game.bot.moving', { dice: rolled.join('-') })
            : t('game.bot.waiting')}
        </Text>
      </View>
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
          disabled={!view.canUndo || showPass}
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
          disabled={!view.canConfirm || showPass}
          onPress={confirm}
        />
      </>
    );
  }

  const homeButton = onHome ? (
    <ActionButton
      testID="end-home-button"
      label={t('game.end.home')}
      kind="secondary"
      onPress={onHome}
    />
  ) : null;

  // Cards over the board, at most one at a time.
  let card = null;
  if (matchOver && match.winner !== null) {
    const winner = match.winner;
    card = (
      <GameCard
        testID="match-end-card"
        title={
          isYou(winner)
            ? t('game.end.matchWinner_you')
            : t('game.end.matchWinner', { name: nameOf(winner) })
        }
        lines={[
          ...(match.resignedBy !== null ? [resignedLine(match.resignedBy)] : []),
          scoreLine,
          t('game.end.target', { target: match.targetPoints }),
        ]}>
        <ActionButton
          testID="rematch-button"
          label={t('game.end.rematch')}
          subtitle={startsLine(winner)}
          onPress={() => {
            setFlights([]);
            rematch();
          }}
        />
        {onChangeSettings ? (
          <ActionButton
            testID="change-settings-button"
            label={t('game.end.changeSettings')}
            kind="secondary"
            onPress={onChangeSettings}
          />
        ) : null}
        {homeButton}
      </GameCard>
    );
  } else if (gameOver && game.result !== null) {
    const { result } = game;
    const winner = result.winner;
    const type = winType(result);
    card = (
      <GameCard
        testID="game-end-card"
        title={
          winner === null
            ? t('game.end.draw')
            : isYou(winner)
              ? t('game.end.gameWinner_you')
              : t('game.end.gameWinner', { name: nameOf(winner) })
        }
        chip={t(`game.end.${type}`, { count: result.points })}
        lines={[
          ...(result.reason === 'resigned' && winner !== null ? [resignedLine(other(winner))] : []),
          scoreLine,
          t('game.end.target', { target: match.targetPoints }),
        ]}>
        <ActionButton
          testID="next-game-button"
          label={t('game.end.next')}
          {...(match.nextStarter ? { subtitle: startsLine(match.nextStarter) } : {})}
          onPress={() => {
            setFlights([]);
            dispatch({ type: 'nextGame' });
          }}
        />
        {homeButton}
      </GameCard>
    );
  } else if (showPass && pass) {
    card = (
      <GameCard
        testID="pass-card"
        title={t('game.pass.title')}
        lines={[
          isYou(pass.player)
            ? t('game.pass.body_you', { dice: pass.dice.join('-') })
            : t('game.pass.body', { name: nameOf(pass.player), dice: pass.dice.join('-') }),
          isYou(other(pass.player))
            ? t('game.pass.next_you')
            : t('game.pass.next', { name: nameOf(other(pass.player)) }),
        ]}
        footnote={
          passMs === BOT_PASS_NOTICE_MS ? t('game.pass.autoCloseShort') : t('game.pass.autoClose')
        }>
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
        // A tap closes the result early; while rolling, a tap rolls.
        onPress={decided ? () => setOpeningDismissed(gameKey) : roll}
        accessible={false}>
        <OpeningCard
          theme={theme}
          status={opening}
          names={{ white: nameOf('white'), black: nameOf('black') }}
          you={isYou('white') ? 'white' : isYou('black') ? 'black' : null}
          roundKey={`${gameKey}:${game.opening?.ties.length ?? 0}`}
          onDieLanded={onDiceLanded}
        />
      </Pressable>
    );
  }

  const playing = phase !== 'opening-roll' && view.matchPhase === 'playing';
  const top = other(viewer);
  const strip = (player: PlayerId, testID: string) => (
    <PlayerStrip
      testID={testID}
      name={seats[player].label}
      turnLabel={seats[player].turnLabel}
      checker={theme.checkers[toneOf(player)]}
      pips={showPips ? view.pips[player] : null}
      score={match.score[player]}
      target={match.targetPoints}
      active={playing && active === player}
    />
  );

  return (
    <View style={styles.screen}>
      <View style={styles.topRow}>
        {onOpenMenu ? (
          <Pressable
            testID="menu-button"
            accessibilityRole="button"
            accessibilityLabel={t('game.menu.open')}
            hitSlop={4}
            onPress={onOpenMenu}
            style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}>
            {/* U+2630: three lines ("hamburger"). */}
            <Text style={styles.menuIcon} importantForAccessibility="no">
              {'☰'}
            </Text>
          </Pressable>
        ) : null}
        <View style={styles.topStrip}>{strip(top, 'strip-top')}</View>
      </View>
      <View style={styles.boardArea}>
        <InteractiveBoard
          testID="game-board"
          theme={theme}
          board={view.board}
          view={boardView}
          mover={view.toMove}
          legal={blocked || botsTurn ? [] : view.legal}
          positionKey={String(flow.log.length)}
          flights={flights}
          onFlightDone={onFlightDone}
          onMove={onMove}
          onGeometry={onGeometry}
          onBoardTap={roll}
          onPickUp={() => playHaptic(theme, 'checkerPickUp')}
          onIllegalDrop={() => playHaptic(theme, 'invalidMove')}
        />
        {view.canConfirm && !blocked && !botsTurn ? (
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: theme.space.sm,
  },
  topStrip: {
    flex: 1,
  },
  menuButton: {
    width: theme.touch.minTarget,
    height: theme.touch.minTarget,
    borderRadius: theme.touch.minTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  menuIcon: {
    fontSize: 22,
    lineHeight: 26,
    color: theme.colors.text,
  },
  pressed: {
    opacity: 0.7,
  },
  boardArea: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
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
  botBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    minHeight: theme.touch.button,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.xs,
    borderRadius: theme.radii.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: theme.colors.border,
  },
  botText: {
    ...theme.type.body,
    flex: 1,
    color: theme.colors.textDim,
  },
}));
