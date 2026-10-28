/**
 * The board screen (wireframe 6): the player strips, the board with the
 * dice on it, the cards over it (opening roll, no legal moves, the mother
 * question, the Acey-Deucey "choose a double" after a 1-2), the
 * game-end sheet (wireframe 8) and one row of big buttons (Roll, or Undo ·
 * Confirm). Match end is its own screen (wireframe 9): this screen calls
 * `onMatchOver`.
 *
 * Two portrait layouts (#184, Settings → Board → Board layout):
 * - `tall` (default): the board on its side, as large as the screen allows.
 *   One-line strips above and below it, the menu in the top strip, the
 *   game label in the menu.
 * - `classic`: the board as on a table, as wide as the screen, with its
 *   strips right above and below it, centred on the screen. The menu and
 *   the game label sit at the top.
 * Both keep the buttons at the bottom, in thumb reach. The board layout
 * comes from one place (`boardLayout`), so touches and flights follow it.
 *
 * Landscape (#185): when the phone lies on its side, the whole screen turns
 * with it (`useScreenLayout`). The classic board sits in the middle and
 * fills the height. The left column holds the menu, the two players and
 * Undo (under the left thumb); the right column the game label, the dice
 * and Roll or Confirm (under the right thumb). The right column lies over
 * the right edge of the board layer, so the dice box stays inside that
 * layer; the column keeps an empty slot where the dice lie. Turning the
 * phone keeps everything: the views keep their place in the tree, so the
 * board (and a selected checker), the dice canvas and an open card stay
 * mounted. Until the board has measured its new space, the dice hide.
 *
 * Screen readers (#153): while a card covers the board, they skip the
 * board; while the game-end sheet or a menu covers the screen, they skip
 * everything under it. Each card moves focus to its title when it opens.
 *
 * Hint (#209): with an `analyzer` (offline games) and Settings → Show
 * hints on, a Hint button shows on a person's turn once the dice are
 * rolled, when the rest of the turn can end on more than one board. A tap
 * ranks the turns a moment later (still on the JS thread, in a timer after
 * the button has painted "Thinking…"), then
 * rings the moves on the board and shows them in a line. A move, an undo or
 * a second tap takes the hint away. The move list has the same button.
 *
 * Online (#255, `online`): the server rolls the dice, passes a roll with no
 * move, and starts the next game by itself. So there is no Roll button and
 * no opening card: a short line says who starts. The other player is
 * remote: while the server waits for them the board is locked, and their
 * whole turn arrives at once and flies from `game.lastTurn`. Its sounds,
 * the server's rolls and the game end play from the views
 * (`features/online/onlineFeedback.ts`, #271). A game the
 * server has already ended shows its game-end sheet (`online.ended`) over
 * its end: the board store holds the next game until the sheet closes
 * (#286). When the other player's turn ended the game, its checkers fly
 * first, and the sheet (or the match end) waits until they land (#299).
 * The online screen (`features/online/OnlineMatchScreen`)
 * gives the texts: the time left, the waiting line and its notices.
 *
 * Game logic stays in the engine. This screen sends actions to the game
 * store and shows the result. Vs bot, the bot's turn runs here too
 * (`startBotTurn`), so its moves fly like a human's.
 */
import type { Analyzer } from '@tavli/bot';
import type { BotRunner, Difficulty } from '@tavli/contracts';
import {
  applyMoveToBoard,
  currentPrompt,
  type GameRecord,
  type MatchFlow,
  type Move,
  type PerPlayer,
  type PlayerId,
  type Rng,
} from '@tavli/engine';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import { boardDiceBox, columnDiceBox } from '@/features/board/boardDice';
import { pinnedCheckers, toneOf, type BoardView } from '@/features/board/boardModel';
import { flowPaths } from '@/features/board/combined';
import { DiceRow } from '@/features/board/DiceRow';
import {
  flightsEndMs,
  moveFlights,
  pathFlights,
  turnFlights,
  type Flight,
} from '@/features/board/flights';
import { boxRatioWithShadow, type BoardGeometry } from '@/features/board/geometry';
import { InteractiveBoard } from '@/features/board/InteractiveBoard';
import { boardModeOf, useScreenLayout } from '@/features/board/screenLayout';
import { useDoubleReveal } from '@/features/board/useDoubleReveal';
import { startBotTurn, type BotTiming } from '@/features/bot/botTurn';
import { bestRest, hintHasChoice } from '@/features/hint/hint';
import { hintShortText, hintSpokenText } from '@/features/hint/hintText';
import { onlineStoreEvents } from '@/features/online/onlineFeedback';
import { remoteTurn } from '@/features/online/remoteTurn';
import { useSettings } from '@/features/settings/store';

import {
  onlineOpeningLine,
  onlinePassLine,
  onlineTurnAnnouncement,
  stateHasChosenDouble,
  turnAnnouncement,
} from './announcements';
import { DoubleChoices } from './DoubleChoices';
import { GameCard } from './GameCard';
import { GameEndSheet } from './GameEndSheet';
import { isHumanWin, storeEvents, useGameFeedback } from './gameFeedback';
import { diceView, turnView, useGameStore, type BoardStore, type DieView } from './gameStore';
import { addGroup, dropTop, undoSize, type MoveGroup } from './moveGroups';
import { isChoosingStarter, nextOpeningRoller, openingStatus } from './opening';
import { OpeningCard } from './OpeningCard';
import { PlayerStrip, STRIP_HEIGHT } from './PlayerStrip';
import { diceWereChosen, diceWereRolled } from './rolledDice';
import { plainSeats, type Seat } from './seats';
import { isStrongWin, passNotice, recordScoring, winType, type WinType } from './turnNotices';
import { useAnnouncement } from './useAnnouncement';

/** How long the opening result ("Maria starts with 6-3.") stays, unless a tap closes it (#176). */
export const OPENING_RESULT_MS = 3000;
/**
 * After an opening tie, Roll waits this long: the dice land first, so a
 * quick second tap does not skip the tie (#176). The tie itself stays on
 * the card until the next roll.
 */
export const OPENING_TIE_WAIT_MS = 1000;
/**
 * The "no legal moves" card when the bot cannot move closes by itself after
 * this time (OK closes it sooner). A person's own pass card waits for OK (#178).
 */
export const BOT_PASS_NOTICE_MS = 3500;
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

/**
 * A game the server has already ended (online, #255). The board shows its
 * end until the sheet closes; the server has started the next game (#286).
 */
export interface OnlineEndedGame {
  readonly record: GameRecord;
  /** Names this game end for the whole app run, so it is read once (#216). */
  readonly key: string;
  /** The sheet's button: it closes the sheet, and the next game shows. */
  readonly onClose: () => void;
}

/** A card over the board, such as "Your time ran out" (online, #255). */
export interface OnlineNoticeCard {
  /** Names this notice for the whole app run, so it is read once (#216). */
  readonly key: string;
  readonly title: string;
  readonly text: string;
  readonly onClose: () => void;
}

/** An online game (#255). See the top of this file. */
export interface OnlineSide {
  /** Your side: it sits at the bottom, and only it moves on this phone. */
  readonly me: PlayerId;
  /** The version of the view on the board. Screen reader keys use it. */
  readonly version: number;
  /** The board is locked: the server waits for the other player, or your call is on its way. */
  readonly locked: boolean;
  /** The text in place of the buttons while the board is locked: "Waiting for Opponent…". */
  readonly status: string;
  /** The time left on the strip of the player the server waits for: "42 s". */
  readonly clock: { readonly player: PlayerId; readonly text: string } | null;
  /** The game-end sheet of the game that just ended. */
  readonly ended: OnlineEndedGame | null;
  readonly notice: OnlineNoticeCard | null;
}

export interface GameScreenProps {
  /** A local match (`GameStore`), or an online game (`features/online/boardStore.ts`). */
  store: BoardStore;
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
  /** Shows "Review" on the game-end sheet: the biggest mistakes of the game (#215). */
  onReview?: () => void;
  /**
   * The match is over: open the match-end screen. It is called
   * `MATCH_END_DELAY_MS` after the match ends (and the screen is not
   * paused), so the last checker lands first. There is no game-end sheet
   * for the last game: match end replaces it (wireframe 8).
   */
  onMatchOver?: () => void;
  /**
   * The game on the board: "Game 2 · Plakoto" (#109). The classic layout
   * shows it at the top, landscape in the right column; the tall one leaves
   * it to the menu (#184).
   */
  gameLabel?: string;
  /** The game after this one, on the game-end sheet: "Next: game 3 · Fevga" (#109). */
  nextGameLabel?: string;
  /**
   * Hints (#209): the bot's Analyzer. Offline games pass it; without it
   * there is no Hint button.
   */
  analyzer?: Analyzer;
  /** A hint was shown (for the `hint_shown` event). */
  onHintShown?: () => void;
  /** An online game (#255): the server rolls, and the other player is remote. */
  online?: OnlineSide;
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
  onReview,
  onMatchOver,
  gameLabel,
  nextGameLabel,
  analyzer,
  onHintShown,
  online,
}: GameScreenProps) {
  const { t } = useTranslation();
  const theme = useBoardTheme();
  const flow = useGameStore(store, (s) => s.flow);
  const dispatch = useGameStore(store, (s) => s.dispatch);
  // Names the match for this app run: every screen reader event keys on it,
  // so a remount does not read an event again (#216).
  const matchKey = useGameStore(store, (s) => s.matchKey);
  const flipMode = useSettings((s) => s.boardFlipMode);
  const autoConfirm = useSettings((s) => s.autoConfirmMoves);
  const showHints = useSettings((s) => s.showHints);
  const showMoveList = useMoveListShown();
  const { layout, column, spaceKey } = useScreenLayout();
  const landscape = layout === 'landscape';
  const classic = layout === 'classic';
  const tall = layout === 'tall';

  const view = useMemo(() => turnView(flow), [flow]);
  const { game, phase } = view;
  const { match } = flow;
  const seats = givenSeats ?? plainSeats(match.players, t('game.strip.turn'));
  const gameKey = String(match.games.length);
  const rules = game.state.rules;
  const direction = rules.movement.direction;
  const botPlayer = bot?.player ?? null;
  // Online (#255): your side. The other side plays on another phone.
  const me = online?.me ?? null;
  // Sound and haptics: moves, rolls and wins play by themselves (from the engine
  // log). Vs the bot only the person's side counts, so a bot win plays no jingle.
  // Online only your side counts, and the server's views play the other
  // player's moves, the rolls and the game end (#271).
  const humans = useMemo(
    () => (me !== null ? [me] : botPlayer === null ? BOTH_SIDES : [other(botPlayer)]),
    [botPlayer, me],
  );
  const eventsOf = useMemo(() => (me === null ? storeEvents : onlineStoreEvents(me)), [me]);
  const feedback = useGameFeedback(store, theme, humans, eventsOf);

  // "No legal moves": the flow has passed the turn already; the card says why.
  const pass = passNotice(flow);
  const [passDismissed, setPassDismissed] = useState<string | null>(null);
  const passKey = pass?.key ?? null;
  const showPass = pass !== null && passDismissed !== pass.key;
  // Your own pass (in pass-and-play: the player who passed) waits for OK, so
  // there is time to read why. The bot's pass closes by itself, so the game
  // goes on (#178). Not while paused: the menu covers the card.
  const botPassed = pass !== null && pass.player === botPlayer;
  // Keyed on the pass, not the notice object (a new one on each render).
  useEffect(() => {
    if (!showPass || !botPassed || passKey === null || paused) return;
    const timer = setTimeout(() => setPassDismissed(passKey), BOT_PASS_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [showPass, botPassed, passKey, paused]);

  // Pass-and-play "flip": the player to move sits at the bottom. While the
  // pass card shows, the board stays with the player who passed.
  const active: PlayerId = showPass && pass ? pass.player : view.toMove;
  const viewer: PlayerId =
    me !== null
      ? me
      : botPlayer !== null
        ? other(botPlayer)
        : flipMode === 'flip' && phase !== 'opening-roll'
          ? active
          : 'white';
  const boardView: BoardView = { viewer, direction };

  // The opening card: while rolling (a tie stays until the next roll), then
  // the result until a tap or for a moment (#176).
  const opening = openingStatus(game);
  const [openingDismissed, setOpeningDismissed] = useState<string | null>(null);
  const decided = opening?.kind === 'decided';
  useEffect(() => {
    if (!decided) return;
    const timer = setTimeout(() => setOpeningDismissed(gameKey), OPENING_RESULT_MS);
    return () => clearTimeout(timer);
  }, [decided, gameKey]);
  // Online the server rolls the opening: no card, a short line instead (below).
  const showOpening =
    online === undefined && opening !== null && !(decided && openingDismissed === gameKey);
  // Just after a tie, Roll waits a moment (the dice land first).
  const tieKey = opening?.kind === 'tie' ? `${gameKey}:${opening.round}` : null;
  const [tieSeen, setTieSeen] = useState<string | null>(null);
  useEffect(() => {
    if (tieKey === null) return;
    const timer = setTimeout(() => setTieSeen(tieKey), OPENING_TIE_WAIT_MS);
    return () => clearTimeout(timer);
  }, [tieKey]);
  const tieWait = tieKey !== null && tieSeen !== tieKey;

  const matchOver = view.matchPhase === 'match-over' && match.winner !== null;
  const gameOver = view.matchPhase === 'game-over' && game.result !== null;
  // Online (#299): the other player's turn ended the game. Its checkers
  // fly first (`flyRemoteTurn`), so the game-end sheet and the match end
  // wait until the last one lands. Keyed by the game, like the tie wait.
  const [landing, setLanding] = useState<{ key: string; ms: number } | null>(null);
  const [landed, setLanded] = useState<string | null>(null);
  useEffect(() => {
    if (landing === null) return;
    const timer = setTimeout(() => setLanded(landing.key), landing.ms);
    return () => clearTimeout(timer);
  }, [landing]);
  const landingWait =
    (gameOver || matchOver) &&
    landing !== null &&
    landing.key === `${matchKey}:${gameKey}` &&
    landed !== landing.key;
  // A question for one player: Plakoto "resign or play on?" (mother pinned),
  // or the Acey-Deucey "choose a double" after a 1-2 (#205). The player it
  // asks answers; vs the bot, the bot answers its own question in its turn.
  // Online, only your own questions show here.
  const prompt = view.matchPhase === 'playing' ? currentPrompt(game) : null;
  const askHuman =
    prompt !== null && prompt.player !== botPlayer && (me === null || prompt.player === me);
  // House rule `chosenStarterRolls` (#207): a card asks who starts. In
  // pass-and-play either player picks; vs the bot, the human does.
  const choosing = view.matchPhase === 'playing' && isChoosingStarter(game);
  // Online: a game-end sheet or a notice covers the board.
  const onlineCovered = online !== undefined && (online.ended !== null || online.notice !== null);
  const blocked =
    matchOver || gameOver || showPass || showOpening || askHuman || choosing || onlineCovered;

  // Match over: the final position stays a moment, then the match-end
  // screen opens. Not while paused: the menu or another screen is on top.
  const matchOverEvent = useEffectEvent(() => onMatchOver?.());
  useEffect(() => {
    if (!matchOver || paused || landingWait) return;
    const timer = setTimeout(matchOverEvent, MATCH_END_DELAY_MS);
    return () => clearTimeout(timer);
  }, [matchOver, paused, landingWait]);

  const botsTurn =
    botPlayer !== null &&
    phase !== 'opening-roll' &&
    view.matchPhase === 'playing' &&
    view.toMove === botPlayer;
  // Online: the server waits for the other player, or your call is on its way.
  const remoteStatus =
    online !== undefined && online.locked && view.matchPhase === 'playing' ? online.status : null;
  // The bot or the remote player has the board: your touches do nothing.
  const othersTurn = botsTurn || remoteStatus !== null;

  // One checker with several dice (#180): the "2+3" targets, from the engine.
  const paths = useMemo(() => (othersTurn ? [] : flowPaths(game)), [game, othersTurn]);
  // The combined moves of this turn, so one Undo takes back each one whole.
  const groups = useRef<readonly MoveGroup[]>([]);

  // The Hint (#209): only on a person's turn with rolled dice, no question
  // open (Plakoto's mother, the Acey-Deucey double), and more than one end
  // board for the rest of the turn. Each hint belongs to one position (`flow`):
  // a move or an undo makes a new flow, so the hint goes.
  const hintOpen =
    analyzer !== undefined &&
    showHints &&
    !blocked &&
    !othersTurn &&
    prompt === null &&
    view.matchPhase === 'playing' &&
    phase === 'moving';
  const hintChoice = useMemo(() => {
    if (!hintOpen) return false;
    try {
      return hintHasChoice(game);
    } catch (error) {
      // A hint must never break the game: no button.
      console.error('hint check failed', error);
      return false;
    }
  }, [hintOpen, game]);
  const [hint, setHint] = useState<{ flow: MatchFlow; moves: readonly Move[] } | null>(null);
  const [hintAsked, setHintAsked] = useState<MatchFlow | null>(null);
  const shownHint = hintChoice && hint !== null && hint.flow === flow ? hint.moves : null;
  const hintBusy = hintChoice && hintAsked === flow;
  const hintShown = useEffectEvent(() => onHintShown?.());
  // The ranking still runs on the JS thread, but in a timer after the tap,
  // so "Thinking…" is painted first and the render itself stays quick.
  useEffect(() => {
    if (hintAsked === null || analyzer === undefined) return;
    const asked = hintAsked;
    const timer = setTimeout(() => {
      // The player moved (or undid) in the meantime: this hint is old.
      if (store.getState().flow !== asked) {
        setHintAsked(null);
        return;
      }
      let moves: readonly Move[] | null = null;
      try {
        moves = bestRest(asked.game, analyzer);
      } catch (error) {
        console.error('hint failed', error);
      }
      setHintAsked(null);
      if (moves !== null && moves.length > 0) {
        setHint({ flow: asked, moves });
        hintShown();
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [hintAsked, analyzer, store]);
  // A tap shows the hint, or takes it away.
  const toggleHint = () => {
    if (shownHint !== null) {
      setHint(null);
      return;
    }
    if (hintChoice && !hintBusy) setHintAsked(flow);
  };
  // The same button under the board and in the move list.
  const hintProps = hintChoice
    ? {
        label: hintBusy ? t('game.hint.busy') : t('game.hint.button'),
        accessibilityLabel:
          shownHint !== null
            ? t('game.hint.hide')
            : hintBusy
              ? t('game.hint.busy')
              : t('game.hint.button'),
        busy: hintBusy,
        onPress: toggleHint,
      }
    : null;

  const roller = nextOpeningRoller(game);
  // With `rerollBoth` (#207) the starter rolls after the opening result closes.
  // Online the server rolls.
  const canRoll =
    online === undefined &&
    !showPass &&
    !botsTurn &&
    !(decided && showOpening) &&
    (phase === 'awaiting-roll' || (roller !== null && !tieWait));

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
  // A flight flies in the board's old place: when the board's space changes
  // (the phone turns, the window or the setting changes), the checkers in
  // the air just land.
  const [flightSpace, setFlightSpace] = useState(spaceKey);
  if (flightSpace !== spaceKey) {
    setFlightSpace(spaceKey);
    setFlights([]);
  }
  const geoRef = useRef<BoardGeometry | null>(null);
  // The drawn board, for the dice. The flights read `geoRef`. It belongs to
  // the space it was measured in (`spaceKey`): after a turn of the phone it
  // is old until the board measures again (`InteractiveBoard`).
  const [boardGeo, setBoardGeo] = useState<{ geo: BoardGeometry; key: string } | null>(null);
  const onGeometry = useCallback(
    (geo: BoardGeometry) => {
      geoRef.current = geo;
      setBoardGeo({ geo, key: spaceKey });
    },
    [spaceKey],
  );
  const freshGeo = boardGeo !== null && boardGeo.key === spaceKey ? boardGeo.geo : null;

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

  /**
   * Plays one checker's steps in order (a combined target, #180) and lets
   * it fly the whole path. If the engine refuses a step, the steps before it
   * are taken back, so nothing is half played. Reads the store, not the render.
   */
  const playSteps = (
    steps: readonly Move[],
    geo: BoardGeometry | null,
    from: { x: number; y: number } | null,
    withAutoConfirm: boolean,
  ): boolean => {
    const now = turnView(store.getState().flow);
    const mover = now.toMove;
    const before = now.board;
    let done = 0;
    for (const move of steps) {
      // Auto-confirm only on the last step: the turn goes on until then.
      const last = done === steps.length - 1;
      if (!dispatch({ type: 'move', player: mover, move, autoConfirm: withAutoConfirm && last })) {
        break;
      }
      done += 1;
    }
    if (done < steps.length) {
      for (let i = 0; i < done; i++) dispatch({ type: 'undo', player: mover });
      return false;
    }
    const next = store.getState().flow.game;
    const turnEnded = next.state.toMove !== mover || next.phase === 'awaiting-roll';
    if (!turnEnded) groups.current = addGroup(groups.current, next, steps.length);
    if (geo === null || (turnEnded && flipMode === 'flip')) {
      setFlights([]);
      return true;
    }
    const added = pathFlights(geo, boardView, mover, steps, before, {
      id: `m${store.getState().flow.log.length}`,
      direction,
      ...(from ? { from } : {}),
    });
    setFlights((old) => [...old, ...added]);
    return true;
  };

  /** Returns whether the move was played; if not, the board flies the checker back. */
  const onMove = (move: Move, geo: BoardGeometry, from: { x: number; y: number } | null) => {
    if (othersTurn) return false;
    return playMove(move, geo, from, autoConfirm);
  };
  const onSteps = (
    steps: readonly Move[],
    geo: BoardGeometry,
    from: { x: number; y: number } | null,
  ) => {
    if (othersTurn) return false;
    return playSteps(steps, geo, from, autoConfirm);
  };
  /** A button of the move list: the same move as a tap-tap on the board. */
  const onListMove = (move: Move) => {
    if (othersTurn || blocked) return;
    playMove(move, geoRef.current, null, autoConfirm);
  };
  const onListSteps = (steps: readonly Move[]) => {
    if (othersTurn || blocked) return;
    playSteps(steps, geoRef.current, null, autoConfirm);
  };

  /**
   * Takes back the last move, or the whole combined move on top (#180):
   * one engine `undo` per step, and one flight back along the path.
   */
  const undo = (): boolean => {
    const now = store.getState().flow;
    const size = undoSize(groups.current, now.game);
    const taken = now.game.played.slice(now.game.played.length - size);
    const mover = now.game.state.toMove;
    const before = turnView(now).board;
    groups.current = dropTop(groups.current, now.game);
    let done = 0;
    while (done < size && dispatch({ type: 'undo', player: mover })) done += 1;
    const [last] = taken.slice(-1);
    if (done === 0 || last === undefined) return false;
    const geo = geoRef.current;
    if (geo === null) return true;
    const after = turnView(store.getState().flow).board;
    const id = `u${store.getState().flow.log.length}`;
    const back =
      taken.length > 1 && done === taken.length
        ? pathFlights(geo, boardView, mover, taken, after, { id, undo: true, direction })
        : moveFlights(geo, boardView, mover, last, before, after, { id, undo: true });
    setFlights(back);
    return true;
  };

  const confirm = (): boolean => {
    const mover = store.getState().flow.game.state.toMove;
    if (!dispatch({ type: 'confirm', player: mover })) return false;
    setFlights([]);
    return true;
  };

  // Online (#255): the other player's whole turn arrives in one view. Its
  // moves fly one after the other from the board of the view before.
  const seenFlow = useRef(flow);
  const flyRemoteTurn = useEffectEvent((before: MatchFlow, after: MatchFlow) => {
    const geo = geoRef.current;
    if (me === null || geo === null) return;
    const turn = remoteTurn(before, after, me);
    if (turn === null) return;
    const flying = turnFlights(geo, boardView, turn.player, turn.moves, turn.before, {
      id: `r${online?.version ?? 0}`,
      direction,
    });
    setFlights(flying);
    // The turn ended the game: the end waits until it lands (#299).
    if (after.game.result !== null) {
      setLanding({ key: `${matchKey}:${after.match.games.length}`, ms: flightsEndMs(flying) });
    }
  });
  const isOnline = online !== undefined;
  // A layout effect: the flights start in the same frame as the new
  // board, so the turn's end never shows first for a frame.
  useLayoutEffect(() => {
    const before = seenFlow.current;
    seenFlow.current = flow;
    if (isOnline && before !== flow) flyRemoteTurn(before, flow);
  }, [flow, isOnline]);

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
  // A resigned game says why it gives these points (#181): "Diplo: you
  // resigned before you bore off a checker." The diplo reason shows only when
  // it is true: a variant may score a resign 2 for another reason.
  // A `perChecker` win (Acey-Deucey American, #245) counts the checkers the
  // loser did not bear off: `count` is the engine's points.
  const resignedLine = (loser: PlayerId, type: WinType, off: number, count: number) => {
    let key: 'resignedDiplo' | 'resignedMono' | 'resignedGame';
    switch (type) {
      case 'perChecker':
        return isYou(loser)
          ? t('game.end.resignedPerCheckerYou', { count })
          : t('game.end.resignedPerChecker', { count, name: nameOf(loser) });
      case 'diplo':
        key = off === 0 ? 'resignedDiplo' : 'resignedGame';
        break;
      case 'mono':
        key = 'resignedMono';
        break;
      case 'points':
        key = 'resignedGame';
        break;
    }
    return isYou(loser) ? t(`game.end.${key}_you`) : t(`game.end.${key}`, { name: nameOf(loser) });
  };
  // Why a game that ended by bearing off gives these points: a diplo says
  // the loser bore off nothing; a per-checker win counts the checkers left.
  const borneOffLine = (loser: PlayerId, type: WinType, count: number): string | null => {
    switch (type) {
      case 'perChecker':
        return isYou(loser)
          ? t('game.end.checkersLeftYou', { count })
          : t('game.end.checkersLeft', { count, name: nameOf(loser) });
      case 'diplo':
        return isYou(loser)
          ? t('game.end.noBearOff_you')
          : t('game.end.noBearOff', { name: nameOf(loser) });
      case 'mono':
      case 'points':
        return null;
    }
  };
  // The win type chip: "Mono · +1 point", "Diplo · +2 points", "+3 points".
  const chipLine = (type: WinType, count: number): string => {
    switch (type) {
      case 'mono':
        return t('game.end.mono');
      case 'diplo':
        return t('game.end.diplo');
      case 'points':
      case 'perChecker':
        return t('game.end.points', { count });
    }
  };
  const timeoutLine = (loser: PlayerId) =>
    isYou(loser) ? t('game.end.timeout_you') : t('game.end.timeout', { name: nameOf(loser) });

  // Screen readers hear each roll and the other player's moves (#134),
  // once each: a remount does not read the last one again (#216).
  // Online the log is empty: each new view is read once, keyed on its version.
  const announcement =
    online === undefined
      ? turnAnnouncement(flow, t, { nameOf, isYou })
      : online.ended === null
        ? (() => {
            const text = onlineTurnAnnouncement(flow, t, { nameOf, isYou });
            return text === null ? null : { key: `v${online.version}`, text };
          })()
        : null;
  useAnnouncement(
    announcement?.text ?? null,
    announcement ? `${matchKey}:turn:${announcement.key}` : undefined,
  );
  // Online: who starts (the server rolled the opening) or why nothing moved
  // (the server passed), in a line over the board for a moment.
  const onlineLineText =
    online === undefined
      ? null
      : (onlinePassLine(game, t, { nameOf, isYou }) ??
        onlineOpeningLine(game, t, { nameOf, isYou }));
  const onlineLineKey =
    onlineLineText === null ? null : `${gameKey}:${game.state.turnNumber}:${onlineLineText}`;
  const [onlineLineSeen, setOnlineLineSeen] = useState<string | null>(null);
  useEffect(() => {
    if (onlineLineKey === null) return;
    const timer = setTimeout(() => setOnlineLineSeen(onlineLineKey), OPENING_RESULT_MS);
    return () => clearTimeout(timer);
  }, [onlineLineKey]);
  const onlineLine =
    onlineLineText !== null && onlineLineSeen !== onlineLineKey && online?.ended === null
      ? onlineLineText
      : null;
  // The hint is read out once it shows (#209). It is not a game event: the
  // user asked for it, and a remount closes it (it is screen state).
  useAnnouncement(shownHint === null ? null : hintSpokenText(t, shownHint));

  // Dice in the controls row: this turn's, or the faded dice of a pass.
  const passDice: DieView[] = pass ? diceView(pass.dice, []) : [];
  const dice = showPass ? passDice : view.dice;
  // The opening dice already rolled in the card: show them at rest. So do
  // dice that no roll gave: a double chosen after a 1-2 (Acey-Deucey, #177).
  // Both have no roll in the log. With `rerollBoth` (#207) the starter's
  // first dice are a roll of their own: they tumble.
  // Before a roll the key names the coming turn, as in every turn: no dice
  // row is drawn and the reveal waits for a double, so nothing plays until
  // the dice come (the opening roll too).
  // Online the log is empty: every roll comes from the server and tumbles,
  // but a chosen double does not.
  const atRest =
    showPass ||
    (game.state.dice !== null &&
      (online === undefined ? !diceWereRolled(flow) : stateHasChosenDouble(game)));
  const rollKey = atRest ? null : `${gameKey}:${game.state.turnNumber}`;
  // A rolled double shows its two dice first, then splits into four (#177).
  const reveal = useDoubleReveal(rollKey, dice);

  // The opening Roll button sits on the opening card, next to the dice (#176).
  const openingRollLabel =
    openingTaps === 'perPlayer' && roller !== null
      ? t('game.roll.openingFor', { name: nameOf(roller) })
      : t('game.roll.opening');

  // The dice lie on the board (#184), in the theme's dice area; in
  // landscape in the right column (#185). The main button (Roll, Confirm or
  // the bot's box) sits under the right thumb; Undo under the left one in
  // landscape, next to Confirm in portrait.
  let showDice = false;
  let undoButton = null;
  let hintButton = null;
  let mainButton = null;
  if (phase === 'opening-roll') {
    mainButton = null;
  } else if (remoteStatus !== null) {
    // Online: the server waits for the other player (or has your turn on its way).
    showDice = dice.length > 0;
    mainButton = (
      <View testID="online-wait" style={[styles.botBox, landscape && styles.botBoxSide]}>
        <Text style={styles.botText}>{remoteStatus}</Text>
      </View>
    );
  } else if (botsTurn && !showPass && view.matchPhase === 'playing') {
    const rolled = game.state.dice;
    showDice = dice.length > 0;
    mainButton = (
      // No live region: the roll and the bot's moves are announced (`turnAnnouncement`).
      <View testID="bot-turn" style={[styles.botBox, landscape && styles.botBoxSide]}>
        <Text style={styles.botText}>
          {rolled !== null && phase !== 'awaiting-roll'
            ? diceWereChosen(flow, rolled)
              ? t('game.bot.choseMoving', { dice: rolled.join('-') })
              : t('game.bot.moving', { dice: rolled.join('-') })
            : t('game.bot.waiting')}
        </Text>
      </View>
    );
  } else if (phase === 'awaiting-roll' && !showPass && !showOpening && online === undefined) {
    // While the `rerollBoth` result shows (#207), Roll waits for it to close.
    mainButton = (
      <ActionButton
        testID="roll-button"
        label={t('game.roll.dice')}
        subtitle={t('game.roll.orTapBoard')}
        onPress={roll}
        grow={!landscape}
        compact={landscape}
      />
    );
  } else if (phase === 'moving' || phase === 'awaiting-confirm' || showPass) {
    showDice = true;
    hintButton = hintProps ? (
      <ActionButton
        testID="hint-button"
        label={hintProps.label}
        accessibilityLabel={hintProps.accessibilityLabel}
        kind="secondary"
        disabled={hintProps.busy}
        onPress={hintProps.onPress}
        compact
      />
    ) : null;
    undoButton = (
      <ActionButton
        testID="undo-button"
        label={t('game.controls.undo')}
        accessibilityLabel={t('game.controls.undoLabel')}
        kind="secondary"
        disabled={!view.canUndo || showPass}
        onPress={undo}
        grow={!landscape}
        compact={landscape}
      />
    );
    mainButton = (
      <ActionButton
        testID="confirm-button"
        label={t('game.controls.confirm')}
        disabled={!view.canConfirm || showPass}
        onPress={confirm}
        grow={!landscape}
        compact={landscape}
      />
    );
  }
  // The dice stay mounted while the board measures its new space (so a roll
  // does not start again), but hide until they have their new place.
  const placeGeo = freshGeo ?? boardGeo?.geo ?? null;
  const diceBox =
    showDice && placeGeo !== null
      ? landscape
        ? columnDiceBox(placeGeo, column, dice.length)
        : boardDiceBox(placeGeo, dice.length)
      : null;
  const diceHidden = freshGeo === null;
  // Landscape: the right column keeps this slot free for the dice (two, or
  // four for a double), also before a roll, so its buttons never move.
  const diceSlot =
    landscape && freshGeo !== null
      ? columnDiceBox(freshGeo, column, dice.length === 4 ? 4 : 2)
      : null;

  // Game end (wireframe 8): a sheet over the final board. Match end is
  // another screen (`onMatchOver`), so nothing covers the board then.
  // Online (#255) the server has already started the next game: the sheet
  // shows the game that ended (`online.ended`), from its record. While the
  // turn that ended it flies (`landingWait`, #299), no sheet shows yet.
  const ended = landingWait ? null : (online?.ended ?? null);
  const ending = landingWait
    ? null
    : ended !== null
      ? {
          result: ended.record,
          // The record has no board: a resign reads as a plain resign.
          off: { white: 1, black: 1 },
          // The record's own game: the board may show another game now.
          method: recordScoring(match, ended.record),
          key: ended.key,
        }
      : gameOver && game.result !== null
        ? {
            result: game.result,
            off: game.state.board.off,
            method: rules.scoring.method,
            key: `${matchKey}:end:${gameKey}`,
          }
        : null;
  let endSheet = null;
  if (ending !== null) {
    const { result } = ending;
    const winner = result.winner;
    const loser = winner === null ? null : other(winner);
    // The points are the engine's; the win type only names them (#245).
    const type = winType(result, ending.method);
    let reason: string | null = null;
    if (result.reason === 'resigned' && loser !== null) {
      reason = resignedLine(loser, type, ending.off[loser], result.points);
    } else if (result.reason === 'timeout' && loser !== null) {
      // An online turn timer ran out (#170). The sheet reads this line too.
      reason = timeoutLine(loser);
    } else if (result.reason === 'borneOff' && loser !== null) {
      reason = borneOffLine(loser, type, result.points);
    } else if (result.reason === 'deadlock') {
      // Asodio A5: no one can ever move again.
      reason = t('game.end.deadlock');
    } else if (result.reason === 'bothMothersPinned') {
      reason = t('game.end.bothMothersPinned');
    }
    endSheet = (
      <GameEndSheet
        testID="game-end-card"
        announceKey={ending.key}
        title={
          winner === null
            ? t('game.end.draw')
            : isYou(winner)
              ? t('game.end.gameWinner_you')
              : t('game.end.gameWinner', { name: nameOf(winner) })
        }
        chip={winner === null ? t('game.end.drawChip') : chipLine(type, result.points)}
        // Filled for a diplo (or a Tavli backgammon), never for a draw or a
        // per-checker win (#245).
        strongChip={winner !== null && isStrongWin(type)}
        reason={reason}
        {...(nextGameLabel ? { next: nextGameLabel } : {})}
        matchLabel={t('game.end.matchLabel')}
        score={scoreLine}
        target={t('game.end.target', { target: match.targetPoints })}
        // Like the win jingle: only a win by a person is celebrated.
        celebrate={isHumanWin(winner, humans)}>
        {ended !== null ? (
          // The server has started the next game: the button closes the
          // sheet, and the board shows that game (#286).
          <ActionButton
            testID="next-game-button"
            label={t('game.end.next')}
            onPress={() => {
              setFlights([]);
              ended.onClose();
            }}
          />
        ) : (
          <ActionButton
            testID="next-game-button"
            label={t('game.end.next')}
            {...(match.nextStarter ? { subtitle: startsLine(match.nextStarter) } : {})}
            onPress={() => {
              setFlights([]);
              dispatch({ type: 'nextGame' });
            }}
          />
        )}
        {onReview ? (
          <ActionButton
            testID="end-review-button"
            label={t('game.end.review')}
            kind="secondary"
            onPress={onReview}
          />
        ) : null}
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
  // Online, the sheet of the game that just ended covers the board.
  const over = gameOver || matchOver || (online?.ended ?? null) !== null;
  const notice = online?.notice ?? null;
  let card = null;
  if (!over && notice !== null) {
    // Online (#255): "Your time ran out", "The game changed", ….
    card = (
      <GameCard
        key={notice.key}
        testID="online-notice-card"
        announceKey={`${matchKey}:notice:${notice.key}`}
        title={notice.title}
        lines={[notice.text]}>
        <ActionButton
          testID="online-notice-ok-button"
          label={t('game.pass.ok')}
          kind="secondary"
          onPress={notice.onClose}
        />
      </GameCard>
    );
  } else if (!over && askHuman && prompt && prompt.kind === 'chooseDouble') {
    // Acey-Deucey after a 1-2 (#205): six dice buttons, no way to close it
    // without a choice. The answer sets the dice; the turn starts at once.
    const chooser = prompt.player;
    card = (
      <GameCard
        testID="choose-double-card"
        announceKey={`${matchKey}:chooseDouble:${gameKey}:${game.state.turnNumber}`}
        title={
          isYou(chooser)
            ? t('game.chooseDouble.title_you')
            : t('game.chooseDouble.title', { name: nameOf(chooser) })
        }
        lines={[t('game.chooseDouble.body')]}>
        <DoubleChoices
          choices={prompt.choices}
          onChoose={(choice) => {
            if (dispatch({ type: 'answer', player: chooser, choice })) setFlights([]);
          }}
        />
      </GameCard>
    );
  } else if (!over && askHuman && prompt) {
    // Wireframe 17: two buttons of equal weight; no way to close it without a choice.
    const pinned = prompt.player;
    const opponentName = nameOf(other(pinned));
    const answer = (choice: string) => () => {
      if (dispatch({ type: 'answer', player: pinned, choice })) setFlights([]);
    };
    card = (
      <GameCard
        testID="mother-card"
        announceKey={`${matchKey}:mother:${gameKey}:${game.state.turnNumber}`}
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
    // A double chosen after a 1-2 that no checker can play (#205): "chose", not "rolled".
    const chosen = diceWereChosen(flow, pass.dice);
    const text =
      chosen && reason === 'body'
        ? 'bodyChosen'
        : chosen && reason === 'frozen'
          ? 'frozenChosen'
          : reason;
    const vars = { name: nameOf(pass.player), dice: pass.dice.join('-') };
    // The player to move now comes from the engine (an extra roll keeps the same player).
    const next = game.state.toMove;
    card = (
      <GameCard
        // A new pass is a new card: focus moves and it is read again.
        key={pass.key}
        testID="pass-card"
        announceKey={`${matchKey}:pass:${pass.key}`}
        title={
          reason === 'body'
            ? t('game.pass.title')
            : reason === 'frozen'
              ? t('game.pass.frozenTitle')
              : t('game.pass.lockedTitle')
        }
        lines={[
          isYou(pass.player) ? t(`game.pass.${text}_you`, vars) : t(`game.pass.${text}`, vars),
          isYou(next) ? t('game.pass.next_you') : t('game.pass.next', { name: nameOf(next) }),
        ]}
        {...(botPassed ? { footnote: t('game.pass.autoClose') } : {})}>
        <ActionButton
          testID="pass-ok-button"
          label={t('game.pass.ok')}
          kind="secondary"
          onPress={() => setPassDismissed(pass.key)}
        />
      </GameCard>
    );
  } else if (!over && choosing) {
    // `chosenStarterRolls` (#207): one button per player, the person first
    // vs the bot. The engine's `chooseStarter` sets who rolls first.
    const order = isYou('black') ? (['black', 'white'] as const) : (['white', 'black'] as const);
    card = (
      <GameCard
        // A new game (after a draw) is a new card: focus moves and it is read again.
        key={`choose:${gameKey}`}
        testID="starter-card"
        announceKey={`${matchKey}:starter:${gameKey}`}
        title={t('game.chooser.title')}
        lines={[t('game.chooser.body')]}>
        {order.map((player) => (
          <ActionButton
            key={player}
            testID={`starter-${player}-button`}
            label={
              isYou(player)
                ? t('game.chooser.pick_you')
                : t('game.chooser.pick', { name: nameOf(player) })
            }
            kind="secondary"
            onPress={() => {
              if (dispatch({ type: 'chooseStarter', player })) setFlights([]);
            }}
          />
        ))}
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
          rollsAgain={rules.match.openingRoll === 'rerollBoth'}
          // The match too: each step is read once per app run (#216).
          gameKey={`${matchKey}:${gameKey}`}
          rollLabel={openingRollLabel}
          rollDisabled={tieWait}
          onRoll={roll}
          onClose={() => setOpeningDismissed(gameKey)}
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
    phase === 'awaiting-roll' && !blocked && !othersTurn
      ? loadingGate(view.board, view.toMove, rules)
      : null;
  const asodioNote = (player: PlayerId): string | null => {
    if (armyStuck[player]) return t('game.strip.frozen');
    if (toEnter[player] > 0) return t('game.strip.toEnter', { count: toEnter[player] });
    return null;
  };
  // Online: the time left sits on the strip of the player the server waits for.
  const stripNote = (player: PlayerId): string | null => {
    const notes = [asodioNote(player)];
    const clock = online?.clock ?? null;
    if (clock !== null && clock.player === player) notes.push(clock.text);
    const text = notes.filter((note) => note !== null).join(' · ');
    return text === '' ? null : text;
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
      stacked={landscape}
      name={seats[player].label}
      turnLabel={seats[player].turnLabel}
      checker={theme.checkers[toneOf(player)]}
      note={stripNote(player)}
      score={match.score[player]}
      target={match.targetPoints}
      active={playing && active === player}
    />
  );

  // Screen readers skip what a card or sheet covers (#153), as the tutorial
  // does for its mother card (#151).
  // The two views that hide their content always hold their children
  // (`collapsable={false}`). Otherwise React Native puts the children
  // straight into a native view higher up, and the hiding props pull them
  // back in: the children, the Skia canvases too, would move to another
  // native parent. On iOS a canvas that moves loses its drawing, so the
  // dice went blank after the menu or Settings (#173).
  const hideScreen = covered || endSheet !== null;
  const hideBoard = card !== null;
  // "Doubles!" for a moment after the split. Another note over the board wins.
  const confirmHint = view.canConfirm && !blocked && !othersTurn;
  // The value of the double names it: Greek says «Εξάρες!» for 6-6.
  const doubleValue = dice.length === 4 ? dice[0]?.value : undefined;
  const showDoublesHint =
    reveal.label &&
    doubleValue !== undefined &&
    !blocked &&
    !confirmHint &&
    botNote === null &&
    gateToMove === null &&
    shownHint === null &&
    onlineLine === null;

  const menuButton = onOpenMenu ? (
    <Pressable
      testID="menu-button"
      accessibilityRole="button"
      accessibilityLabel={t('game.menu.open')}
      // The circle is as tall as a strip; the slop makes the target 44 pt.
      hitSlop={MENU_SLOP}
      onPress={onOpenMenu}
      style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}>
      {/* U+2630: three lines ("hamburger"). */}
      <Text style={styles.menuIcon} importantForAccessibility="no" allowFontScaling={false}>
        {'☰'}
      </Text>
    </Pressable>
  ) : null;

  const boardLayer = (
    <View
      testID="game-board-layer"
      style={styles.boardLayer(landscape ? column : 0)}
      collapsable={false}
      importantForAccessibility={hideBoard ? 'no-hide-descendants' : 'auto'}
      accessibilityElementsHidden={hideBoard}>
      <InteractiveBoard
        testID="game-board"
        accessibilityLabel={boardLabel}
        theme={theme}
        layout={boardModeOf(layout)}
        spaceKey={spaceKey}
        board={view.board}
        view={boardView}
        mover={view.toMove}
        legal={blocked || othersTurn ? [] : view.legal}
        // Online the log holds only your moves: the view's version names the rest.
        positionKey={
          online === undefined ? String(flow.log.length) : `${online.version}:${flow.log.length}`
        }
        flights={flights}
        onFlightDone={onFlightDone}
        onMove={onMove}
        paths={blocked || othersTurn ? [] : paths}
        onSteps={onSteps}
        onGeometry={onGeometry}
        onBoardTap={roll}
        onPickUp={() => feedback.event('checkerPickUp')}
        onIllegalDrop={() => feedback.event('invalidMove')}
        marks={marks}
        hint={blocked || othersTurn ? null : shownHint}
      />
      {diceBox ? (
        // The dice lie on the board, in the theme's dice area (#184); in
        // landscape in the layer's right part, in the slot the right column
        // keeps free (#185). Touches go through. The dice canvas keeps its
        // own native view (`DiceRow`, #173), and this box is a native view
        // too (`pointerEvents`), always in the board layer, so turning the
        // phone does not move it.
        <View
          testID="board-dice"
          pointerEvents="none"
          collapsable={false}
          style={[
            styles.boardDice,
            { left: diceBox.left, top: diceBox.top },
            diceHidden && styles.diceHidden,
          ]}>
          <DiceRow
            testID="dice-row"
            theme={theme}
            dice={dice}
            rollKey={rollKey}
            split={reveal.split}
            onLanded={onDiceLanded}
            size={diceBox.size}
            pairSize={diceBox.pairSize}
          />
        </View>
      ) : null}
    </View>
  );

  // Status notes stay outside the hidden layer: screen readers still hear them.
  const hints = (
    <>
      {gateToMove !== null ? (
        <View
          style={[styles.hintRow, landscape && styles.besideColumn(column)]}
          pointerEvents="none">
          <Text testID="loading-lock-hint" style={styles.hint} accessibilityLiveRegion="polite">
            {gateToMove === 'doubleOnly' ? t('game.asodio.lockedDouble') : t('game.asodio.locked')}
          </Text>
        </View>
      ) : null}
      {confirmHint ? (
        <View
          style={[styles.hintRow, landscape && styles.besideColumn(column)]}
          pointerEvents="none">
          <Text testID="confirm-hint" style={styles.hint}>
            {t('game.controls.allUsed')}
          </Text>
        </View>
      ) : null}
      {showDoublesHint ? (
        // The roll announcement already says it is a double, so screen readers skip this.
        <View
          style={[styles.hintRow, landscape && styles.besideColumn(column)]}
          pointerEvents="none">
          <Text
            testID="doubles-hint"
            style={styles.hint}
            accessible={false}
            importantForAccessibility="no">
            {t(`game.doubles.label.${doubleValue}`)}
          </Text>
        </View>
      ) : null}
      {shownHint !== null ? (
        // Read out once when it shows (`useAnnouncement`); it stays for a second look.
        <View
          style={[styles.hintRow, landscape && styles.besideColumn(column)]}
          pointerEvents="none">
          <Text testID="hint-text" style={styles.hint}>
            {hintShortText(t, shownHint)}
          </Text>
        </View>
      ) : null}
      {onlineLine !== null && !confirmHint ? (
        // Online: who starts, or why nothing moved. The turn announcement reads it.
        <View
          style={[styles.hintRow, landscape && styles.besideColumn(column)]}
          pointerEvents="none">
          <Text testID="online-line" style={styles.hint}>
            {onlineLine}
          </Text>
        </View>
      ) : null}
      {botNote !== null ? (
        <View
          style={[styles.hintRow, landscape && styles.besideColumn(column)]}
          pointerEvents="none">
          <Text testID="bot-answer-note" style={styles.hint} accessibilityLiveRegion="polite">
            {botNote}
          </Text>
        </View>
      ) : null}
    </>
  );

  const cardOverlay = card ? (
    // Scrolls when a small phone or a large font makes the card taller than its space.
    <ScrollView
      testID="game-card-overlay"
      style={[styles.overlay, landscape && styles.besideColumn(column)]}
      contentContainerStyle={styles.overlayContent}>
      {card}
    </ScrollView>
  ) : null;

  const gameLabelText = gameLabel ? (
    <Text testID="game-label" style={[styles.gameLabel, landscape && styles.gameLabelSide]}>
      {gameLabel}
    </Text>
  ) : null;
  const moveList =
    showMoveList && !blocked && !othersTurn ? (
      <MoveList
        legal={view.legal}
        onMove={onListMove}
        paths={paths}
        onSteps={onListSteps}
        {...(hintProps ? { hint: hintProps } : {})}
      />
    ) : null;

  // Before the board: the top row in portrait, the left column in landscape.
  let lead = null;
  if (landscape) {
    lead = (
      // Scrolls when a large font makes the column taller than the screen.
      <ScrollView
        testID="game-left"
        style={styles.side(column)}
        contentContainerStyle={styles.sideContent}
        alwaysBounceVertical={false}>
        <View style={styles.sideGroup}>
          {menuButton}
          {strip(top, 'strip-top')}
        </View>
        <View style={styles.sideGroup}>
          {strip(viewer, 'strip-bottom')}
          {hintButton}
          {undoButton}
        </View>
      </ScrollView>
    );
  } else if (classic) {
    // Classic (#184): the menu and the game label at the top.
    lead =
      menuButton !== null || gameLabelText !== null ? (
        <View style={styles.topRow}>
          {menuButton}
          {gameLabelText}
          {/* Keeps the label in the middle of the screen. */}
          {menuButton !== null ? <View style={styles.menuSpacer} /> : null}
        </View>
      ) : null;
  } else {
    // Tall (#184): the menu inside the top strip.
    lead = (
      <View style={styles.topRow}>
        {menuButton}
        <View style={styles.topStrip}>{strip(top, 'strip-top')}</View>
      </View>
    );
  }

  // After the board: the buttons row in portrait, the right column in landscape.
  // The right column lies over the board layer's right part (the layer keeps
  // it free, `boardLayer`). Its top and bottom scroll on their own, around an
  // empty slot where the dice lie, so no text ever covers the dice.
  const trail = landscape ? (
    <View testID="game-right" style={styles.rightColumn(column)} collapsable={false}>
      <ScrollView
        testID="game-right-top"
        style={diceSlot ? { height: diceSlot.top, flexGrow: 0 } : styles.rightPart}
        contentContainerStyle={styles.rightTop}
        alwaysBounceVertical={false}>
        {gameLabelText}
      </ScrollView>
      <View testID="game-dice-slot" style={{ height: diceSlot?.height ?? 0 }} />
      <ScrollView
        testID="game-right-bottom"
        style={styles.rightPart}
        contentContainerStyle={styles.rightBottom}
        alwaysBounceVertical={false}>
        {mainButton}
      </ScrollView>
    </View>
  ) : (
    <View style={styles.controls}>
      {hintButton}
      {undoButton}
      {mainButton}
    </View>
  );

  // Every layout keeps the board at the same place in the tree (the second
  // child, then the board frame), so turning the phone or changing the
  // setting never remounts the board, the dice or a card. The views around
  // the board never flatten (`collapsable={false}`), so the canvases keep
  // their native parent too (#173).
  return (
    <View style={styles.screen(landscape)}>
      <View
        testID="game-content"
        style={styles.content(landscape)}
        collapsable={false}
        importantForAccessibility={hideScreen ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={hideScreen}>
        {lead}
        {/* Classic: the board with its strips, centred in the space that is
            left; a card covers that whole space, so it has room. Tall: the
            board as large as it gets. Landscape: the board between the
            columns; the layer reaches under the right column for the dice. */}
        <View
          testID="game-middle"
          style={tall ? styles.boardArea : styles.middle}
          collapsable={false}>
          {classic ? strip(top, 'strip-top') : null}
          <View
            style={
              classic
                ? styles.classicBoard(boxRatioWithShadow(theme.layouts.landscape))
                : styles.boardArea
            }
            collapsable={false}>
            {boardLayer}
          </View>
          {classic ? strip(viewer, 'strip-bottom') : null}
          {landscape && moveList ? (
            <View style={styles.besideColumnFlow(column)}>{moveList}</View>
          ) : null}
          {hints}
          {cardOverlay}
        </View>
        {tall ? strip(viewer, 'strip-bottom') : null}
        {landscape ? null : moveList}
        {trail}
      </View>
      {endSheet}
    </View>
  );
}

/** The menu circle is as tall as a strip; this slop makes its target 44 pt. */
const MENU_SLOP = (44 - STRIP_HEIGHT) / 2;

const styles = StyleSheet.create((theme, rt) => ({
  // Landscape keeps the notch, the round corners and the home bar free.
  screen: (landscape: boolean) => ({
    flex: 1,
    paddingTop: theme.space.xs,
    backgroundColor: theme.colors.background,
    paddingBottom: Math.max(rt.insets.bottom, landscape ? theme.space.xs : theme.space.sm),
    paddingLeft: landscape ? Math.max(rt.insets.left, theme.space.xs) : 0,
    paddingRight: landscape ? Math.max(rt.insets.right, theme.space.xs) : 0,
  }),
  // In landscape the columns touch the board layer: the dice box is placed
  // right after it (`columnDiceBox`). The board's shadow room is the gap.
  content: (landscape: boolean) => ({
    flex: 1,
    flexDirection: landscape ? 'row' : 'column',
    gap: landscape ? 0 : theme.space.xs,
  }),
  // A side column in landscape (#185).
  side: (width: number) => ({
    width,
    flexGrow: 0,
  }),
  sideContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.xs,
    paddingVertical: theme.space.xxs,
  },
  sideGroup: {
    gap: theme.space.sm,
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
    flex: 1,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
  gameLabelSide: {
    flex: 0,
    paddingTop: theme.space.xs,
  },
  menuButton: {
    width: STRIP_HEIGHT,
    height: STRIP_HEIGHT,
    borderRadius: STRIP_HEIGHT / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  menuSpacer: {
    width: STRIP_HEIGHT + theme.space.sm,
  },
  menuIcon: {
    fontSize: 20,
    lineHeight: 24,
    color: theme.colors.text,
  },
  pressed: {
    opacity: 0.7,
  },
  boardArea: {
    flex: 1,
  },
  middle: {
    flex: 1,
    justifyContent: 'center',
    gap: theme.space.xs,
  },
  // As wide as the screen, as tall as the board needs. A large font may
  // squeeze it; the board then fits the space it has.
  classicBoard: (ratio: number) => ({
    width: '100%',
    aspectRatio: ratio,
    flexShrink: 1,
  }),
  // Landscape: the layer also spans the right column (`right`), so the dice
  // box in that part stays inside it; the board itself keeps clear of it.
  boardLayer: (right: number) => ({
    flex: 1,
    paddingRight: right,
  }),
  diceHidden: {
    opacity: 0,
  },
  // Landscape: keeps a view over the board clear of the right column.
  besideColumn: (column: number) => ({
    right: column,
  }),
  besideColumnFlow: (column: number) => ({
    marginRight: column,
  }),
  rightColumn: (width: number) => ({
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width,
  }),
  rightPart: {
    flex: 1,
  },
  rightTop: {
    paddingHorizontal: theme.space.xs,
    paddingTop: theme.space.xxs,
  },
  rightBottom: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: theme.space.xs,
    paddingBottom: theme.space.xxs,
  },
  boardDice: {
    position: 'absolute',
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
  // One row of big buttons in thumb reach (#184): Roll, or Undo · Confirm.
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    minHeight: theme.touch.button + theme.space.sm,
    paddingHorizontal: theme.space.md,
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
  // The bot's box in the right column: as tall as its text, not the column.
  botBoxSide: {
    flex: 0,
    paddingHorizontal: theme.space.sm,
  },
  botText: {
    ...theme.type.body,
    flex: 1,
    textAlign: 'center',
    color: theme.colors.textDim,
  },
}));
