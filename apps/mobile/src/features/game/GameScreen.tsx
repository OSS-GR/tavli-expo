/**
 * The board screen (wireframe 6): the player seats, the board with the
 * dice on it, the cards over it (opening roll, no legal moves, the mother
 * question, the Acey-Deucey "choose a double" after a 1-2), the
 * game-end sheet (wireframe 8) and the round turn buttons (Roll, or Undo ·
 * Confirm; Figma "18 Game · Portrait and landscape"). Match end is its own
 * screen (wireframe 9): this screen calls `onMatchOver`.
 *
 * Two portrait layouts (#184, Settings → Board → Board layout):
 * - `tall` (default): the board on its side, as large as the screen allows.
 *   The game label is in the menu.
 * - `classic`: the board as on a table, as wide as the screen, centred in
 *   the space left. The game label sits under the seats.
 * Both put the menu and the two seats side by side at the top (yours on
 * the left, the score once between them), and the round buttons under the
 * board, in thumb reach: the main circle in the middle of the screen, Undo
 * (or Fast forward) left of it, the hint right of it. The board layout
 * comes from one place (`boardLayout`), so touches and flights follow it.
 *
 * Rows (#649, #659): a landscape window that is almost square (the open
 * iPhone Duo) keeps the portrait top row (menu, seats, score), draws the
 * deep board under it, and puts the round buttons on the right rail as in
 * landscape. The rail starts under the top row (`leadHeight`).
 * The tall board on the closed iPhone Duo puts its buttons on the same
 * rail, in the camera column under the clock (`sideRail`).
 *
 * Landscape (#185): when the phone lies on its side, the whole screen turns
 * with it (`useScreenLayout`). The classic board sits in the middle and
 * fills the height, between two rails (`rails`): the left one holds what
 * the portrait top row holds (the menu, the other seat, the score, your
 * seat); the right one the round buttons in the portrait order, top to
 * bottom (Undo, the main circle under the right thumb, the hint). The dice
 * lie on the board, as in
 * portrait. There is no game label (the menu has it). Turning the phone
 * keeps everything: the views keep their place in the tree, so the board
 * (and a selected checker), the dice canvas and an open card stay mounted.
 * Until the board has measured its new space, the dice hide.
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
 * Online (#255, `online`): the server passes a roll with no move, and
 * starts the next game (and rolls its opening) by itself. In the first
 * game of a match each player rolls their own opening die (#379): the
 * opening card shows as in pass-and-play, but its Roll button (a tap or a
 * swipe over it too) is only for your die, while it is not in, and asks
 * the server to roll it. Once your die is in, the card says what the
 * server waits for. The other player's die comes with their view. Each
 * turn waits for its roll (#355):
 * on your turn the Roll button, a tap or a swipe asks the server to roll
 * (`rollDice` through the online store), and the throw waits for the
 * server's dice (`rollSent`), then plays as offline. The other player's
 * dice are thrown over the board from their wall when their roll's view
 * arrives (`remoteRoll`, #373). A roll with
 * no legal move shows its dice first, then the pass inlay (`passWaits`).
 * The other player is remote: while the server waits for them the board is
 * locked, and their whole turn arrives at once and flies from
 * `game.lastTurn`. Its sounds, the other player's rolls and the game end
 * play from the views (`features/online/onlineFeedback.ts`, #271). A game the
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
 *
 * Fast forward a race (`bot.fastForward`, `docs/rules/tavli-match.md`):
 * once no checker can touch an opponent checker again (`isRace`), your
 * Roll comes with a Fast forward button. Then the bot plays both sides
 * with `FAST_FORWARD_TIMING` until the game ends: the dice show at rest
 * (no throw), every pass inlay closes by itself, and Stop gives you the
 * board back. Your turns it plays are marked (`onAutoEvent`) for the review.
 *
 * The dice throw (#183): every roll — swipe, tap on the board, Roll button,
 * the bot, the other player online — plays the throw over the board (`BoardThrow`), and the dice row
 * waits hidden until it ends, then shows the roll without a second tumble.
 * With Reduce Motion the dice appear as before.
 */
import type { Analyzer } from '@tavli/bot';
import type { BotRunner, Difficulty } from '@tavli/contracts';
import {
  applyMoveToBoard,
  currentPrompt,
  sameMove,
  diceMoves,
  isRace,
  STANDARD_VARIANT_IDS,
  type GameRecord,
  type MatchFlow,
  type Move,
  type PerPlayer,
  type PlayerId,
  type Rng,
  type StandardVariantId,
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
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { Icon } from '@/components/Icon';
import { ChatPeek } from '@/features/chat/ChatPeek';
import { MoveList } from '@/features/accessibility/MoveList';
import {
  useMoveListAsked,
  useMoveListShown,
  useScreenReaderEnabled,
} from '@/features/accessibility/screenReader';
import { markMatchIntroPlayed, matchIntroDue } from '@/features/intro/introRuns';
import { TableScene } from '@/features/intro/TableScene';
import { TABLE_SCENE_MS } from '@/features/intro/tableMotion';
import { useBoardTheme } from '@/features/board/BoardCanvas';
import { WEB_BOARD } from '@/features/board/webBoard';
import {
  armyFrozen,
  asodioMarks,
  frozenPoints,
  loadingGate,
  opensGate,
  toEnterCount,
} from '@/features/board/asodio';
import { boardDiceBox, settleTargets } from '@/features/board/boardDice';
import { pinnedCheckers, sideOf, toneOf, type BoardView } from '@/features/board/boardModel';
import { flowPaths } from '@/features/board/combined';
import { BOARD_GESTURES, keepPeak, SWIPE_AREA, swipeEnd } from '@/features/board/interaction';
import { DiceRow } from '@/features/board/DiceRow';
import { DICE_LAND_MS } from '@/features/board/diceMotion';
import {
  flightsEndMs,
  moveFlights,
  pathFlights,
  turnFlights,
  type Flight,
} from '@/features/board/flights';
import { boxRatioWithShadow, type BoardGeometry } from '@/features/board/geometry';
import { InteractiveBoard } from '@/features/board/InteractiveBoard';
import { sideMargins, useIslandSide, type IslandSide } from '@/features/board/islandSide';
import { boardModeOf, useScreenLayout } from '@/features/board/screenLayout';
import { useDoubleReveal } from '@/features/board/useDoubleReveal';
import { FAST_FORWARD_TIMING, startBotTurn, type BotTiming } from '@/features/bot/botTurn';
import { BoardThrow, type ThrowSwipe } from '@/features/dice-throw/BoardThrow';
import { bestRest, hintHasChoice } from '@/features/hint/hint';
import { hintShortText, hintSpokenText } from '@/features/hint/hintText';
import { onlineStoreEvents } from '@/features/online/onlineFeedback';
import { remoteRoll } from '@/features/online/remoteRoll';
import { remoteSteps } from '@/features/online/remoteTurn';
import { useSettings } from '@/features/settings/store';
import { SupportAskCard, SupportAskCover } from '@/features/support/SupportAskCard';
import { useSupportAsk } from '@/features/support/supportAsk';

import {
  onlinePassLine,
  onlineTurnAnnouncement,
  stateHasChosenDouble,
  turnAnnouncement,
} from './announcements';
import { useConfirmHint, useTurnNote } from './confirmHint';
import { lostLine, lostReason } from './lostNote';
import { DoubleChoices } from './DoubleChoices';
import { GameCard } from './GameCard';
import { PassInlay } from './PassInlay';
import { GameEndSheet } from './GameEndSheet';
import { isHumanWin, storeEvents, useGameFeedback } from './gameFeedback';
import { diceView, turnView, useGameStore, type BoardStore, type DieView } from './gameStore';
import { addGroup, dropTop, takeBackMoves, undoSize, type MoveGroup } from './moveGroups';
import { isChoosingStarter, nextOpeningRoller, openingDiceInPlay, openingStatus } from './opening';
import { OpeningCard } from './OpeningCard';
import { PlayerStrip, type SeatClock } from './PlayerStrip';
import {
  RAIL_LABEL_LINE,
  RAIL_LANDSCAPE_SECONDARY,
  RAIL_PRIMARY,
  RAIL_SECONDARY,
  RAIL_SUBTITLE_LINE,
  RailButton,
  iconLabelShown,
} from './RailButton';
import { diceWereChosen, diceWereRolled } from './rolledDice';
import { plainSeats, type Seat } from './seats';
import { isStrongWin, passNotice, recordScoring, winType, type WinType } from './turnNotices';
import { answerRaceOffer, useRaceOfferAnswered } from './raceOffer';
import { useAnnouncement } from './useAnnouncement';

/** How long the opening result ("Maria starts with 6-3.") stays, unless a tap closes it (#176). */
export const OPENING_RESULT_MS = 3000;

/**
 * "Grab a chair" (#509) at game start: the scene plays on a cover over the
 * board. The cover shows first while the screen slides in (`LEAD`, and the
 * scene's own short wait), then the scene builds up, rests a beat on its
 * last frame (`HOLD`), and the cover fades out (`FADE`) to show the board.
 * Then the opening card shows.
 */
export const TABLE_INTRO_LEAD_MS = 150;
const TABLE_INTRO_HOLD_MS = 250;
export const TABLE_INTRO_FADE_MS = 350;
/** The whole game-start intro, from mount to the opening card. */
export const TABLE_INTRO_MS =
  TABLE_INTRO_LEAD_MS + TABLE_SCENE_MS + TABLE_INTRO_HOLD_MS + TABLE_INTRO_FADE_MS;

/** The table scene's widest size at game start (Figma: 1.4× of 240). */
const TABLE_INTRO_WIDTH = 336;
/**
 * After an opening tie, Roll waits this long: the dice land first, so a
 * quick second tap does not skip the tie (#176). The tie itself stays on
 * the card until the next roll.
 */
export const OPENING_TIE_WAIT_MS = 1000;
/**
 * "No moves" (the inlay on the bar, #613) closes by itself after this time,
 * in every case: the bot, you, online, fast forward (owner, 2026-11-17).
 * A tap closes it sooner. With a screen reader on it waits for Close.
 */
export const PASS_NOTICE_MS = 2000;
/** "Bot plays on." (the bot's answer to the mother question) shows this long. */
export const BOT_ANSWER_NOTE_MS = 2000;
/** The final position stays on screen this long before the match-end screen opens. */
export const MATCH_END_DELAY_MS = 1000;
/**
 * Online (#355): a roll with no legal move shows its dice before the pass
 * card. Thrown dice (yours, and the other player's since #373) show
 * `PASS_AFTER_THROW_MS` after the throw. Dice that only tumble in the dice
 * row (Reduce Motion) show this long.
 */
export const ONLINE_PASS_DICE_MS = DICE_LAND_MS + 400;
export const PASS_AFTER_THROW_MS = 400;

/** The bot's side in a game vs the bot. */
export interface BotSeat {
  readonly player: PlayerId;
  readonly difficulty: Difficulty;
  readonly runner: BotRunner;
  /** A UI RNG for think time and bot seeds. Never the dice RNG. */
  readonly rng: Rng;
  readonly timing?: Partial<BotTiming>;
  /** Fast forward a race (see the top of this file). Without it there is no Fast forward button. */
  readonly fastForward?: FastForwardSeat;
}

/** How the bot fast forwards a race for both sides. */
export interface FastForwardSeat {
  /** The level that plays the person's side: the strongest one in this game. */
  readonly difficulty: Difficulty;
  /** On top of `FAST_FORWARD_TIMING`, for both sides (tests). */
  readonly timing?: Partial<BotTiming>;
  /**
   * Fast forward played an action for the person: the log index of that
   * event. The review leaves out a turn where it chose something
   * (`GameStoreState.autoEvents`).
   */
  readonly onAutoEvent?: (logIndex: number) => void;
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
  /**
   * Your time ran out in this game (#530): a card over the board in place
   * of the game-end sheet ("Time ran out", "I am here"). Its button is
   * `onClose` too. `null` or left out: the sheet.
   */
  readonly timedOut?: OnlineTimedOutCard | null;
}

/** The texts of the "Time ran out" card (#530). */
export interface OnlineTimedOutCard {
  /** "Time ran out", shown in caps. */
  readonly eyebrow: string;
  /** "Nikos wins this game". */
  readonly title: string;
  /** "1 point. The next game starts now. …". */
  readonly text: string;
  /** "I am here". */
  readonly button: string;
}

/** The clock on the seat of the player the server waits for (online). */
export interface OnlineClock extends SeatClock {
  readonly player: PlayerId;
  /**
   * Your last seconds of a timed turn (#530): the seconds left, 10 down to
   * 1. Each new value plays a soft tick and a light haptic. `null` otherwise.
   */
  readonly tick: number | null;
  /**
   * Read once to screen readers when your last seconds start (#530). The
   * key names the turn for the whole app run. `null` otherwise.
   */
  readonly alert: { readonly key: string; readonly text: string } | null;
}

/** A card over the board, such as "Your time ran out" (online, #255). */
export interface OnlineNoticeCard {
  /** Names this notice for the whole app run, so it is read once (#216). */
  readonly key: string;
  readonly title: string;
  readonly text: string;
  /**
   * It only gives news (#615): no OK, it closes after `PASS_NOTICE_MS` with
   * the countdown line, and a tap closes it sooner. With a screen reader on
   * it keeps OK and waits.
   */
  readonly closesItself: boolean;
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
  /** The time left on the seat of the player the server waits for: "0:42 to move". */
  readonly clock: OnlineClock | null;
  /** The game has a turn time (#530): the seats keep room for the turn ring. */
  readonly timed: boolean;
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
  /**
   * Shows the chat button beside the other seat (an online game with a
   * chat, #692). `unread`: the count of new messages on the button.
   * `peek`: a new message to show for a moment over the screen (#709); a
   * tap on it opens the chat.
   */
  chat?: {
    readonly unread: number;
    readonly peek?: { readonly name: string; readonly text: string } | null;
    readonly label: string;
    readonly hint: string;
    readonly onOpen: () => void;
  };
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
   * shows it under the seats; the tall one and landscape leave it to the
   * menu (#184).
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
  /**
   * Support Tavlaki (#590): a local match (vs the bot or pass-and-play)
   * counts each game that ends here, and the ask card may show over the
   * game-end sheet. `onSupport` opens the Support screen. Online games and
   * the tutorial pass none.
   */
  supportAsk?: { onSupport: () => void };
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
  chat,
  onHome,
  onReview,
  onMatchOver,
  gameLabel,
  nextGameLabel,
  analyzer,
  onHintShown,
  online,
  supportAsk,
}: GameScreenProps) {
  const { t } = useTranslation();
  const theme = useBoardTheme();
  const reduceMotion = useReducedMotion();
  const flow = useGameStore(store, (s) => s.flow);
  const dispatch = useGameStore(store, (s) => s.dispatch);
  // Names the match for this app run: every screen reader event keys on it,
  // so a remount does not read an event again (#216).
  const matchKey = useGameStore(store, (s) => s.matchKey);
  const flipMode = useSettings((s) => s.boardFlipMode);
  const autoConfirm = useSettings((s) => s.autoConfirmMoves);
  const showHints = useSettings((s) => s.showHints);
  const offerFastForward = useSettings((s) => s.offerFastForward);
  const setSetting = useSettings((s) => s.setSetting);
  const showMoveList = useMoveListShown();
  const moveListAsked = useMoveListAsked();
  const { layout, rails, spaceKey } = useScreenLayout();
  // The app's colors (the board theme is `theme`).
  const { theme: ui, rt } = useUnistyles();
  const landscape = layout === 'landscape';
  // On its side the wide board takes the margin away from the island (#611).
  const island = useIslandSide();
  // Rows (#649, #659, the open iPhone Duo): the portrait top row, the deep
  // board and the landscape button rail.
  const rows = layout === 'rows';
  // The top row's height: the rail in rows starts under it.
  const [leadHeight, setLeadHeight] = useState(0);
  const classic = layout === 'classic' || rows;
  const tall = layout === 'tall';
  // The iPhone Duo keeps its camera in a column on the right (inset 84 pt,
  // top inset 0, on both screens). Under the clock that column is empty, so
  // the classic board and the button rail use it; only the top row keeps
  // clear of it (#659).
  const duoColumn = !landscape && rt.insets.top === 0 && rt.insets.right > 0;
  const cameraColumn = duoColumn ? rt.insets.right : 0;
  // Rows, and the tall board on the closed Duo, put the round buttons on a
  // rail in that column, so the board gets the height of the button row.
  const sideRail = rows || (tall && duoColumn);
  // Landscape and the side rail use the rail button sizes.
  const railLayout = landscape || sideRail;

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
  // Fast forward a race: the bot plays both sides to the end of this game.
  // Keyed by the game, so it ends with it; Stop clears it.
  const fastForwardSeat = online === undefined ? (bot?.fastForward ?? null) : null;
  const [fastForwardKey, setFastForwardKey] = useState<string | null>(null);
  const raceKey = `${matchKey}:${gameKey}`;
  const fastForwarding =
    fastForwardSeat !== null && fastForwardKey === raceKey && view.matchPhase === 'playing';
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
  // Online, your last seconds of a timed turn (#530): a soft tick and a
  // light haptic each second, and one line for screen readers.
  // One tick per new second shown: a new `feedback` plays none.
  const clockTick = online?.clock?.tick ?? null;
  const playTick = useEffectEvent(() => feedback.event('clockTick'));
  useEffect(() => {
    if (clockTick !== null) playTick();
  }, [clockTick]);
  const clockAlert = online?.clock?.alert ?? null;
  useAnnouncement(clockAlert?.text ?? null, clockAlert?.key);

  // No legal moves: the flow has passed the turn already; the inlay says why.
  const pass = passNotice(flow);
  const [passDismissed, setPassDismissed] = useState<string | null>(null);
  const passKey = pass?.key ?? null;
  // Online (#355): the dice of the pass show first, then the card (`passReady`).
  const [passReady, setPassReady] = useState<string | null>(null);
  const passWaits = online !== undefined && pass !== null && passReady !== pass.key;
  const showPass = pass !== null && !passWaits && passDismissed !== pass.key;
  // Every pass closes by itself after `PASS_NOTICE_MS` (#613), yours too:
  // there is nothing to decide. Not while paused (the menu covers the
  // board), and not with a screen reader on: it waits for Close. The
  // inlay runs the timer itself, so a pass under a card (an online notice)
  // waits until the inlay is in view.
  const screenReader = useScreenReaderEnabled();
  const passRuns = showPass && !paused && !screenReader;

  // Pass-and-play "flip": the player to move sits at the bottom. While the
  // pass inlay shows, the board stays with the player who passed.
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
  // A tap-to-roll comes from the roller's wall: the angle the roller looks at
  // the board from. In a game that does not flip to the roller (pass-and-play
  // on the fixed board, the bot on top), the roller may sit on the opposite
  // wall from the viewer (#183).
  const nearEnd: 'top' | 'bottom' = sideOf(view.toMove, boardView) === 'player' ? 'bottom' : 'top';

  // The opening card: while rolling (a tie stays until the next roll), then
  // the result until a tap or for a moment (#176).
  const opening = openingStatus(game);
  const [openingDismissed, setOpeningDismissed] = useState<string | null>(null);
  const decided = opening?.kind === 'decided';
  // The result closes after `OPENING_RESULT_MS`: the card's countdown line
  // runs that timer (#615), so the line and the close agree, and a result
  // under another card is not closed unseen.
  // Online too (#379): the first game's opening waits for each player's die.
  const showOpening = opening !== null && !(decided && openingDismissed === gameKey);
  // "Grab a chair" (#509): when a match opens, the table scene plays over the
  // board before the opening card. Once per match: the screen reads the
  // match it opened with, and a rematch (same store, new screen) plays none
  // (`introRuns.ts`). A tap skips it; Reduce motion and a screen reader skip
  // it too (`useMoveListAsked`: in a browser only the Move list setting
  // counts, since a page cannot know of a screen reader, #681).
  const [introMatch] = useState(() =>
    opening !== null && match.games.length === 0 && matchIntroDue(matchKey, store)
      ? matchKey
      : null,
  );
  const [introDone, setIntroDone] = useState(false);
  const showIntro =
    introMatch !== null && !introDone && !reduceMotion && !moveListAsked && showOpening;
  useEffect(() => {
    if (introMatch !== null) markMatchIntroPlayed(introMatch, store);
  }, [introMatch, store]);
  // The cover over the board fades out once the chair is in.
  const introCover = useSharedValue(1);
  useEffect(() => {
    if (!showIntro) return;
    introCover.set(
      withDelay(
        TABLE_INTRO_MS - TABLE_INTRO_FADE_MS,
        withTiming(0, { duration: TABLE_INTRO_FADE_MS }),
      ),
    );
    const timer = setTimeout(() => setIntroDone(true), TABLE_INTRO_MS);
    return () => clearTimeout(timer);
  }, [showIntro, introCover]);
  const introCoverStyle = useAnimatedStyle(() => ({ opacity: introCover.get() }));
  const windowSize = useWindowDimensions();
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
    prompt !== null &&
    prompt.player !== botPlayer &&
    (me === null || prompt.player === me) &&
    // A fast forward answers for you too.
    !fastForwarding;
  // House rule `chosenStarterRolls` (#207): a card asks who starts. In
  // pass-and-play either player picks; vs the bot, the human does.
  const choosing = view.matchPhase === 'playing' && isChoosingStarter(game);
  // Online: a game-end sheet or a notice covers the board.
  const onlineCovered = online !== undefined && (online.ended !== null || online.notice !== null);
  const boardCovered =
    matchOver ||
    gameOver ||
    showPass ||
    passWaits ||
    showOpening ||
    askHuman ||
    choosing ||
    onlineCovered;
  // Fast forward is offered on your roll, vs the bot, once the game is a race.
  const human = botPlayer === null ? null : other(botPlayer);
  // The game is a race that Fast forward may play (vs the bot, in play).
  const raceOn = useMemo(
    () => fastForwardSeat !== null && view.matchPhase === 'playing' && isRace(game.state),
    [fastForwardSeat, view.matchPhase, game.state],
  );
  const raceReady =
    raceOn &&
    !fastForwarding &&
    phase === 'awaiting-roll' &&
    view.toMove === human &&
    !boardCovered;
  // The race card asks once per game, on your first roll of the race, until
  // you turn it off ("Don't ask again" or the setting).
  const raceAnswered = useRaceOfferAnswered(raceKey);
  const showRaceCard = raceReady && offerFastForward && !raceAnswered;
  const blocked = boardCovered || showRaceCard;

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
  // The side the bot plays now: its own, or during a fast forward the side
  // that acts (the player a question asks, else the player to move).
  const autoSide: PlayerId | null =
    fastForwarding && phase !== 'opening-roll'
      ? (prompt?.player ?? view.toMove)
      : botsTurn
        ? botPlayer
        : null;
  // The bot (also for you, in a fast forward) or the remote player has the
  // board: your touches do nothing.
  const othersTurn = botsTurn || fastForwarding || remoteStatus !== null;
  // After the card, Fast forward stays next to Roll for the rest of the race.
  const canFastForward = raceReady && !showRaceCard;
  // A long Fast forward label (Greek) wraps to two lines under its circle.
  // For the rest of the race the portrait row keeps that room, so the board
  // does not shrink and grow back on every roll.
  const [fastForwardLines, setFastForwardLines] = useState(1);
  const raceRoom = !landscape && raceOn && fastForwardLines > 1;

  // One checker with several dice (#180): the "2+3" targets, from the engine.
  const paths = useMemo(() => (othersTurn ? [] : flowPaths(game)), [game, othersTurn]);
  // The combined moves of this turn, so one Undo takes back each one whole.
  // The handlers read the ref (it is current right after a dispatch); the
  // render reads the copy in state, for the board's take-back (#626).
  const groups = useRef<readonly MoveGroup[]>([]);
  const [shownGroups, setShownGroups] = useState<readonly MoveGroup[]>([]);
  const setGroups = (next: readonly MoveGroup[]) => {
    groups.current = next;
    setShownGroups(next);
  };

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

  // Online (#379) you roll only your own opening die, while it is not in;
  // the other player may roll theirs first.
  const roller =
    online === undefined
      ? nextOpeningRoller(game)
      : phase === 'opening-roll' && game.opening !== null && game.opening[online.me] === null
        ? online.me
        : null;
  // With `rerollBoth` (#207) the starter rolls after the opening result closes.
  // Online your turn waits for your roll (#355): the server rolls when you ask.
  const onlineRoll =
    online !== undefined &&
    !online.locked &&
    !onlineCovered &&
    ((phase === 'awaiting-roll' && view.toMove === online.me) || roller !== null);
  const canRoll =
    (online === undefined || onlineRoll) &&
    !showPass &&
    !passWaits &&
    !botsTurn &&
    !fastForwarding &&
    !showRaceCard &&
    !(decided && showOpening) &&
    (phase === 'awaiting-roll' || (roller !== null && !tieWait));

  // The dice throw of the last roll (issue #183). `throwReq` arms a throw
  // on the roll; while it plays the dice row waits (it would tumble again
  // what the throw has already landed). After the throw, `thrownTurn` marks
  // the roll as thrown, so the row shows it without a roll of its own,
  // until the next roll arms a new throw.
  const [throwReq, setThrowReq] = useState<{
    key: string;
    values: readonly [number, number];
    swipe: ThrowSwipe | null;
    /** The other player's roll online comes from their wall (#373). */
    wall?: 'top' | 'bottom';
  } | null>(null);
  const [thrownTurn, setThrownTurn] = useState<string | null>(null);
  const endThrow = () => setThrowReq(null);
  // Online (#355): your roll is a call. `from` is the flow it was asked on;
  // the throw is armed when a newer flow brings the roll (`armSentRoll`).
  // In the render that brings it, the dice row already waits for the throw.
  // A failed call keeps it until the next flow: only your own roll puts a
  // roll in a new flow's log, so a lost answer's late view still throws.
  const [rollSent, setRollSent] = useState<{
    from: MatchFlow;
    swipe: ThrowSwipe | null;
  } | null>(null);
  const rollArrived =
    rollSent !== null && rollSent.from !== flow && flow.log.at(-1)?.type === 'roll';
  const throwPlaying = throwReq !== null || rollArrived;
  // Arms the throw of the roll just dispatched: the swipe that caused it
  // plays it back (`null`: the throw comes from the near wall — the button,
  // a tap, the bot). With Reduce Motion the dice appear as before.
  const armThrow = (swipe: ThrowSwipe | null) => {
    if (reduceMotion) return;
    const flowNow = store.getState().flow;
    const event = flowNow.log[flowNow.log.length - 1];
    if (event === undefined || event.type !== 'roll' || event.dice === undefined) return;
    const key = `${String(flowNow.match.games.length)}:${flowNow.game.state.turnNumber}`;
    setThrownTurn(key);
    setThrowReq({ key, values: event.dice, swipe });
  };
  const roll = (swipe?: ThrowSwipe) => {
    if (!canRoll) return;
    if (phase === 'awaiting-roll') {
      const from = store.getState().flow;
      if (!dispatch({ type: 'roll', player: view.toMove })) return;
      // Online the dice come later, with the server's view.
      if (online === undefined) armThrow(swipe ?? null);
      else setRollSent({ from, swipe: swipe ?? null });
    } else if (roller !== null) {
      // The opening dice show on the card, at rest: the card covers the
      // board, so a throw under it would be invisible. The first throw of
      // the game is the first turn's roll.
      const ok = dispatch({ type: 'rollOpening', player: roller });
      if (ok && openingTaps === 'one' && roller === 'white') {
        dispatch({ type: 'rollOpening', player: 'black' });
      }
    }
  };
  const onDiceLanded = () => feedback.event('diceLand');
  // A swipe over the opening card rolls too, like on the board (the card covers it).
  const openingSwipe = usePanGesture({
    minDistance: BOARD_GESTURES.pan.minDistance,
    testID: 'opening-swipe',
    onActivate: (e) => {
      'worklet';
      const t = e as { translationX?: number; translationY?: number };
      scheduleOnRN(roll, {
        dx: t.translationX ?? e.x,
        dy: t.translationY ?? e.y,
      });
    },
  });

  // The swipe-to-roll area (#183, #625): the whole game screen (the seats,
  // the board region, the buttons), so a swipe may start anywhere. It needs
  // more movement than the board's own pan, so on the board that one always
  // activates first and wins: checkers still drag there, and a swipe that
  // starts on the board rolls through the board. A tap never activates a
  // pan, so the buttons keep their taps; a swipe that starts on a button
  // rolls (the active pan cancels the press). It is on only while you may
  // roll and no card covers the board (`enabled: false` otherwise), so it
  // never takes the touches of a card, a move or the rails' scroll. Never
  // turn it off with a huge `minDistance`: on iOS a pan that stays began
  // stops the board's tap from ending (#611).
  //
  // It rolls when the finger lifts, with the fastest finger speed of the
  // swipe (`keepPeak`), so a flick that slows at the end still throws hard.
  // Where the finger went down picks the side the dice come in from, and
  // that needs the board's points: the board frame's origin in this view
  // (the middle's place plus the frame's place in it) shifts the touch into
  // the board's space.
  const areaStartX = useSharedValue(0);
  const areaStartY = useSharedValue(0);
  const areaVX = useSharedValue(0);
  const areaVY = useSharedValue(0);
  const middleX = useSharedValue(0);
  const middleY = useSharedValue(0);
  const boardFrameX = useSharedValue(0);
  const boardFrameY = useSharedValue(0);
  const swipeArea = usePanGesture({
    // Off while the move list shows: it scrolls (in landscape next to the
    // board), and a scroll must never roll. The board's own pan still rolls.
    enabled: canRoll && phase === 'awaiting-roll' && !blocked && !showMoveList,
    minDistance: SWIPE_AREA.minDistance,
    testID: 'game-swipe-area',
    onBegin: (e) => {
      'worklet';
      areaStartX.set(e.x);
      areaStartY.set(e.y);
      areaVX.set(0);
      areaVY.set(0);
    },
    onUpdate: (e) => {
      'worklet';
      keepPeak(areaVX, areaVY, e);
    },
    onDeactivate: (e) => {
      'worklet';
      if (!e.canceled) {
        keepPeak(areaVX, areaVY, e);
        const dx = middleX.get() + boardFrameX.get();
        const dy = middleY.get() + boardFrameY.get();
        const swipe = swipeEnd(
          { x: areaStartX.get(), y: areaStartY.get() },
          e,
          areaVX.get(),
          areaVY.get(),
        );
        scheduleOnRN(roll, { ...swipe, x: swipe.x - dx, y: swipe.y - dy });
      }
    },
  });

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
    if (!turnEnded) setGroups(addGroup(groups.current, next, steps.length));
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
   * one engine `undo` per step, and one flight back along the path. `from`:
   * the checker was dragged back and dropped there (#626), so it flies on
   * from that point.
   */
  const undo = (from?: { x: number; y: number }): boolean => {
    const now = store.getState().flow;
    const size = undoSize(groups.current, now.game);
    const taken = now.game.played.slice(now.game.played.length - size);
    const mover = now.game.state.toMove;
    const before = turnView(now).board;
    setGroups(dropTop(groups.current, now.game));
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
        ? pathFlights(geo, boardView, mover, taken, after, {
            id,
            undo: true,
            direction,
            ...(from ? { from } : {}),
          })
        : moveFlights(geo, boardView, mover, last, before, after, {
            id,
            undo: true,
            ...(from ? { from } : {}),
          });
    setFlights(back);
    return true;
  };

  /**
   * The board's take-back (#626): the checker of the last move group was
   * dragged, or tapped and then tapped, back where the group started. It is
   * the Undo button, so it takes back the same moves. If the turn changed
   * since the board drew the target (other moves), nothing happens and the
   * checker flies back.
   */
  const onTakeBack = (
    moves: readonly Move[],
    _geo: BoardGeometry,
    from: { x: number; y: number } | null,
  ): boolean => {
    if (othersTurn || blocked || showPass || passWaits) return false;
    const now = store.getState().flow.game;
    const expected = takeBackMoves(groups.current, now);
    const same =
      expected.length === moves.length &&
      expected.every((move, i) => {
        const other = moves[i];
        return other !== undefined && sameMove(move, other);
      });
    if (!same) return false;
    return undo(from ?? undefined);
  };
  // Only while the Undo button could take it back, on your own turn.
  const takeBackNow =
    view.canUndo && !blocked && !othersTurn && !showPass && !passWaits
      ? takeBackMoves(shownGroups, game)
      : [];

  const confirm = (): boolean => {
    const mover = store.getState().flow.game.state.toMove;
    if (!dispatch({ type: 'confirm', player: mover })) return false;
    setFlights([]);
    return true;
  };

  // Online (#255): the other player's turn ends in one view. Its moves fly
  // one after the other from the board of the view before. Live moves
  // (#374): each draft flies its new moves, or flies the ones taken back
  // back; the end of the turn flies only the moves not shown yet.
  const seenFlow = useRef(flow);
  const remoteFlights = useRef(0);
  const flyRemoteTurn = useEffectEvent((before: MatchFlow, after: MatchFlow) => {
    const geo = geoRef.current;
    if (me === null || geo === null) return;
    const turn = remoteSteps(before, after, me);
    if (turn === null) return;
    remoteFlights.current += 1;
    const flying = turnFlights(geo, boardView, turn.player, turn.moves, turn.before, {
      id: `r${remoteFlights.current}`,
      direction,
      ...(turn.undo ? { undo: true } : {}),
    });
    setFlights(flying);
    // The turn ended the game: the end waits until it lands (#299).
    if (after.game.result !== null) {
      setLanding({ key: `${matchKey}:${after.match.games.length}`, ms: flightsEndMs(flying) });
    }
  });
  // Online (#355): the first flow after your roll call. It brings the
  // roll (the throw plays), or something else (the call failed, the game
  // changed): then nothing is thrown.
  const armSentRoll = useEffectEvent(() => {
    if (rollSent === null || rollSent.from === flow) return;
    setRollSent(null);
    if (rollArrived) armThrow(rollSent.swipe);
  });
  // Online (#373): the other player's roll is thrown over the board from
  // their wall, as if they threw it. A pass is thrown too; its card waits
  // for the throw (`passWaits`). With Reduce Motion the dice appear as before.
  const throwRemoteRoll = useEffectEvent((before: MatchFlow, after: MatchFlow) => {
    if (me === null || reduceMotion) return;
    const rolled = remoteRoll(before, after, me);
    if (rolled === null) return;
    const key = `${String(after.match.games.length)}:${after.game.state.turnNumber}`;
    setThrownTurn(key);
    setThrowReq({
      key,
      values: rolled.dice,
      swipe: null,
      wall: sideOf(rolled.player, boardView) === 'player' ? 'bottom' : 'top',
    });
  });
  const isOnline = online !== undefined;
  // A layout effect: the flights and the throw start in the same frame as
  // the new board, so the turn's end never shows first for a frame.
  useLayoutEffect(() => {
    const before = seenFlow.current;
    seenFlow.current = flow;
    if (isOnline && before !== flow) {
      flyRemoteTurn(before, flow);
      armSentRoll();
      throwRemoteRoll(before, flow);
    }
  }, [flow, isOnline]);

  // The bot's turn. It starts when nothing covers the board, and stops when
  // the screen pauses (menu) or goes away. Same key = same turn. During a
  // fast forward it plays the turns of both sides.
  const botActive = autoSide !== null && !blocked && !paused;
  const botKey = `${gameKey}:${game.state.turnNumber}`;
  // A fast forward shows its dice at rest: no throw, no tumble. Stop keeps
  // them at rest for the rest of that turn, so they do not roll again.
  const [restTurn, setRestTurn] = useState<string | null>(null);
  // The review leaves out your turns whose moves the fast forward chose:
  // each action it plays for your side is marked by its log index.
  const markAuto = (side: PlayerId) => {
    if (side === botPlayer) return;
    fastForwardSeat?.onAutoEvent?.(store.getState().flow.log.length - 1);
  };
  const marked = (side: PlayerId, done: boolean): boolean => {
    if (done && fastForwarding) markAuto(side);
    return done;
  };
  const botRoll = useEffectEvent((side: PlayerId) => {
    if (!dispatch({ type: 'roll', player: side })) return false;
    if (fastForwarding) {
      const now = store.getState().flow;
      setRestTurn(`${String(now.match.games.length)}:${now.game.state.turnNumber}`);
      markAuto(side);
    } else {
      armThrow(null);
    }
    return true;
  });
  const botMove = useEffectEvent((side: PlayerId, move: Move) =>
    marked(side, playMove(move, geoRef.current, null, false)),
  );
  const botUndo = useEffectEvent((side: PlayerId) => marked(side, undo()));
  const botConfirm = useEffectEvent((side: PlayerId) => marked(side, confirm()));
  // The bot's answer to the mother question; a short note says what it chose.
  const [botChoice, setBotChoice] = useState<{ key: string; choice: string } | null>(null);
  const botAnswer = useEffectEvent((side: PlayerId, choice: string) => {
    if (!marked(side, dispatch({ type: 'answer', player: side, choice }))) return false;
    if (side === botPlayer) setBotChoice({ key: botKey, choice });
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
    if (!botActive || seat === undefined || autoSide === null) return;
    const side = autoSide;
    // A fast forward plays your side at its own level, and both sides fast.
    const ff = fastForwarding ? seat.fastForward : undefined;
    const timing = ff === undefined ? seat.timing : { ...FAST_FORWARD_TIMING, ...ff.timing };
    const handle = startBotTurn({
      player: side,
      difficulty: ff !== undefined && side !== seat.player ? ff.difficulty : seat.difficulty,
      runner: seat.runner,
      rng: seat.rng,
      ...(timing ? { timing } : {}),
      getFlow: () => store.getState().flow,
      actions: {
        roll: () => botRoll(side),
        move: (move) => botMove(side, move),
        undo: () => botUndo(side),
        confirm: () => botConfirm(side),
        answer: (choice) => botAnswer(side, choice),
      },
      onError: (error) => console.error('bot turn failed', error),
    });
    return handle.cancel;
  }, [botActive, botKey, store, autoSide, fastForwarding]);

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
  // Your roll from this phone (#355) starts the log: it is read as a
  // local roll ("You rolled 5-3."), and your moves after it are not read.
  // Its key names the view too: one server roll, read once.
  // A fast forward reads one line when it starts, not every roll and move.
  const announcement = fastForwarding
    ? null
    : online === undefined
      ? turnAnnouncement(flow, t, { nameOf, isYou })
      : flow.log[0]?.type === 'roll'
        ? (() => {
            const local = turnAnnouncement(flow, t, { nameOf, isYou });
            return local === null ? null : { ...local, key: `v${online.version}:${local.key}` };
          })()
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
  // Online: why nothing moved (the server passed), in a line over the
  // board for a moment. The opening card says who starts (#379).
  const onlineLineText = online === undefined ? null : onlinePassLine(game, t, { nameOf, isYou });
  const onlineLineKey =
    onlineLineText === null ? null : `${gameKey}:${game.state.turnNumber}:${onlineLineText}`;
  const [onlineLineSeen, setOnlineLineSeen] = useState<string | null>(null);
  useEffect(() => {
    if (onlineLineKey === null) return;
    const timer = setTimeout(() => setOnlineLineSeen(onlineLineKey), OPENING_RESULT_MS);
    return () => clearTimeout(timer);
  }, [onlineLineKey]);
  // The pass inlay says it already, and its dice show first (#355).
  const onlineLine =
    onlineLineText !== null &&
    onlineLineSeen !== onlineLineKey &&
    online?.ended === null &&
    !showPass &&
    !passWaits
      ? onlineLineText
      : null;
  useAnnouncement(
    fastForwarding ? t('game.fastForward.started') : null,
    fastForwarding ? `${raceKey}:fastForward` : undefined,
  );
  // The hint is read out once it shows (#209). It is not a game event: the
  // user asked for it, and a remount closes it (it is screen state).
  useAnnouncement(shownHint === null ? null : hintSpokenText(t, shownHint));

  // The dice on the board: this turn's, or the dice of a pass, all slashed
  // as dice that cannot be played (#613).
  const passDice: DieView[] = pass
    ? diceView(pass.dice, diceMoves(pass.dice), diceMoves(pass.dice))
    : [];
  const dice = showPass || passWaits ? passDice : view.dice;

  // Online (#355): the pass inlay waits until the dice of the pass have
  // shown: after the throw (yours or theirs, #373), or after the dice
  // tumbled in the row (Reduce Motion).
  const passWaitMs =
    thrownTurn === `${gameKey}:${game.state.turnNumber}`
      ? PASS_AFTER_THROW_MS
      : ONLINE_PASS_DICE_MS;
  useEffect(() => {
    if (!passWaits || passKey === null || throwPlaying) return;
    const timer = setTimeout(() => setPassReady(passKey), passWaitMs);
    return () => clearTimeout(timer);
  }, [passWaits, passKey, throwPlaying, passWaitMs]);
  // The opening dice already rolled in the card: show them at rest. So do
  // dice that no roll gave: a double chosen after a 1-2 (Acey-Deucey, #177).
  // Both have no roll in the log. With `rerollBoth` (#207) the starter's
  // first dice are a roll of their own: they tumble.
  // Before a roll the key names the coming turn, as in every turn: no dice
  // row is drawn and the reveal waits for a double, so nothing plays until
  // the dice come (the opening roll too).
  // Online the log is empty: every roll comes from the server and tumbles,
  // but a chosen double does not, and the opening dice showed on the card.
  const atRest =
    showPass ||
    restTurn === `${gameKey}:${game.state.turnNumber}` ||
    (game.state.dice !== null &&
      (online === undefined
        ? !diceWereRolled(flow)
        : stateHasChosenDouble(game) ||
          (openingDiceInPlay(flow) && rules.match.openingRoll === 'useOpeningDice')));
  // While the throw plays, the dice row waits: it would tumble again what
  // the throw has already landed. After it, the row shows the roll without
  // a tumble of its own (`rest`, until the next roll re-keys it).
  const turnKey = `${gameKey}:${game.state.turnNumber}`;
  const rollKey = atRest || throwPlaying ? null : turnKey;
  const thrownRest = !throwPlaying && thrownTurn === turnKey;
  // A rolled double shows its two dice first, then splits into four (#177).
  const reveal = useDoubleReveal(rollKey, dice);

  // The opening Roll button sits on the opening card, next to the dice (#176).
  // Online it is only ever your own die: no name.
  const openingRollLabel =
    online !== undefined
      ? t('game.roll.openingYours')
      : openingTaps === 'perPlayer' && roller !== null
        ? t('game.roll.openingFor', { name: nameOf(roller) })
        : t('game.roll.opening');
  // Online (#379): once your die is in, the card says what the server waits
  // for in place of Roll. While your roll is on its way, Roll waits.
  const openingWait = online !== undefined && roller === null ? online.status : null;

  // The dice lie on the board (#184), in the theme's dice area, in every
  // layout. The turn buttons are round (Figma "18 Game · Portrait and
  // landscape"): the main circle (Roll, Confirm) under the right thumb on
  // the right rail in landscape, in the middle under the board in portrait;
  // Undo (or Fast forward) next to it; the hint on the other side. While
  // the bot, the other player online or fast forward plays, a short status
  // text takes the buttons' place.
  let showDice = false;
  let undoButton = null;
  let hintButton = null;
  // Undo and Confirm show (after the roll): only then does the hint's dim
  // circle show too (#619).
  let turnButtons = false;
  let mainButton = null;
  let status: { readonly testID: string; readonly text: string } | null = null;
  // Portrait: "or swipe the board" sits left of Roll, in Undo's place.
  let rollAside: string | null = null;
  // Undo, Fast forward and the hint have one size. In portrait every circle
  // sits in a box as tall as the main one, so the three share a center line.
  const sideSize = railLayout ? RAIL_LANDSCAPE_SECONDARY : RAIL_SECONDARY;
  const circleBox = railLayout ? undefined : RAIL_PRIMARY;
  if (phase === 'opening-roll') {
    mainButton = null;
  } else if (remoteStatus !== null) {
    // Online: the server waits for the other player (or has your turn on its way).
    showDice = dice.length > 0;
    status = { testID: 'online-wait', text: remoteStatus };
  } else if (fastForwarding) {
    // Fast forward: the bot plays both sides. Stop gives you the board back.
    showDice = dice.length > 0;
    status = { testID: 'fast-forward-status', text: t('game.fastForward.playing') };
    mainButton = (
      <RailButton
        testID="fast-forward-stop-button"
        label={t('game.fastForward.stop')}
        accessibilityLabel={t('game.fastForward.stopLabel')}
        kind="secondary"
        icon="square"
        circleBox={circleBox}
        onPress={() => setFastForwardKey(null)}
      />
    );
  } else if (botsTurn && !showPass && view.matchPhase === 'playing') {
    const rolled = game.state.dice;
    showDice = dice.length > 0;
    // No live region: the roll and the bot's moves are announced (`turnAnnouncement`).
    status = {
      testID: 'bot-turn',
      text:
        rolled !== null && phase !== 'awaiting-roll'
          ? diceWereChosen(flow, rolled)
            ? t('game.bot.choseMoving', { dice: rolled.join('-') })
            : t('game.bot.moving', { dice: rolled.join('-') })
          : t('game.bot.waiting'),
    };
  } else if (
    phase === 'awaiting-roll' &&
    !showPass &&
    !passWaits &&
    !showOpening &&
    !showRaceCard &&
    (online === undefined || onlineRoll)
  ) {
    // In a race vs the bot, Fast forward takes Undo's place next to Roll.
    undoButton = canFastForward ? (
      <RailButton
        testID="fast-forward-button"
        label={t('game.fastForward.button')}
        accessibilityLabel={t('game.fastForward.label')}
        kind="secondary"
        icon="fastForward"
        size={sideSize}
        circleBox={circleBox}
        onLabelLines={setFastForwardLines}
        onPress={() => setFastForwardKey(raceKey)}
      />
    ) : null;
    if (!landscape && !canFastForward) rollAside = t('game.roll.orSwipeBoard');
    // While the `rerollBoth` result shows (#207), Roll waits for it to close.
    mainButton = (
      <RailButton
        testID="roll-button"
        label={t('game.roll.dice')}
        subtitle={t('game.roll.orSwipeBoard')}
        subtitleBeside={!railLayout}
        icon="dices"
        circleBox={circleBox}
        onPress={() => roll()}
      />
    );
  } else if (phase === 'moving' || phase === 'awaiting-confirm' || showPass || passWaits) {
    showDice = true;
    turnButtons = true;
    hintButton = hintProps ? (
      <RailButton
        testID="hint-button"
        label={hintProps.label}
        accessibilityLabel={hintProps.accessibilityLabel}
        kind="secondary"
        icon="lightbulb"
        size={sideSize}
        circleBox={circleBox}
        // A large font shows the word under the circle too (#499).
        iconOnly
        busy={hintProps.busy}
        onPress={hintProps.onPress}
      />
    ) : null;
    undoButton = (
      <RailButton
        testID="undo-button"
        label={t('game.controls.undoLabel')}
        kind="secondary"
        icon="undo"
        size={sideSize}
        circleBox={circleBox}
        disabled={!view.canUndo || showPass || passWaits}
        onPress={() => undo()}
      />
    );
    mainButton = (
      <RailButton
        testID="confirm-button"
        label={t('game.controls.confirm')}
        icon="check"
        circleBox={circleBox}
        disabled={!view.canConfirm || showPass || passWaits}
        onPress={confirm}
      />
    );
  }
  // The hint keeps its place when it cannot be used, so the buttons never
  // move between the roll and the move. With Undo and Confirm it is a dim
  // circle; before the roll, in the opening and on the other side's turn
  // the place stays empty, like Undo's (#619).
  const hintSlot =
    hintButton ??
    (analyzer !== undefined && showHints ? (
      <View
        testID="hint-placeholder"
        style={styles.hintPlaceholder(iconLabelShown(windowSize.fontScale))}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        <View style={styles.hintPlaceholderBox(Math.max(sideSize, circleBox ?? sideSize))}>
          {turnButtons ? (
            <View testID="hint-placeholder-circle" style={styles.hintPlaceholderCircle(sideSize)}>
              <Icon
                name="lightbulb"
                color={ui.colors.textFaint}
                size={Math.round(sideSize * 0.4)}
              />
            </View>
          ) : null}
        </View>
      </View>
    ) : null);
  const statusText =
    status !== null ? (
      <Text testID={status.testID} style={styles.statusText(railLayout)}>
        {status.text}
      </Text>
    ) : null;
  // The dice stay mounted while the board measures its new space (so a roll
  // does not start again), but hide until they have their new place.
  const placeGeo = freshGeo ?? boardGeo?.geo ?? null;
  const diceBox = showDice && placeGeo !== null ? boardDiceBox(placeGeo, dice.length) : null;
  // On the web the dice canvas stays mounted between rolls, hidden (#679):
  // a new canvas is a new WebGL context, and its first draws block the page.
  const diceMountBox =
    diceBox ?? (WEB_BOARD && placeGeo !== null ? boardDiceBox(placeGeo, 2) : null);
  const diceHidden = freshGeo === null || throwPlaying || diceBox === null;
  // The hand-over of the throw (#183): the dice row lies on the board,
  // inside the canvas, so the thrown dice glide into it.
  const settle =
    diceBox !== null
      ? settleTargets(diceBox, dice.length, theme.layouts['portrait-rotated'].dice.tilt)
      : null;

  // Game end (wireframe 8): a sheet over the final board. Match end is
  // another screen (`onMatchOver`), so nothing covers the board then.
  // Online (#255) the server has already started the next game: the sheet
  // shows the game that ended (`online.ended`), from its record. While the
  // turn that ended it flies (`landingWait`, #299), no sheet shows yet.
  const ended = landingWait ? null : (online?.ended ?? null);
  // Your time ran out (#530): a card over the board says so, not the sheet.
  const timedOut = ended?.timedOut ?? null;
  const ending =
    landingWait || timedOut !== null
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
  // Support Tavlaki (#590): a local game that ended here counts once; the
  // last game of a match counts on the match-end screen instead. It counts
  // only once the end sheet shows (`ending`), so the count and the card
  // always go together: nothing counts while the sheet waits (today only
  // an online turn flies first, and online screens pass no `supportAsk`).
  const localEnd =
    supportAsk !== undefined &&
    ending !== null &&
    ended === null &&
    gameOver &&
    game.result !== null;
  const ask = useSupportAsk(localEnd ? `${matchKey}:end:${gameKey}` : null, {
    games: 1,
    won: localEnd && isHumanWin(game.result?.winner, humans),
  });
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
  // "No moves" is no card: an inlay on the bar, the board stays in view (#613).
  let inlay = null;
  if (ended !== null && timedOut !== null) {
    // Online (#530): "Time ran out", over the end of the game you lost on time.
    card = (
      <GameCard
        key={ended.key}
        testID="time-ran-out-card"
        announceKey={ended.key}
        eyebrow={timedOut.eyebrow}
        title={timedOut.title}
        lines={[timedOut.text]}
        centered>
        <ActionButton
          testID="time-ran-out-button"
          label={timedOut.button}
          onPress={() => {
            setFlights([]);
            ended.onClose();
          }}
        />
      </GameCard>
    );
  } else if (!over && notice !== null) {
    // Online (#255): "Your time ran out", "The game changed", …. A notice
    // that only gives news closes by itself (#615), like the pass inlay:
    // not while paused, and with a screen reader on it keeps OK.
    const byItself = notice.closesItself && !screenReader;
    const noticeCard = (
      <GameCard
        key={notice.key}
        testID="online-notice-card"
        announceKey={`${matchKey}:notice:${notice.key}`}
        title={notice.title}
        lines={[notice.text]}
        {...(byItself
          ? {
              countdown: {
                durationMs: PASS_NOTICE_MS,
                running: !paused,
                onEnd: notice.onClose,
              },
            }
          : {})}>
        {byItself ? null : (
          <ActionButton
            testID="online-notice-ok-button"
            label={t('game.pass.ok')}
            kind="secondary"
            onPress={notice.onClose}
          />
        )}
      </GameCard>
    );
    card = byItself ? (
      <Pressable
        testID="online-notice-cover"
        // A tap anywhere over the board closes it sooner.
        style={styles.tapArea}
        onPress={notice.onClose}
        accessible={false}>
        {noticeCard}
      </Pressable>
    ) : (
      noticeCard
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
    const vars = { name: nameOf(pass.player), dice: pass.dice.join('-') };
    // The player to move now comes from the engine (an extra roll keeps the same player).
    const next = game.state.toMove;
    const rolledText = isYou(pass.player)
      ? t(`game.pass.${chosen ? 'chose' : 'rolled'}_you`, vars)
      : t(`game.pass.${chosen ? 'chose' : 'rolled'}`, vars);
    const nextText = isYou(next)
      ? t('game.pass.next_you')
      : t('game.pass.next', { name: nameOf(next) });
    const reasonText =
      reason === 'body'
        ? undefined
        : reason === 'frozen'
          ? isYou(pass.player)
            ? t('game.pass.frozen_you')
            : t('game.pass.frozen')
          : t(`game.pass.${reason}`);
    const title = isYou(pass.player) ? t('game.pass.title_you') : t('game.pass.title');
    inlay = (
      <PassInlay
        // A new pass is a new inlay: its line starts again and it is read again.
        key={pass.key}
        title={title}
        line={t('game.pass.line', { rolled: rolledText, next: nextText })}
        reason={reasonText}
        spoken={[title, rolledText, reasonText, nextText].filter((x) => x !== undefined).join('. ')}
        closeLabel={t('game.pass.close')}
        announceKey={`${matchKey}:pass:${pass.key}`}
        durationMs={PASS_NOTICE_MS}
        running={passRuns}
        onClose={() => setPassDismissed(pass.key)}
      />
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
  } else if (!over && showRaceCard) {
    // Fast forward a race: the card the race opens with.
    const answer = (fastForward: boolean) => {
      answerRaceOffer(raceKey);
      if (fastForward) setFastForwardKey(raceKey);
    };
    card = (
      <GameCard
        testID="race-card"
        announceKey={`${raceKey}:raceOffer`}
        title={t('game.fastForward.offer.title')}
        lines={[t('game.fastForward.offer.body')]}>
        {/* A yes or no question (#615): each button reads what it shows. */}
        <ActionButton
          testID="race-fast-forward-button"
          label={t('game.fastForward.offer.yes')}
          onPress={() => answer(true)}
        />
        <ActionButton
          testID="race-play-on-button"
          label={t('game.fastForward.offer.no')}
          kind="secondary"
          onPress={() => answer(false)}
        />
        <ActionButton
          testID="race-never-button"
          label={t('game.fastForward.offer.never')}
          kind="text"
          onPress={() => {
            setSetting('offerFastForward', false);
            answer(false);
          }}
        />
      </GameCard>
    );
  } else if (!over && showIntro) {
    card = (
      <Pressable
        testID="table-intro"
        style={styles.tapArea}
        onPress={() => setIntroDone(true)}
        accessible={false}>
        {/* `collapsable={false}`: its opacity changes, and the canvas keeps its parent (#173). */}
        <Animated.View
          testID="table-intro-cover"
          style={[styles.introCover, introCoverStyle]}
          collapsable={false}>
          <TableScene
            width={Math.min(TABLE_INTRO_WIDTH, windowSize.width - 32)}
            play
            delayMs={TABLE_INTRO_LEAD_MS}
            testID="table-intro-scene"
          />
        </Animated.View>
      </Pressable>
    );
  } else if (!over && showOpening && opening) {
    card = (
      <GestureDetector gesture={openingSwipe}>
        <Pressable
          testID="opening-overlay"
          // The whole board area: a tap anywhere closes the result early;
          // while rolling, a tap rolls ("or swipe the board").
          style={styles.tapArea}
          onPress={decided ? () => setOpeningDismissed(gameKey) : () => roll()}
          accessible={false}>
          <OpeningCard
            theme={theme}
            status={opening}
            names={{ white: nameOf('white'), black: nameOf('black') }}
            checkers={{
              white: theme.checkers[toneOf('white')],
              black: theme.checkers[toneOf('black')],
            }}
            you={isYou('white') ? 'white' : isYou('black') ? 'black' : null}
            rollsAgain={rules.match.openingRoll === 'rerollBoth'}
            // The match too: each step is read once per app run (#216).
            gameKey={`${matchKey}:${gameKey}`}
            rollLabel={openingRollLabel}
            rollDisabled={tieWait || (online !== undefined && !onlineRoll)}
            {...(openingWait === null ? {} : { waiting: openingWait })}
            onRoll={roll}
            onClose={() => setOpeningDismissed(gameKey)}
            closeAfterMs={OPENING_RESULT_MS}
            closeRuns={!paused}
            onDieLanded={onDiceLanded}
          />
        </Pressable>
      </GestureDetector>
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
  // Online: the time left sits on the seat of the player the server waits for.
  const seatClock = (player: PlayerId): SeatClock | null => {
    const clock = online?.clock ?? null;
    return clock !== null && clock.player === player ? clock : null;
  };
  // The quiet status line of a bot or an online opponent: "Easy", "Online"
  // (#499). The game name sits under the score, in every layout.
  const variant = game.state.variant;
  const gameName = (STANDARD_VARIANT_IDS as readonly string[]).includes(variant)
    ? t(`games.${variant as StandardVariantId}`)
    : null;
  const seatStatus = (player: PlayerId): string | null => seats[player].detail ?? null;
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
  // Your seat is `strip-bottom` and the other one `strip-top` in every
  // layout: in portrait they sit side by side (yours on the left), in
  // landscape at the top and the bottom of the left rail.
  const strip = (player: PlayerId, testID: string) => (
    <PlayerStrip
      testID={testID}
      stacked={landscape}
      mirrored={!landscape && player === top}
      name={seats[player].label}
      turnLabel={seats[player].turnLabel}
      checker={theme.checkers[toneOf(player)]}
      avatar={seats[player].avatar ?? null}
      {...(seats[player].press
        ? { onPress: seats[player].press.onPress, pressHint: seats[player].press.hint }
        : {})}
      status={seatStatus(player)}
      note={asodioNote(player)}
      clock={seatClock(player)}
      timed={online?.timed ?? false}
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
  // "All dice used" shows only on the first few turns (#575). A turn under
  // the menu or the game-end sheet does not count.
  // A die lost to the higher die rule (#579) gets its own note in place of
  // "All dice used", with the reason, on the first few turns. A blocked die
  // or the rest of a double gets no note (#596): the slashed die says it,
  // and "All dice used" shows as on any other turn that can be confirmed.
  const lost = view.lost;
  const lostRoll = view.game.state.dice;
  const noteFree = !blocked && !othersTurn && !hideScreen;
  const noted = lost !== null && lost.reason === 'higherDie' ? lost : null;
  const confirmHint = useConfirmHint(
    view.canConfirm && noted === null && noteFree,
    `${matchKey}:${turnKey}`,
  );
  const lostHint = useTurnNote(
    noted === null ? null : 'lost.higherDie',
    noted !== null && noteFree,
    `${matchKey}:${turnKey}`,
  );
  const lostNote =
    lostHint && noted !== null && lostRoll !== null
      ? {
          line: view.canConfirm
            ? t('game.lostNote.confirm', { lost: lostLine(t, noted) })
            : lostLine(t, noted),
          reason: lostReason(t, noted, lostRoll),
        }
      : null;
  // "Doubles!" for a moment after the split. Another note over the board wins.
  // The value of the double names it: Greek says «Εξάρες!» for 6-6.
  const doubleValue = dice.length === 4 ? dice[0]?.value : undefined;
  const showDoublesHint =
    reveal.label &&
    doubleValue !== undefined &&
    !blocked &&
    !confirmHint &&
    lostNote === null &&
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

  const chatButton = chat ? (
    <Pressable
      testID="chat-button"
      accessibilityRole="button"
      accessibilityLabel={chat.label}
      accessibilityHint={chat.hint}
      hitSlop={MENU_SLOP}
      onPress={chat.onOpen}
      style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}>
      <Icon name="messageCircle" size={20} color={ui.colors.text} />
      {chat.unread > 0 ? (
        <View testID="chat-unread" style={styles.chatBadge} importantForAccessibility="no">
          <Text style={styles.chatBadgeText} allowFontScaling={false}>
            {chat.unread > 9 ? '9+' : chat.unread}
          </Text>
        </View>
      ) : null}
    </Pressable>
  ) : null;

  const boardLayer = (
    <View
      testID="game-board-layer"
      style={styles.boardLayer}
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
        {...(takeBackNow.length > 0 ? { takeBack: { moves: takeBackNow, onTakeBack } } : {})}
        onGeometry={onGeometry}
        onBoardTap={(at) => roll({ x: at.x, y: at.y })}
        onBoardSwipe={roll}
        onPickUp={() => feedback.event('checkerPickUp')}
        onIllegalDrop={() => feedback.event('invalidMove')}
        marks={marks}
        hint={blocked || othersTurn ? null : shownHint}
        overlay={
          throwReq !== null && placeGeo !== null ? (
            <BoardThrow
              key={throwReq.key}
              theme={theme}
              values={throwReq.values}
              swipe={throwReq.swipe}
              nearEnd={nearEnd}
              wall={throwReq.wall}
              settle={settle}
              geo={placeGeo}
              feedback={feedback}
              onDone={endThrow}
            />
          ) : null
        }
      />
      {diceMountBox ? (
        // The dice lie on the board, in the theme's dice area (#184), in
        // every layout. Touches go through. The dice canvas keeps its
        // own native view (`DiceRow`, #173), and this box is a native view
        // too (`pointerEvents`), always in the board layer, so turning the
        // phone does not move it.
        <View
          testID="board-dice"
          pointerEvents="none"
          collapsable={false}
          style={[
            styles.boardDice,
            { left: diceMountBox.left, top: diceMountBox.top },
            diceHidden && styles.diceHidden,
          ]}>
          <DiceRow
            testID="dice-row"
            theme={theme}
            dice={dice}
            rollKey={rollKey}
            rest={thrownRest}
            split={reveal.split}
            onLanded={onDiceLanded}
            size={diceMountBox.size}
            pairSize={diceMountBox.pairSize}
            lostReason={
              dice === view.dice && lost !== null && lostRoll !== null
                ? lostReason(t, lost, lostRoll)
                : undefined
            }
          />
        </View>
      ) : null}
    </View>
  );

  // Status notes stay outside the hidden layer: screen readers still hear them.
  const hints = (
    <>
      {gateToMove !== null ? (
        <View style={styles.hintRow} pointerEvents="none">
          <Text testID="loading-lock-hint" style={styles.hint} accessibilityLiveRegion="polite">
            {gateToMove === 'doubleOnly' ? t('game.asodio.lockedDouble') : t('game.asodio.locked')}
          </Text>
        </View>
      ) : null}
      {confirmHint ? (
        <View style={styles.hintRow} pointerEvents="none">
          <Text testID="confirm-hint" style={styles.hint}>
            {t('game.controls.allUsed')}
          </Text>
        </View>
      ) : null}
      {lostNote !== null ? (
        // The dice label already reads both lines, so screen readers skip this.
        <View style={styles.hintRow} pointerEvents="none">
          <Text
            testID="lost-dice-hint"
            style={[styles.hint, styles.hintTwoLines]}
            accessible={false}
            importantForAccessibility="no">
            {lostNote.line}
            {'\n'}
            <Text style={styles.hintReason}>{lostNote.reason}</Text>
          </Text>
        </View>
      ) : null}
      {showDoublesHint ? (
        // The roll announcement already says it is a double, so screen readers skip this.
        <View style={styles.hintRow} pointerEvents="none">
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
        <View style={styles.hintRow} pointerEvents="none">
          <Text testID="hint-text" style={styles.hint}>
            {hintShortText(t, shownHint)}
          </Text>
        </View>
      ) : null}
      {onlineLine !== null && !confirmHint && lostNote === null ? (
        // Online: who starts, or why nothing moved. The turn announcement reads it.
        <View style={styles.hintRow} pointerEvents="none">
          <Text testID="online-line" style={styles.hint}>
            {onlineLine}
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
    </>
  );

  const cardOverlay = card ? (
    // Scrolls when a small phone or a large font makes the card taller than its space.
    <ScrollView
      testID="game-card-overlay"
      style={styles.overlay}
      contentContainerStyle={styles.overlayContent}>
      {card}
    </ScrollView>
  ) : null;

  const gameLabelText = gameLabel ? (
    <Text testID="game-label" style={styles.gameLabel}>
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

  // The score once, between the seats: "0 – 0", "first to 3", the game.
  // Screen readers hear the score on each seat.
  const seatsScore = scoreText(match.score, viewer, landscape);
  const scoreBlock = (
    <View
      testID="game-score"
      style={styles.score}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Text style={styles.scoreText}>{seatsScore}</Text>
      <Text style={styles.scoreTarget}>
        {t('game.strip.firstTo', { target: match.targetPoints })}
      </Text>
      {/* Classic shows the game label under the seats row already. */}
      {gameName !== null && !classic ? (
        <Text testID="game-score-name" style={styles.scoreTarget}>
          {gameName}
        </Text>
      ) : null}
    </View>
  );

  // Before the board: the seats row in portrait, the left rail in landscape.
  // Both hold the same parts: the menu, the seats and the score between them.
  let lead = null;
  if (landscape) {
    // The left rail (Figma "18"): the menu at the top, then the other seat,
    // the score and your seat, as the portrait row stood on its end.
    lead = (
      <ScrollView
        testID="game-left"
        style={styles.rail(rails.left)}
        contentContainerStyle={styles.railContent}
        alwaysBounceVertical={false}>
        {menuButton}
        {chatButton}
        <View style={styles.railSeats}>
          {strip(top, 'strip-top')}
          {scoreBlock}
          {strip(viewer, 'strip-bottom')}
        </View>
      </ScrollView>
    );
  } else {
    // Portrait: the menu, then both seats side by side with the score once
    // between them.
    lead = (
      <View
        style={styles.lead(rows, cameraColumn)}
        onLayout={sideRail ? (e) => setLeadHeight(e.nativeEvent.layout.height) : undefined}>
        <View style={styles.topRow(rows)}>
          {menuButton}
          {strip(viewer, 'strip-bottom')}
          {scoreBlock}
          {strip(top, 'strip-top')}
          {chatButton}
        </View>
        {/* Classic (#184) has room for the game label; tall leaves it to the menu. */}
        {classic ? gameLabelText : null}
      </View>
    );
  }

  // After the board: the round buttons, under it in portrait, on the right
  // rail in landscape, in the same order: Undo (or Fast forward), the main
  // circle, the hint. Both keep their size in every state, so the board
  // never moves. In portrait the main circle sits in the middle of the screen.
  const trail =
    landscape || sideRail ? (
      // Scrolls when a large font makes the rail taller than the screen. The
      // side rail sits on the right, under the top row (#659).
      <ScrollView
        testID="game-right"
        style={
          sideRail
            ? styles.rowsRail(rails.right, leadHeight, cameraColumn)
            : styles.rail(rails.right)
        }
        contentContainerStyle={styles.railButtons(sideRail)}
        alwaysBounceVertical={false}>
        {undoButton ?? <View style={styles.railSlot(true)} />}
        {/* The main place is as tall as Roll with its subtitle in every state,
          and the status text sits in it, so Undo and the hint never move. */}
        <View testID="rail-main" style={styles.railMain}>
          {statusText}
          {mainButton}
        </View>
        {hintSlot ?? <View style={styles.railSlot(false)} />}
      </ScrollView>
    ) : (
      <View
        testID="game-controls"
        style={[
          styles.controls,
          (status === null || mainButton !== null) && styles.controlsTop,
          raceRoom && styles.controlsRaceRoom,
        ]}>
        {status !== null && mainButton === null ? (
          statusText
        ) : (
          <>
            <View style={styles.controlSide('end')}>
              {undoButton !== null ? (
                <View style={styles.sideSlot}>{undoButton}</View>
              ) : (
                (statusText ??
                (rollAside !== null ? (
                  <Text
                    style={styles.rollAside}
                    accessibilityElementsHidden
                    importantForAccessibility="no">
                    {rollAside}
                  </Text>
                ) : null))
              )}
            </View>
            {mainButton ?? <View style={styles.mainSpacer} />}
            <View style={styles.controlSide('start')}>
              {hintSlot !== null ? <View style={styles.sideSlot}>{hintSlot}</View> : null}
            </View>
          </>
        )}
      </View>
    );

  // Every layout keeps the board at the same place in the tree (the second
  // child, then the board frame), so turning the phone or changing the
  // setting never remounts the board, the dice or a card. The views around
  // the board never flatten (`collapsable={false}`), so the canvases keep
  // their native parent too (#173).
  return (
    <View style={styles.screen(landscape, island, cameraColumn)}>
      <GestureDetector gesture={swipeArea}>
        <View
          testID="game-content"
          style={styles.content(landscape)}
          collapsable={false}
          importantForAccessibility={hideScreen ? 'no-hide-descendants' : 'auto'}
          accessibilityElementsHidden={hideScreen}>
          {lead}
          {/* Classic: the board, centred in the space that is left; a card
            covers that whole space, so it has room. Tall: the board as
            large as it gets. Landscape: the board between the rails. The
            swipe area (#183, #625) covers the whole content around it. */}
          <View
            testID="game-middle"
            style={
              sideRail
                ? styles.middleBesideRail(Math.max(rails.right, cameraColumn))
                : tall
                  ? styles.boardArea
                  : styles.middle
            }
            collapsable={false}
            onLayout={(e) => {
              middleX.set(e.nativeEvent.layout.x);
              middleY.set(e.nativeEvent.layout.y);
            }}>
            <View
              testID="game-board-frame"
              style={
                classic
                  ? styles.classicBoard(
                      boxRatioWithShadow(theme.layouts[rows ? 'landscape-deep' : 'landscape']),
                    )
                  : styles.boardArea
              }
              collapsable={false}
              onLayout={(e) => {
                boardFrameX.set(e.nativeEvent.layout.x);
                boardFrameY.set(e.nativeEvent.layout.y);
              }}>
              {boardLayer}
            </View>
            {landscape || sideRail ? moveList : null}
            {hints}
            {cardOverlay ?? inlay}
          </View>
          {landscape || sideRail ? null : moveList}
          {trail}
        </View>
      </GestureDetector>
      {chat?.peek && !hideScreen ? (
        <View style={styles.chatPeek(landscape, rails.left)} pointerEvents="box-none">
          <ChatPeek name={chat.peek.name} text={chat.peek.text} onPress={chat.onOpen} />
        </View>
      ) : null}
      {endSheet !== null ? (
        <SupportAskCover covered={ask.open} fill="absolute">
          {endSheet}
        </SupportAskCover>
      ) : null}
      {endSheet !== null && ask.open ? (
        <SupportAskCard
          onAnswer={(answer) => {
            ask.answer(answer);
            if (answer === 'support') supportAsk?.onSupport();
          }}
        />
      ) : null}
    </View>
  );
}

/**
 * The width of the place for Undo (or Fast forward) and the hint in the
 * portrait row: each circle's center sits 74 pt from the main circle's.
 */
const SIDE_SLOT = 76;

/** The menu circle beside the top seat; this slop makes its target 44 pt. */
const MENU_SIZE = 40;
const MENU_SLOP = (44 - MENU_SIZE) / 2;

/**
 * The score between the seats, each number on the side of its seat: yours
 * first in portrait (your seat is on the left), the other seat's first on
 * the landscape rail (it sits above the score).
 */
export function scoreText(
  score: Readonly<Record<PlayerId, number>>,
  viewer: PlayerId,
  landscape: boolean,
): string {
  const mine = score[viewer];
  const theirs = score[other(viewer)];
  return landscape ? `${theirs} – ${mine}` : `${mine} – ${theirs}`;
}

const styles = StyleSheet.create((theme, rt) => ({
  // Landscape keeps the island, the round corners and the home bar free.
  // iOS gives the same inset on both sides; the side away from the island
  // needs less (`sideMargins`), and the wide board gets the rest (#611).
  // Upright keeps a side inset too: the iPhone Duo's camera column.
  screen: (landscape: boolean, island: IslandSide | null, column: number) => ({
    flex: 1,
    paddingTop: theme.space.xs,
    backgroundColor: theme.colors.background,
    paddingBottom: Math.max(rt.insets.bottom, landscape ? theme.space.xs : theme.space.sm),
    paddingLeft: landscape ? sideMargins(rt.insets, island, theme.space.xs).left : rt.insets.left,
    paddingRight: landscape
      ? sideMargins(rt.insets, island, theme.space.xs).right
      : rt.insets.right - column,
  }),
  content: (landscape: boolean) => ({
    flex: 1,
    flexDirection: landscape ? 'row' : 'column',
    gap: landscape ? theme.space.xxs : theme.space.xs,
  }),
  // A rail in landscape (Figma "18"): as wide as `rails` says.
  rail: (width: number) => ({
    width,
    flexGrow: 0,
  }),
  // The rail in rows (#659): on the right, from under the top row down,
  // in the iPhone Duo's camera column (`column`) when there is one. The
  // screen does not pad that column, so the rail stays inside its parent.
  // Until the top row is measured it hides, so it never shows over the seats.
  rowsRail: (width: number, top: number, column: number) => ({
    position: 'absolute',
    right: 0,
    top: top + theme.space.xs,
    bottom: 0,
    width: Math.max(width, column),
    opacity: top > 0 ? 1 : 0,
  }),
  // The left rail: the menu at the top, then the other seat, the score and
  // your seat, spread over the height.
  railContent: {
    flexGrow: 1,
    alignItems: 'center',
    gap: theme.space.sm,
    paddingVertical: theme.space.xs,
  },
  railSeats: {
    flexGrow: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.sm,
  },
  // The right rail: Undo, the main circle, the hint, spread over the height.
  // Rows (#659): the buttons sit together around the main circle, in the
  // middle of the tall column, not spread over it.
  railButtons: (rows: boolean) => ({
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: rows ? 'center' : 'space-around',
    gap: rows ? theme.space.lg : theme.space.sm,
    paddingVertical: theme.space.xs,
  }),
  // An empty place for Undo (circle and label) or the hint (circle only),
  // so the other buttons stay put.
  railSlot: (label: boolean) => ({
    height: RAIL_LANDSCAPE_SECONDARY + (label ? theme.space.xs + RAIL_LABEL_LINE : 0),
  }),
  // The main circle's place on the rail, also when it is empty (the bot's
  // turn): as tall as Roll (circle, label, subtitle), so nothing jumps.
  railMain: {
    minWidth: RAIL_PRIMARY,
    minHeight: RAIL_PRIMARY + 2 * theme.space.xs + RAIL_LABEL_LINE + RAIL_SUBTITLE_LINE,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.sm,
  },
  // Rows (#659): a little room above the menu, away from the round corner.
  // `column`: the camera column the screen no longer pads; the top row keeps
  // clear of the clock in it.
  lead: (rows: boolean, column: number) => ({
    gap: theme.space.xxs,
    paddingTop: rows ? theme.space.sm : 0,
    paddingRight: column,
  }),
  // The menu, your seat, the score, the other seat. The seats stretch to
  // the same height.
  // Rows: the open iPhone Duo has no left inset, so the menu keeps clear
  // of the screen's round top-left corner (#659).
  topRow: (rows: boolean) => ({
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: theme.space.xs,
    paddingLeft: rows && rt.insets.left === 0 ? theme.space.xl : theme.space.sm,
    paddingRight: theme.space.sm,
  }),
  score: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 40,
  },
  scoreText: {
    ...theme.type.numeral,
    fontSize: 17,
    lineHeight: 21,
    color: theme.colors.text,
    fontVariant: ['tabular-nums'],
  },
  scoreTarget: {
    ...theme.type.footnote,
    fontSize: 11,
    lineHeight: 14,
    color: theme.colors.textDim,
  },
  gameLabel: {
    ...theme.type.caption,
    flex: 1,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
  menuButton: {
    alignSelf: 'center',
    width: MENU_SIZE,
    height: MENU_SIZE,
    borderRadius: MENU_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  // The count of new chat messages (#692, #709), on the button's top right.
  chatBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accent,
    borderWidth: 1,
    borderColor: theme.colors.background,
  },
  chatBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    color: theme.colors.onAccent,
  },
  // A new chat message (#709): under the top row at the right in portrait,
  // at the top beside the left rail on the side. Inside the screen, so
  // Android does not clip it.
  chatPeek: (landscape: boolean, rail: number) => ({
    position: 'absolute',
    top: landscape ? theme.space.sm : rt.insets.top + MENU_SIZE + theme.space.md,
    ...(landscape
      ? { left: rt.insets.left + rail + theme.space.sm }
      : { right: rt.insets.right + theme.space.sm }),
  }),
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
  // Rows (#659): the board's space keeps clear of the rail on the right.
  // Rows: the board ends where the rail starts.
  middleBesideRail: (rail: number) => ({
    flex: 1,
    justifyContent: 'center',
    gap: theme.space.xs,
    marginRight: rail + theme.space.xxs,
  }),
  // As wide as the screen, as tall as the board needs. A large font may
  // squeeze it; the board then fits the space it has.
  classicBoard: (ratio: number) => ({
    width: '100%',
    aspectRatio: ratio,
    flexShrink: 1,
  }),
  boardLayer: {
    flex: 1,
  },
  diceHidden: {
    opacity: 0,
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
  introCover: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
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
  hintTwoLines: {
    borderRadius: theme.radii.lg,
    textAlign: 'center',
  },
  hintReason: {
    ...theme.type.body,
  },
  // The round buttons in thumb reach (Figma "18"): Undo, the main circle in
  // the middle of the screen, the hint. As tall in every state, so the
  // board above never moves.
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.xs,
    minHeight: RAIL_PRIMARY + 24,
    paddingHorizontal: theme.space.md,
  },
  // With buttons the row lines up their tops: each circle sits in a box as
  // tall as the main circle (`circleBox`), so the circles share a center line.
  controlsTop: {
    alignItems: 'flex-start',
  },
  // A text in a side (the bot's turn, "or swipe the board") is centered on
  // the circles' line.
  controlSide: (align: 'start' | 'end') => ({
    flex: 1,
    minHeight: RAIL_PRIMARY,
    justifyContent: 'center',
    alignItems: align === 'start' ? 'flex-start' : 'flex-end',
  }),
  mainSpacer: {
    width: RAIL_PRIMARY,
  },
  // Two label lines under the side circle (see `raceRoom`).
  controlsRaceRoom: {
    minHeight: RAIL_PRIMARY + theme.space.xs + 2 * RAIL_LABEL_LINE,
  },
  // Undo (or Fast forward) and the hint each get the same width, so a long
  // label (Greek «Γρήγορο τέλος») wraps under its circle and never pushes
  // the circle away from the main one.
  sideSlot: {
    width: SIDE_SLOT,
    alignItems: 'center',
  },
  rollAside: {
    ...theme.type.footnote,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'right',
    color: theme.colors.textDim,
  },
  // With a large font the hint shows its label, so its place keeps that line too.
  hintPlaceholder: (label: boolean) => ({
    paddingBottom: label ? theme.space.xs + RAIL_LABEL_LINE : 0,
  }),
  hintPlaceholderBox: (height: number) => ({
    height,
    justifyContent: 'center',
  }),
  hintPlaceholderCircle: (size: number) => ({
    width: size,
    height: size,
    borderRadius: size / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.surfaceRaised,
    backgroundColor: theme.colors.surfaceSunken,
  }),
  // What the bot, the other player or fast forward does, in the buttons' place.
  statusText: (landscape: boolean) => ({
    ...theme.type.footnote,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'center',
    color: theme.colors.turnText,
    paddingHorizontal: landscape ? 0 : theme.space.md,
  }),
}));
