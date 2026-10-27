/**
 * The board screen (wireframe 6): the player strips, the board, the cards
 * over it (opening roll, no legal moves), the game-end sheet (wireframe 8)
 * and the controls row (Roll, or Undo · dice · Confirm). Match end is its
 * own screen (wireframe 9): this screen calls `onMatchOver`.
 *
 * Screen readers (#153): while a card covers the board, they skip the
 * board; while the game-end sheet or a menu covers the screen, they skip
 * everything under it. Each card moves focus to its title when it opens.
 *
 * Game logic stays in the engine. This screen sends actions to the game
 * store and shows the result. Vs bot, the bot's turn runs here too
 * (`startBotTurn`), so its moves fly like a human's.
 */
import type { BotRunner, Difficulty } from '@tavli/contracts';
import {
  applyMoveToBoard,
  currentPrompt,
  type Move,
  type PerPlayer,
  type PlayerId,
  type Rng,
} from '@tavli/engine';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { MoveList } from '@/features/accessibility/MoveList';
import { useMoveListShown } from '@/features/accessibility/screenReader';
import { useBoardTheme } from '@/features/board/BoardCanvas';
import {
  armyFrozen,
  asodioMarks,
  frozenPoints,
  loadingGate,
  opensGate,
  toEnterCount,
} from '@/features/board/asodio';
import { pinnedCheckers, toneOf, type BoardView } from '@/features/board/boardModel';
import { DiceRow } from '@/features/board/DiceRow';
import { moveFlights, type Flight } from '@/features/board/flights';
import type { BoardGeometry } from '@/features/board/geometry';
import { InteractiveBoard } from '@/features/board/InteractiveBoard';
import { startBotTurn, type BotTiming } from '@/features/bot/botTurn';
import { useSettings } from '@/features/settings/store';

import { turnAnnouncement } from './announcements';
import { GameCard } from './GameCard';
import { GameEndSheet } from './GameEndSheet';
import { isHumanWin, useGameFeedback } from './gameFeedback';
import { diceView, turnView, useGameStore, type DieView, type GameStore } from './gameStore';
import { nextOpeningRoller, openingStatus } from './opening';
import { OpeningCard } from './OpeningCard';
import { PlayerStrip } from './PlayerStrip';
import { plainSeats, type Seat } from './seats';
import { passNotice, winType } from './turnNotices';
import { useAnnouncement } from './useAnnouncement';

/** How long the opening result stays on screen. */
export const OPENING_RESULT_MS = 1500;
/** The "no legal moves" card closes by itself after this time (wireframe 6f). */
export const PASS_NOTICE_MS = 3000;
/** The same card when the bot cannot move (wireframe 6f: "closes after 2 s"). */
export const BOT_PASS_NOTICE_MS = 2000;
/** "Bot plays on." (the bot's answer to the mother question) shows this long. */
export const BOT_ANSWER_NOTE_MS = 2000;
/** The final position stays on screen this long before the match-end screen opens. */
export const MATCH_END_DELAY_MS = 1000;

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
  /** Vs bot: the bot plays this side. Its turn locks the board. */
  bot?: BotSeat;
  /** Stops the bot (the menu is open, or another screen is on top). */
  paused?: boolean;
  /** A menu or dialog covers this screen: screen readers skip it (#153). */
  covered?: boolean;
  /** Shows the menu button (wireframe 7). */
  onOpenMenu?: () => void;
  /** Shows "Home" on the game-end sheet. */
  onHome?: () => void;
  /**
   * The match is over: open the match-end screen. It is called
   * `MATCH_END_DELAY_MS` after the match ends (and the screen is not
   * paused), so the last checker lands first. There is no game-end sheet
   * for the last game: match end replaces it (wireframe 8).
   */
  onMatchOver?: () => void;
  /** The game on the board, shown over it: "Game 2 · Plakoto" (#109). */
  gameLabel?: string;
  /** The game after this one, on the game-end sheet: "Next: game 3 · Fevga" (#109). */
  nextGameLabel?: string;
}

const other = (player: PlayerId): PlayerId => (player === 'white' ? 'black' : 'white');
const BOTH_SIDES: readonly PlayerId[] = ['white', 'black'];

export function GameScreen({
  store,
  openingTaps = 'perPlayer',
  seats: givenSeats,
  bot,
  paused = false,
  covered = false,
  onOpenMenu,
  onHome,
  onMatchOver,
  gameLabel,
  nextGameLabel,
}: GameScreenProps) {
  const { t } = useTranslation();
  const theme = useBoardTheme();
  const flow = useGameStore(store, (s) => s.flow);
  const dispatch = useGameStore(store, (s) => s.dispatch);
  const flipMode = useSettings((s) => s.boardFlipMode);
  const autoConfirm = useSettings((s) => s.autoConfirmMoves);
  const showPips = useSettings((s) => s.showPipCounts);
  const showMoveList = useMoveListShown();

  const view = useMemo(() => turnView(flow), [flow]);
  const { game, phase } = view;
  const { match } = flow;
  const seats = givenSeats ?? plainSeats(match.players, t('game.strip.turn'));
  const gameKey = String(match.games.length);
  const rules = game.state.rules;
  const direction = rules.movement.direction;
  const botPlayer = bot?.player ?? null;
  // Sound and haptics: moves, rolls and wins play by themselves (from the engine
  // log). Vs the bot only the person's side counts, so a bot win plays no jingle.
  const humans = useMemo(() => (botPlayer === null ? BOTH_SIDES : [other(botPlayer)]), [botPlayer]);
  const feedback = useGameFeedback(store, theme, humans);

  // "No legal moves": the flow has passed the turn already; the card says why.
  const pass = passNotice(flow);
  const [passDismissed, setPassDismissed] = useState<string | null>(null);
  const passKey = pass?.key ?? null;
  const showPass = pass !== null && passDismissed !== pass.key;
  const passMs = pass !== null && pass.player === botPlayer ? BOT_PASS_NOTICE_MS : PASS_NOTICE_MS;
  // Keyed on the pass, not the notice object (a new one on each render).
  useEffect(() => {
    if (!showPass || passKey === null) return;
    const timer = setTimeout(() => setPassDismissed(passKey), passMs);
    return () => clearTimeout(timer);
  }, [showPass, passKey, passMs]);

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
  // Plakoto "resign or play on?" (mother pinned). The pinned player answers;
  // vs the bot, the bot answers its own question in its turn.
  const prompt = view.matchPhase === 'playing' ? currentPrompt(game) : null;
  const askHuman = prompt !== null && prompt.player !== botPlayer;
  const blocked = matchOver || gameOver || showPass || showOpening || askHuman;

  // Match over: the final position stays a moment, then the match-end
  // screen opens. Not while paused: the menu or another screen is on top.
  const matchOverEvent = useEffectEvent(() => onMatchOver?.());
  useEffect(() => {
    if (!matchOver || paused) return;
    const timer = setTimeout(matchOverEvent, MATCH_END_DELAY_MS);
    return () => clearTimeout(timer);
  }, [matchOver, paused]);

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
    // The turn ended (auto-confirm) and the board turns: no flight, and the
    // flights still in the air belong to the old view.
    const next = store.getState().flow.game;
    const turnEnded = next.state.toMove !== mover || next.phase === 'awaiting-roll';
    if (geo === null || (turnEnded && flipMode === 'flip')) {
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

  /** Returns whether the move was played; if not, the board flies the checker back. */
  const onMove = (move: Move, geo: BoardGeometry, from: { x: number; y: number } | null) => {
    if (botsTurn) return false;
    return playMove(move, geo, from, autoConfirm);
  };
  /** A button of the move list: the same move as a tap-tap on the board. */
  const onListMove = (move: Move) => {
    if (botsTurn || blocked) return;
    playMove(move, geoRef.current, null, autoConfirm);
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
  // The bot's answer to the mother question; a short note says what it chose.
  const [botChoice, setBotChoice] = useState<{ key: string; choice: string } | null>(null);
  const botAnswer = useEffectEvent((choice: string) => {
    if (botPlayer === null) return false;
    if (!dispatch({ type: 'answer', player: botPlayer, choice })) return false;
    setBotChoice({ key: botKey, choice });
    return true;
  });
  // The note goes after a short time (the answer does not change the turn).
  useEffect(() => {
    if (botChoice === null) return;
    const timer = setTimeout(() => setBotChoice(null), BOT_ANSWER_NOTE_MS);
    return () => clearTimeout(timer);
  }, [botChoice]);
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
      actions: {
        roll: botRoll,
        move: botMove,
        undo: botUndo,
        confirm: botConfirm,
        answer: botAnswer,
      },
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

  // Screen readers hear each roll and the other player's moves (#134).
  const announcement = turnAnnouncement(flow, t, { nameOf, isYou });
  useAnnouncement(announcement?.text ?? null, announcement?.key);

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
      // No live region: the roll and the bot's moves are announced (`turnAnnouncement`).
      <View testID="bot-turn" style={styles.botBox}>
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
          accessibilityLabel={t('game.controls.undoLabel')}
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

  // Game end (wireframe 8): a sheet over the final board. Match end is
  // another screen (`onMatchOver`), so nothing covers the board then.
  let endSheet = null;
  if (gameOver && game.result !== null) {
    const { result } = game;
    const winner = result.winner;
    const loser = winner === null ? null : other(winner);
    const type = winType(result);
    let reason: string | null = null;
    if (result.reason === 'resigned' && loser !== null) {
      reason = resignedLine(loser);
    } else if (result.reason === 'borneOff' && type === 'diplo' && loser !== null) {
      reason = isYou(loser)
        ? t('game.end.noBearOff_you')
        : t('game.end.noBearOff', { name: nameOf(loser) });
    } else if (result.reason === 'deadlock') {
      // Asodio A5: no one can ever move again.
      reason = t('game.end.deadlock');
    } else if (result.reason === 'bothMothersPinned') {
      reason = t('game.end.bothMothersPinned');
    }
    endSheet = (
      <GameEndSheet
        testID="game-end-card"
        title={
          winner === null
            ? t('game.end.draw')
            : isYou(winner)
              ? t('game.end.gameWinner_you')
              : t('game.end.gameWinner', { name: nameOf(winner) })
        }
        chip={
          winner === null ? t('game.end.drawChip') : t(`game.end.${type}`, { count: result.points })
        }
        strongChip={result.points >= 2}
        reason={reason}
        {...(nextGameLabel ? { next: nextGameLabel } : {})}
        matchLabel={t('game.end.matchLabel')}
        score={scoreLine}
        target={t('game.end.target', { target: match.targetPoints })}
        // Like the win jingle: only a win by a person is celebrated.
        celebrate={isHumanWin(winner, humans)}>
        <ActionButton
          testID="next-game-button"
          label={t('game.end.next')}
          {...(match.nextStarter ? { subtitle: startsLine(match.nextStarter) } : {})}
          onPress={() => {
            setFlights([]);
            dispatch({ type: 'nextGame' });
          }}
        />
        {onHome ? (
          <ActionButton
            testID="end-home-button"
            label={t('game.end.home')}
            kind="text"
            onPress={onHome}
          />
        ) : null}
      </GameEndSheet>
    );
  }

  // Cards over the board, at most one at a time, and none once the game is over.
  const over = gameOver || matchOver;
  let card = null;
  if (!over && askHuman && prompt) {
    // Wireframe 17: two buttons of equal weight; no way to close it without a choice.
    const pinned = prompt.player;
    const opponentName = nameOf(other(pinned));
    const answer = (choice: string) => () => {
      if (dispatch({ type: 'answer', player: pinned, choice })) setFlights([]);
    };
    card = (
      <GameCard
        testID="mother-card"
        title={
          isYou(pinned)
            ? t('game.mother.title_you')
            : t('game.mother.title', { name: nameOf(pinned) })
        }
        lines={[
          t('game.mother.body', { opponent: opponentName }),
          t('game.mother.question', { opponent: opponentName }),
        ]}>
        <ActionButton
          testID="mother-resign-button"
          label={t('game.mother.resign')}
          kind="secondary"
          onPress={answer('resign')}
        />
        <ActionButton
          testID="mother-play-on-button"
          label={t('game.mother.playOn')}
          kind="secondary"
          onPress={answer('playOn')}
        />
      </GameCard>
    );
  } else if (!over && showPass && pass) {
    // Why nothing moved. Asodio: the loading lock (no 1-2 or double yet) or
    // a frozen army (A6). The board has not changed since the pass.
    const gate = loadingGate(view.board, pass.player, rules);
    const reason =
      gate !== null && !opensGate(gate, pass.dice)
        ? gate === 'doubleOnly'
          ? 'lockedDouble'
          : 'locked'
        : armyFrozen(view.board, pass.player, rules)
          ? 'frozen'
          : 'body';
    const vars = { name: nameOf(pass.player), dice: pass.dice.join('-') };
    // The player to move now comes from the engine (an extra roll keeps the same player).
    const next = game.state.toMove;
    card = (
      <GameCard
        // A new pass is a new card: focus moves and it is read again.
        key={pass.key}
        testID="pass-card"
        title={
          reason === 'body'
            ? t('game.pass.title')
            : reason === 'frozen'
              ? t('game.pass.frozenTitle')
              : t('game.pass.lockedTitle')
        }
        lines={[
          isYou(pass.player) ? t(`game.pass.${reason}_you`, vars) : t(`game.pass.${reason}`, vars),
          isYou(next) ? t('game.pass.next_you') : t('game.pass.next', { name: nameOf(next) }),
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
  } else if (!over && showOpening && opening) {
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
          names={{ white: nameOf('white'), black: nameOf('black') }}
          you={isYou('white') ? 'white' : isYou('black') ? 'black' : null}
          roundKey={`${gameKey}:${game.opening?.ties.length ?? 0}`}
          onDieLanded={onDiceLanded}
        />
      </Pressable>
    );
  }

  // Asodio: the checkers still to enter, and the ones the quarter lock
  // freezes (A6: the whole army). Other games have neither.
  const toEnter = {
    white: toEnterCount(view.board, 'white'),
    black: toEnterCount(view.board, 'black'),
  };
  const frozen = {
    white: frozenPoints(view.board, 'white', rules),
    black: frozenPoints(view.board, 'black', rules),
  };
  const armyStuck = {
    white: armyFrozen(view.board, 'white', rules),
    black: armyFrozen(view.board, 'black', rules),
  };
  const marks = asodioMarks(view.board, rules, boardView);
  // The loading lock: until a 1-2 or a double, the board stays shut.
  const gateToMove =
    phase === 'awaiting-roll' && !blocked && !botsTurn
      ? loadingGate(view.board, view.toMove, rules)
      : null;
  const stripNote = (player: PlayerId): string | null => {
    if (armyStuck[player]) return t('game.strip.frozen');
    if (toEnter[player] > 0) return t('game.strip.toEnter', { count: toEnter[player] });
    return null;
  };

  // The screen reader hears the board's pinned checkers (Plakoto, Asodio),
  // the checkers to enter and the frozen ones (Asodio).
  const asodioLines = BOTH_SIDES.flatMap((player) => {
    const you = isYou(player);
    const name = nameOf(player);
    const lines: string[] = [];
    if (toEnter[player] > 0) {
      const count = toEnter[player];
      lines.push(
        you ? t('game.board.toEnterYou', { count }) : t('game.board.toEnter', { name, count }),
      );
    }
    if (armyStuck[player]) {
      lines.push(you ? t('game.board.armyFrozen_you') : t('game.board.armyFrozen', { name }));
    } else if (frozen[player].length > 0) {
      const points = frozen[player].join(', ');
      const count = frozen[player].length;
      lines.push(
        you
          ? t('game.board.frozenYou', { points, count })
          : t('game.board.frozen', { name, points, count }),
      );
    }
    return lines;
  });
  const boardLabel = [
    t('game.board.label'),
    ...pinnedCheckers(view.board, direction).map(({ player, point }) =>
      isYou(player)
        ? t('game.board.pinned_you', { point })
        : t('game.board.pinned', { name: nameOf(player), point }),
    ),
    ...asodioLines,
  ].join('. ');
  const botNote =
    botChoice !== null && botChoice.key === botKey && botChoice.choice === 'playOn' && botsTurn
      ? t('game.mother.botPlaysOn', { name: botPlayer === null ? '' : nameOf(botPlayer) })
      : null;

  const playing = phase !== 'opening-roll' && view.matchPhase === 'playing';
  const top = other(viewer);
  const strip = (player: PlayerId, testID: string) => (
    <PlayerStrip
      testID={testID}
      name={seats[player].label}
      turnLabel={seats[player].turnLabel}
      checker={theme.checkers[toneOf(player)]}
      pips={showPips ? view.pips[player] : null}
      note={stripNote(player)}
      score={match.score[player]}
      target={match.targetPoints}
      active={playing && active === player}
    />
  );

  // Screen readers skip what a card or sheet covers (#153), as the tutorial
  // does for its mother card (#151).
  const hideScreen = covered || endSheet !== null;
  const hideBoard = card !== null;

  return (
    <View style={styles.screen}>
      <View
        testID="game-content"
        style={styles.content}
        importantForAccessibility={hideScreen ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={hideScreen}>
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
              <Text style={styles.menuIcon} importantForAccessibility="no" allowFontScaling={false}>
                {'☰'}
              </Text>
            </Pressable>
          ) : null}
          <View style={styles.topStrip}>{strip(top, 'strip-top')}</View>
        </View>
        {gameLabel ? (
          <Text testID="game-label" style={styles.gameLabel}>
            {gameLabel}
          </Text>
        ) : null}
        <View style={styles.boardArea}>
          <View
            testID="game-board-layer"
            style={styles.boardLayer}
            importantForAccessibility={hideBoard ? 'no-hide-descendants' : 'auto'}
            accessibilityElementsHidden={hideBoard}>
            <InteractiveBoard
              testID="game-board"
              accessibilityLabel={boardLabel}
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
              onPickUp={() => feedback.event('checkerPickUp')}
              onIllegalDrop={() => feedback.event('invalidMove')}
              marks={marks}
            />
          </View>
          {/* Status notes stay outside the hidden layer: screen readers still hear them. */}
          {gateToMove !== null ? (
            <View style={styles.hintRow} pointerEvents="none">
              <Text testID="loading-lock-hint" style={styles.hint} accessibilityLiveRegion="polite">
                {gateToMove === 'doubleOnly'
                  ? t('game.asodio.lockedDouble')
                  : t('game.asodio.locked')}
              </Text>
            </View>
          ) : null}
          {view.canConfirm && !blocked && !botsTurn ? (
            <View style={styles.hintRow} pointerEvents="none">
              <Text testID="confirm-hint" style={styles.hint}>
                {t('game.controls.allUsed')}
              </Text>
            </View>
          ) : null}
          {botNote !== null ? (
            <View style={styles.hintRow} pointerEvents="none">
              <Text testID="bot-answer-note" style={styles.hint} accessibilityLiveRegion="polite">
                {botNote}
              </Text>
            </View>
          ) : null}
          {card ? (
            // Scrolls when a small phone or a large font makes the card taller than the board.
            <ScrollView
              testID="game-card-overlay"
              style={styles.overlay}
              contentContainerStyle={styles.overlayContent}>
              {card}
            </ScrollView>
          ) : null}
        </View>
        {strip(viewer, 'strip-bottom')}
        {showMoveList && !blocked && !botsTurn ? (
          <MoveList legal={view.legal} onMove={onListMove} />
        ) : null}
        <View style={styles.controls}>{controls}</View>
      </View>
      {endSheet}
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    paddingTop: theme.space.xs,
    backgroundColor: theme.colors.background,
    paddingBottom: Math.max(rt.insets.bottom, theme.space.sm),
  },
  content: {
    flex: 1,
    gap: theme.space.xs,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: theme.space.sm,
  },
  topStrip: {
    flex: 1,
  },
  gameLabel: {
    ...theme.type.caption,
    color: theme.colors.textDim,
    textAlign: 'center',
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
  boardLayer: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayContent: {
    // No padding: the opening card takes taps on the whole board area.
    flexGrow: 1,
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
