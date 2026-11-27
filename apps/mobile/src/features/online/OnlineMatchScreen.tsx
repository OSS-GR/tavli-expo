/**
 * An online game on the board screen (#255): `GameScreen` over an online
 * store (`onlineStore.ts`), with the menu and the Resign match dialog.
 *
 * - The server passes and starts the next game (and its opening) by
 *   itself (see "Online" in `GameScreen.tsx`). Your roll waits for you:
 *   Roll, a tap or a swipe asks the server to roll (#355), and the line
 *   says so until the dice come. In the first game each player rolls their
 *   own opening die on the opening card (#379), in any order.
 * - While the server waits for the other player, the board is locked. Your
 *   opening die is the exception: you may roll it while it is not in,
 *   whatever `waitingFor` says.
 * - The time left shows on the strip of the player the server waits for
 *   (live: seconds; async: hours). In the opening it shows on yours while
 *   your die is not in: at the deadline the side that did not roll loses
 *   the game, when the other side rolled.
 * - A game with a turn time (#530) draws it as a ring around that
 *   player's avatar, with the time left as a numeral. Your last 10 seconds
 *   are red, tick once a second (sound and haptic) and are read once to
 *   screen readers. A game with no turn time (24 h) keeps the clock line.
 * - Your time ran out in a game that ended while the screen was open: the
 *   "Time ran out" card shows in place of its game-end sheet, with "I am
 *   here" (#530). In a ranked game it warns that the next time out in a
 *   row loses the match.
 * - A game that ends while the screen is open shows its game-end sheet
 *   over the end of that game (the board store holds it, #286); its
 *   button closes it, and then the next game shows.
 * - There is no game resign online: Resign match goes to the server.
 * - Report or block (#435): the menu opens the dialog for the other
 *   player (`features/safety`), in the same sheet.
 * - Chat (ADR-0011, #692): a game with a chat for this player shows the
 *   chat button beside the other seat, with a dot for new messages. It
 *   opens the chat in the same sheet (`features/chat`); the text field is
 *   the sheet's footer. A report from the chat names the game.
 * - The game-end sheet has Review (#604): the review screen asks the
 *   server for the record of that game (`GameTransport.gameRecord`). There
 *   is no Hint online, and nothing goes to the save slot or History: the
 *   server keeps the game.
 *
 * Navigation stays in the route (`app/game/[id]/index.tsx`).
 */
import {
  turnDeadlineMs,
  type Chat,
  type Friends,
  type GameTransport,
  type PlayerCard,
  type Safety,
  type Usernames,
} from '@tavli/contracts';
import { opponent, type PlayerId, type PresetId } from '@tavli/engine';
import { mayRollOpening } from '@tavli/online';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View, useWindowDimensions } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { nextPeek, peekMs } from '@/features/chat/ChatPeek';
import {
  ChatComposer,
  ChatHead,
  ChatRules,
  ChatSheet,
  type ChatFix,
} from '@/features/chat/ChatSheet';
import { shownText } from '@/features/chat/chatLayout';
import { chatSeen, newestSentAt, unreadCount } from '@/features/chat/chatSeen';
import { chatOffered, useChat, useChatPanel } from '@/features/chat/useChat';
import { SIDE_PANEL_WIDTH, Sheet } from '@/components/Sheet';
import { useGameStore } from '@/features/game/gameStore';
import { useAnnouncement } from '@/features/game/useAnnouncement';
import {
  GameScreen,
  type OnlineEndedGame,
  type OnlineNoticeCard,
  type OnlineSide,
  type OnlineTimedOutCard,
} from '@/features/game/GameScreen';
import type { Seat } from '@/features/game/seats';
import { GameMenu } from '@/features/match/GameMenu';
import { MissingGame } from '@/features/match/MissingGame';
import { resignMatchText } from '@/features/match/resign';
import { currentGameLabel, currentGameLine, variantName } from '@/features/match/summary';
import { ReportOrBlock, safetyName, type SafetyPlayer } from '@/features/safety/ReportOrBlock';

import { onlineBoardStore, type OnlineBoardStore } from './boardStore';
import {
  clockText,
  clockTickMs,
  clockUrgent,
  inLastSeconds,
  lastSeconds,
  turnShareLeft,
} from './clock';
import { useOnlineStore, type OnlineNotice, type OnlineStore } from './onlineStore';
import { playerNameText } from './playerName';
import { OpponentCard } from './OpponentCard';
import { usePlayerCard } from './playerCard';
import { onlineSeats } from './seats';
import { timeLeft } from './timeLeft';
import { useOnlineGame } from './useOnlineGame';

export interface OnlineMatchScreenProps {
  gameId: string;
  transport: GameTransport;
  /** Block and report (#435). Without it the menu has no Report or block row. */
  safety?: Safety;
  /** The other player's card (#651). Without it their name is not a button. */
  friends?: Friends;
  /** The chat of the game (#692). Without it there is no chat button. */
  chat?: Chat;
  /** Accepts new terms from the chat (#692). Without it the chat sends the player to the username screen. */
  usernames?: Usernames;
  /** Opens the screen that lets this player chat (save the account, pick a username, accept the terms). */
  onChatFix?: (status: ChatFix) => void;
  /** The player id of this phone. */
  me: string;
  /** Another screen is on top (Settings). */
  paused?: boolean;
  /**
   * A sheet of the root layout covers the board (the turn notifications
   * offer, #285): the screen is hidden from screen readers and paused.
   */
  covered?: boolean;
  onExit: () => void;
  onSettings: () => void;
  /** The rules of the game on the board, in its preset. */
  onRules: (variant: string, preset: PresetId) => void;
  /** The match is over: open the match-end screen. */
  onMatchOver: () => void;
  /** Review of a game that ended (#604), by its number in the match (from 1). */
  onReview?: (gameNumber: number) => void;
  /** The phone clock. Default: `Date.now`. */
  now?: () => number;
}

/** The most of the window's height the chat sheet takes (#719). */
export const CHAT_SHEET_HEIGHT = 0.55;

export function OnlineMatchScreen(props: OnlineMatchScreenProps) {
  // A new game id is a new screen, with its own store.
  return <OnlineGame key={props.gameId} {...props} />;
}

function OnlineGame(props: OnlineMatchScreenProps) {
  const { gameId, transport, me, now } = props;
  const store = useOnlineGame({ transport, gameId, me, ...(now ? { now } : {}) });
  if (store === null) return <Loading />;
  return <OnlineLoader store={store} {...props} />;
}

function Loading() {
  const { t } = useTranslation();
  return (
    <View testID="online-loading" style={styles.loading}>
      <ActivityIndicator />
      <Text style={styles.loadingText}>{t('online.loading')}</Text>
    </View>
  );
}

function OnlineLoader({ store, ...props }: OnlineMatchScreenProps & { store: OnlineStore }) {
  const loaded = useOnlineStore(store, (s) => s.flow !== null);
  const loadError = useOnlineStore(store, (s) => s.loadError);
  const side = useOnlineStore(store, (s) => s.side);
  const board = useMemo(
    () => (loaded ? onlineBoardStore(store, props.gameId) : null),
    [loaded, store, props.gameId],
  );
  // An unknown game, or a game this phone does not play in.
  if ((loadError !== null && !loaded) || (loaded && side === null)) {
    return <MissingGame onHome={props.onExit} />;
  }
  if (board === null || side === null) return <Loading />;
  return <OnlineBoard {...props} store={store} board={board} side={side} />;
}

type Overlay =
  | { readonly kind: 'none' }
  | { readonly kind: 'menu' }
  | { readonly kind: 'resignMatch' }
  /** The other player's card (#651). */
  | { readonly kind: 'card' }
  /** Report or block (#435), with the player as the menu named them. `fromChat`: opened from the chat. */
  | {
      readonly kind: 'safety';
      readonly player: SafetyPlayer;
      readonly fromChat?: boolean;
      /** From a long press on a chat message: the dialog starts at this step (#722). */
      readonly start?: 'report' | 'block';
    }
  /** The chat of the game (#692). */
  | { readonly kind: 'chat' };

const NO_OVERLAY: Overlay = { kind: 'none' };

/**
 * The other player's seat as a button to their card (#651): the rating in
 * place of "Online" once the card loaded, and only the "›" for a guest.
 */
function cardSeat(seat: Seat, card: PlayerCard | null, onPress: () => void, t: TFunction): Seat {
  const { detail, ...rest } = seat;
  const shown = card === null ? detail : card.rating === null ? undefined : String(card.rating);
  return {
    ...rest,
    ...(shown === undefined ? {} : { detail: shown }),
    press: { onPress, hint: t('online.card.openHint') },
  };
}

/**
 * The notices' texts. `news` (#615): the notice only gives news ("The game
 * changed", "Not accepted"), so it closes by itself; the others ask you to
 * do something (Confirm or roll again) and keep OK.
 */
const NOTICE_KEYS = {
  timedOut: {
    title: 'online.notice.timedOutTitle',
    text: 'online.notice.timedOut',
    news: false,
  },
  stale: { title: 'online.notice.staleTitle', text: 'online.notice.stale', news: true },
  sendFailed: {
    title: 'online.notice.sendFailedTitle',
    text: 'online.notice.sendFailed',
    news: false,
  },
  rollFailed: {
    title: 'online.notice.sendFailedTitle',
    text: 'online.notice.rollFailed',
    news: false,
  },
  refused: { title: 'online.notice.refusedTitle', text: 'online.notice.refused', news: true },
} as const satisfies Record<OnlineNotice, { title: string; text: string; news: boolean }>;

function OnlineBoard({
  store,
  board,
  side,
  gameId,
  safety,
  friends,
  chat,
  usernames,
  onChatFix,
  paused = false,
  covered = false,
  onExit,
  onSettings,
  onRules,
  onMatchOver,
  onReview,
  now = Date.now,
}: OnlineMatchScreenProps & {
  store: OnlineStore;
  board: OnlineBoardStore;
  side: PlayerId;
}) {
  const { t } = useTranslation();
  const flow = useGameStore(board, (s) => s.flow);
  const matchKey = useGameStore(board, (s) => s.matchKey);
  const view = useOnlineStore(store, (s) => s.view);
  const sending = useOnlineStore(store, (s) => s.sending);
  const rolling = useOnlineStore(store, (s) => s.rolling);
  const notice = useOnlineStore(store, (s) => s.notice);
  const noticeCount = useOnlineStore(store, (s) => s.noticeCount);
  const clockOffset = useOnlineStore(store, (s) => s.clockOffset);
  const [overlay, setOverlay] = useState<Overlay>(NO_OVERLAY);
  // A report or block on its way keeps its dialog open (`onHold`).
  const [held, setHeld] = useState(false);
  const close = () => setOverlay(NO_OVERLAY);

  // The chat (#692): live while the screen is open. What this phone has
  // read is kept on the phone (`chatSeen`); the dot counts what is newer.
  const chatView = useChat(chat, gameId);
  const [seenAt, setSeenAt] = useState(() => chatSeen.seenAt(gameId));
  const [rulesSeen, setRulesSeen] = useState(() => chatSeen.rulesSeen());
  // What the player typed and did not send yet. It lives here, so it stays
  // when the text field goes away for a moment (Report or block, a close).
  const [draft, setDraft] = useState('');
  const chatOpen = overlay.kind === 'chat';
  // On its side the chat is a panel at the right (`Sheet` `side`): the
  // game screen leaves that room free, so the board stays whole (#716).
  const window = useWindowDimensions();
  const chatBeside = chatOpen && window.width > window.height;
  const chatPanel = useChatPanel(chatOpen, chatView?.status);
  const newest = chatView === null ? 0 : newestSentAt(chatView);
  // An open chat is a read chat. The phone keeps what was read.
  if (chatOpen && newest > seenAt) setSeenAt(newest);
  useEffect(() => {
    chatSeen.markSeen(gameId, seenAt);
  }, [gameId, seenAt]);

  // Resign match while your turn is on its way: the store takes no action
  // then, so the resign waits and goes as soon as the call is done.
  const resignWaits = useRef(false);
  useEffect(() => {
    if (sending || !resignWaits.current) return;
    resignWaits.current = false;
    store.getState().dispatch({ type: 'resignMatch', player: side });
  }, [sending, store, side]);

  // The clock: a new time each second for a time limit, each half minute
  // otherwise. It ticks only while a clock shows: not after the match.
  const turnTimeMinutes = view?.turnTimeMinutes ?? null;
  const ticking = view !== null && view.status !== 'finished' && view.waitingFor !== null;
  // The clock reads the phone time again for each new view (and so when
  // it starts ticking), not only on the next tick: an async tick is 30 s.
  const version = view?.version ?? -1;
  const [clock, setClock] = useState(() => ({ version, at: now() }));
  if (clock.version !== version) setClock({ version, at: now() });
  const clockNow = clock.at;
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(
      () => setClock((c) => ({ version: c.version, at: now() })),
      clockTickMs(turnTimeMinutes),
    );
    return () => clearInterval(timer);
  }, [turnTimeMinutes, now, ticking]);

  // The newest flow: the next game, while the board still holds the last one.
  const latest = useOnlineStore(store, (s) => s.flow) ?? flow;

  const opponentSide = side === 'white' ? 'black' : 'white';
  const opponentName = view?.names[opponentSide] ?? null;
  const opponentId = view?.players[opponentSide];
  // Loaded once per game screen: the seat shows the rating from it.
  const card = usePlayerCard(friends ?? null, friends ? opponentId : undefined);
  const plainSeats = onlineSeats(side, t, opponentName, opponentId);
  const loaded = card.load.kind === 'ready' ? card.load.card : null;
  // Each opening asks again: a request may have come in since.
  const openCard = () => {
    card.reload();
    setOverlay({ kind: 'card' });
  };
  const seats =
    friends === undefined || opponentId === undefined
      ? plainSeats
      : { ...plainSeats, [opponentSide]: cardSeat(plainSeats[opponentSide], loaded, openCard, t) };
  const named = playerNameText(opponentName, t);
  const name = (player: PlayerId) => seats[player].name;
  // A new message from the other player is read to screen readers once
  // (#692), also while the chat is closed. Only messages that come while
  // the screen is open are read: what the first view held is old.
  const [loadedNewest, setLoadedNewest] = useState<number | null>(null);
  if (chatView !== null && loadedNewest === null) setLoadedNewest(newest);
  const heard =
    loadedNewest === null
      ? undefined
      : chatView?.messages.findLast(
          (message) => message.from !== side && message.sentAt > loadedNewest,
        );
  useAnnouncement(
    heard === undefined
      ? null
      : t('chat.newMessage', { name: name(opponentSide), text: shownText(heard, t) }),
    heard === undefined ? undefined : `chat:${gameId}:${heard.id}`,
  );
  // The same message shows over the screen for a moment while the chat is
  // closed (#709). A read message, or one whose time is over, does not.
  const [peekOver, setPeekOver] = useState<string | null>(null);
  const heardId = heard?.id;
  const heardMs = heard === undefined ? 0 : peekMs(shownText(heard, t));
  // Many messages in a row show only the count on the button (#722).
  const [peeks, setPeeks] = useState<{
    readonly last: string | null;
    readonly times: readonly number[];
    readonly quiet: string | null;
  }>({ last: null, times: [], quiet: null });
  if (heardId !== undefined && peeks.last !== heardId) {
    const next = nextPeek(peeks.times, now());
    setPeeks({ last: heardId, times: next.times, quiet: next.show ? null : heardId });
  }
  useEffect(() => {
    if (heardId === undefined) return;
    const timer = setTimeout(() => setPeekOver(heardId), heardMs);
    return () => clearTimeout(timer);
  }, [heardId, heardMs]);
  const peek =
    heard !== undefined &&
    !chatOpen &&
    heard.sentAt > seenAt &&
    peekOver !== heard.id &&
    peeks.quiet !== heard.id
      ? {
          name: name(opponentSide),
          text: shownText(heard, t),
          onDismiss: () => setPeekOver(heard.id),
        }
      : null;
  if (view === null) return null;

  const finished = view.status === 'finished';
  // A game that ended while the screen was open: the board holds its end
  // (`boardStore.ts`, #286) under its game-end sheet. Games that ended
  // before the screen opened are not held.
  const games = flow.match.games;
  const last = games.at(-1);
  // Your time ran out in that game (#530): a card says so, not the sheet.
  const timedOut: OnlineTimedOutCard | null =
    last !== undefined && last.reason === 'timeout' && last.winner === opponentSide
      ? {
          eyebrow: t('online.timeRanOut.eyebrow'),
          title: t('online.timeRanOut.title', { name: name(opponentSide) }),
          text: [
            t('online.timeRanOut.points', { count: last.points }),
            view.ranked ? t('online.timeRanOut.ranked') : null,
          ]
            .filter((part) => part !== null)
            .join(' '),
          button: t('online.timeRanOut.here'),
        }
      : null;
  const ended: OnlineEndedGame | null =
    !finished && flow.game.phase === 'game-over' && last !== undefined
      ? {
          record: last,
          key: `${matchKey}:end:${games.length}`,
          timedOut,
          onClose: () => {
            // The next game shows: its dice tumble, and its turn is read.
            board.release();
            // The sheet already says that your time ran out.
            if (last.reason === 'timeout' && store.getState().notice === 'timedOut') {
              store.getState().clearNotice();
            }
          },
        }
      : null;

  const noticeCard: OnlineNoticeCard | null =
    notice === null
      ? null
      : {
          // A new name for each notice: the same notice twice is read twice.
          key: `${matchKey}:n${noticeCount}:${notice}`,
          title: t(NOTICE_KEYS[notice].title),
          text: t(NOTICE_KEYS[notice].text),
          closesItself: NOTICE_KEYS[notice].news,
          onClose: () => store.getState().clearNotice(),
        };

  const waitingFor = view.waitingFor;
  // Your opening die (#379): either player may roll first.
  const myOpening = mayRollOpening(view, side);
  const clockSide = myOpening ? side : waitingFor;
  // The clock ticks once a second (or half minute): a view newer than the
  // last tick would show more than a whole turn.
  const left = timeLeft(view, clockNow, clockOffset);
  const shown = left === null ? null : Math.min(left, turnDeadlineMs(view.turnTimeMinutes));
  const minutes = view.turnTimeMinutes;
  const timed = minutes !== null;
  // The clock is on your seat, in your last 10 seconds (#530).
  const mine = clockSide === side && shown !== null && !finished;
  const final = mine ? lastSeconds(shown, minutes) : null;
  const online: OnlineSide = {
    me: side,
    version: view.version,
    locked: sending || (waitingFor !== side && !myOpening),
    status: rolling
      ? t('online.status.rolling')
      : sending
        ? t('online.status.sending')
        : named === null
          ? t('online.status.waiting')
          : t('online.status.waitingForName', { name: named }),
    clock:
      clockSide === null || shown === null || finished
        ? null
        : {
            player: clockSide,
            // "4:54 to roll", "0:28 to move" (#499).
            text: t(
              view.game.phase === 'awaiting-roll' || view.game.phase === 'opening-roll'
                ? 'online.clock.toRoll'
                : 'online.clock.toMove',
              { time: clockText(shown, minutes, t) },
            ),
            // A ring turns red in your own last 10 s (the other player's
            // stays gold), a clock line under 30 s.
            urgent: timed ? mine && inLastSeconds(shown, minutes) : clockUrgent(shown),
            ring: timed
              ? { left: turnShareLeft(shown, minutes), time: clockText(shown, minutes, t) }
              : null,
            warning: final === null ? null : t('online.clock.lastSeconds'),
            tick: final,
            alert:
              final === null
                ? null
                : {
                    // One line per turn: the deadline names it.
                    key: `${matchKey}:lastSeconds:${view.turnDeadline}`,
                    text: t('online.clock.lastSecondsAlert'),
                  },
          },
    timed,
    ended,
    notice: noticeCard,
  };

  const game = t(`games.${view.choice}`);
  const playing = variantName(flow.game.state.variant, t);
  const gameLabel = currentGameLabel(flow, t);
  const gameLine = currentGameLine(flow, t);
  // The server has started the next game already: the sheet names it.
  const nextLabel =
    ended !== null
      ? t('game.end.nextGame', {
          number: games.length + 1,
          game: variantName(latest.game.state.variant, t),
        })
      : undefined;

  let content = null;
  let header = null;
  if (overlay.kind === 'menu') {
    content = (
      <GameMenu
        gameLabel={gameLabel}
        {...(gameLine ? { gameLine } : {})}
        about={t('online.label', { game })}
        score={{
          names: { white: name('white'), black: name('black') },
          score: flow.match.score,
          target: flow.match.targetPoints,
        }}
        resignGameHint={null}
        resignMatchHint={
          finished ? null : t('game.menu.resignMatchHint', { name: name(opponent(side)) })
        }
        rulesLabel={t('game.menu.rules', { game: playing })}
        onResignMatch={() => setOverlay({ kind: 'resignMatch' })}
        onRules={() => {
          close();
          const { state } = flow.game;
          onRules(state.variant, state.rules.presetId);
        }}
        onSettings={() => {
          close();
          onSettings();
        }}
        {...(friends
          ? { opponentCardHint: t('online.card.menuHint'), onOpponentCard: openCard }
          : {})}
        {...(safety
          ? {
              reportOrBlockHint: t('safety.actionHint', { name: safetyName(opponentName, t) }),
              onReportOrBlock: () =>
                setOverlay({
                  kind: 'safety',
                  player: { id: view.players[opponent(side)], name: opponentName },
                }),
            }
          : {})}
        exitHint={t('online.exitHint')}
        onExit={() => {
          close();
          onExit();
        }}
        onResume={close}
      />
    );
  } else if (overlay.kind === 'resignMatch' && !finished) {
    // The game in play counts for the opponent, as in a local match.
    const { lines, note } = resignMatchText(flow, side, name, t);
    content = (
      <ConfirmDialog
        testID="resign-match-dialog"
        title={t('game.resign.matchTitle')}
        lines={lines}
        {...(note === undefined ? {} : { note })}
        confirmLabel={t('game.resign.confirm')}
        cancelLabel={t('game.resign.keep')}
        onConfirm={() => {
          // The server ends the match; its view opens match end.
          const sent = store.getState().dispatch({ type: 'resignMatch', player: side });
          if (!sent && store.getState().sending) resignWaits.current = true;
          close();
        }}
        onCancel={close}
      />
    );
  } else if (overlay.kind === 'card' && friends && opponentId !== undefined) {
    content = (
      <OpponentCard
        playerId={opponentId}
        name={name(opponentSide)}
        card={card}
        friends={friends}
        {...(safety
          ? {
              onReportOrBlock: () =>
                setOverlay({ kind: 'safety', player: { id: opponentId, name: opponentName } }),
            }
          : {})}
        onClose={close}
        onHold={setHeld}
      />
    );
  } else if (overlay.kind === 'safety' && safety) {
    content = (
      <ReportOrBlock
        player={overlay.player}
        safety={safety}
        onClose={close}
        onHold={setHeld}
        {...(overlay.fromChat ? { chatGameId: gameId } : {})}
        {...(overlay.start ? { start: overlay.start } : {})}
      />
    );
  } else if (overlay.kind === 'chat' && chat && chatOffered(chatView)) {
    // The header stays in place over the messages (#711).
    header = (
      <ChatHead
        chat={chat}
        view={chatView}
        me={side}
        opponentName={name(opponentSide)}
        rulesSeen={rulesSeen}
        panel={chatPanel}
        {...(online.clock === null
          ? {}
          : {
              turn: {
                mine: online.clock.player === side,
                urgent: online.clock.urgent,
                text:
                  online.clock.player === side
                    ? t('chat.turn.mine', { time: clockText(shown ?? 0, minutes, t) })
                    : t('chat.turn.theirs', {
                        name: name(opponentSide),
                        time: clockText(shown ?? 0, minutes, t),
                      }),
              },
            })}
        {...(safety && opponentId !== undefined
          ? {
              onReportOrBlock: () =>
                setOverlay({
                  kind: 'safety',
                  player: { id: opponentId, name: opponentName },
                  fromChat: true,
                }),
            }
          : {})}
        onClose={close}
      />
    );
    content = (
      <ChatSheet
        chat={chat}
        view={chatView}
        me={side}
        opponentName={name(opponentSide)}
        now={clockNow}
        rulesShown={!rulesSeen || chatPanel.rulesAsked}
        {...(safety && opponentId !== undefined
          ? {
              onReportOrBlock: (start: 'report' | 'block') =>
                setOverlay({
                  kind: 'safety',
                  player: { id: opponentId, name: opponentName },
                  fromChat: true,
                  start,
                }),
            }
          : {})}
        {...(usernames ? { usernames } : {})}
        onFix={(status) => {
          close();
          onChatFix?.(status);
        }}
        onSettings={() => {
          close();
          onSettings();
        }}
      />
    );
  }
  // Under the messages, in place: the text field, or the chat rules before
  // the first send and when the player asks for them (#719).
  const chatOpenNow =
    overlay.kind === 'chat' && chat && chatView?.status === 'open' && content !== null;
  const rulesShow = chatOpenNow && (!rulesSeen || chatPanel.rulesAsked);
  const composing = chatOpenNow && !rulesShow;
  const unread = unreadCount(chatView, side, seenAt);

  return (
    <>
      <GameScreen
        store={board}
        seats={seats}
        online={online}
        paused={paused || covered || overlay.kind !== 'none'}
        covered={covered || content !== null}
        onOpenMenu={() => setOverlay({ kind: 'menu' })}
        sideSpace={chatBeside ? Math.min(SIDE_PANEL_WIDTH, window.width * 0.6) : 0}
        {...(chat && chatOffered(chatView)
          ? {
              chat: {
                unread,
                peek,
                label:
                  unread > 0
                    ? t('chat.openUnread', { name: name(opponentSide), count: unread })
                    : t('chat.openLabel', { name: name(opponentSide) }),
                hint: t('chat.openHint'),
                onOpen: () => setOverlay({ kind: 'chat' }),
              },
            }
          : {})}
        onHome={onExit}
        onMatchOver={onMatchOver}
        // The game that ended is the last one in the match so far.
        {...(onReview && ended !== null ? { onReview: () => onReview(games.length) } : {})}
        gameLabel={gameLabel}
        {...(nextLabel ? { nextGameLabel: nextLabel } : {})}
      />
      <Sheet
        visible={content !== null}
        onClose={() => {
          if (!held) close();
        }}
        closeLabel={t('game.menu.resume')}
        look={
          overlay.kind === 'menu' || overlay.kind === 'card' || overlay.kind === 'chat'
            ? 'raised'
            : 'dialog'
        }
        {...(header !== null ? { header } : {})}
        {...(composing
          ? {
              footer: <ChatComposer chat={chat} gameId={gameId} text={draft} onText={setDraft} />,
              stickToEnd: true,
            }
          : rulesShow
            ? {
                footer: (
                  <ChatRules
                    onOk={() => {
                      chatPanel.rulesDone();
                      if (!rulesSeen) {
                        chatSeen.markRulesSeen();
                        setRulesSeen(true);
                      }
                    }}
                  />
                ),
                stickToEnd: true,
              }
            : {})}
        // The chat leaves the top row and part of the board in view (#719).
        {...(overlay.kind === 'chat'
          ? { maxHeight: CHAT_SHEET_HEIGHT, sideHint: t('chat.sideHint') }
          : {})}
        // The game screen turns with the phone (#185); its menu and dialog too.
        turns
        // On its side the chat is a panel at the right: the board stays whole (#716).
        side={overlay.kind === 'chat'}>
        {content}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.sm,
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    ...theme.type.body,
    color: theme.colors.textDim,
  },
}));
