/**
 * An online game on the board screen (#255): `GameScreen` over an online
 * store (`onlineStore.ts`), with the menu and the Resign match dialog.
 *
 * - The server rolls, passes and starts the next game, so there is no
 *   Roll button and no opening card (see "Online" in `GameScreen.tsx`).
 * - While the server waits for the other player, the board is locked.
 * - The time left shows on the strip of the player the server waits for
 *   (live: seconds; async: hours).
 * - A game that ends while the screen is open shows its game-end sheet
 *   over the next game; its button closes it.
 * - There is no game resign online: Resign match goes to the server.
 * - No Hint and no Review (there is no analyzer online), and nothing goes
 *   to the save slot or History: the server keeps the game.
 *
 * Navigation stays in the route (`app/game/[id]/index.tsx`).
 */
import { TURN_TIME_MS, type GameTransport } from '@tavli/contracts';
import { opponent, type PlayerId, type PresetId } from '@tavli/engine';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Sheet } from '@/components/Sheet';
import { useGameStore } from '@/features/game/gameStore';
import {
  GameScreen,
  type OnlineEndedGame,
  type OnlineNoticeCard,
  type OnlineSide,
} from '@/features/game/GameScreen';
import { GameMenu } from '@/features/match/GameMenu';
import { MissingGame } from '@/features/match/MissingGame';
import { currentGameLabel, variantName } from '@/features/match/summary';

import { onlineBoardStore } from './boardStore';
import { clockText, clockTickMs } from './clock';
import { useOnlineStore, type OnlineNotice, type OnlineStore } from './onlineStore';
import { onlineSeats } from './seats';
import { timeLeft } from './timeLeft';
import { useOnlineGame } from './useOnlineGame';

export interface OnlineMatchScreenProps {
  gameId: string;
  transport: GameTransport;
  /** The player id of this phone. */
  me: string;
  /** Another screen is on top (Settings). */
  paused?: boolean;
  onExit: () => void;
  onSettings: () => void;
  /** The rules of the game on the board, in its preset. */
  onRules: (variant: string, preset: PresetId) => void;
  /** The match is over: open the match-end screen. */
  onMatchOver: () => void;
  /** The phone clock. Default: `Date.now`. */
  now?: () => number;
}

export function OnlineMatchScreen(props: OnlineMatchScreenProps) {
  // A new game id is a new screen, with its own store.
  return <OnlineGame key={props.gameId} {...props} />;
}

function OnlineGame(props: OnlineMatchScreenProps) {
  const { gameId, transport, me, now } = props;
  const store = useOnlineGame({ transport, gameId, me, ...(now ? { now } : {}) });
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

type Overlay = 'none' | 'menu' | 'resignMatch';

const NOTICE_KEYS = {
  timedOut: { title: 'online.notice.timedOutTitle', text: 'online.notice.timedOut' },
  stale: { title: 'online.notice.staleTitle', text: 'online.notice.stale' },
  sendFailed: { title: 'online.notice.sendFailedTitle', text: 'online.notice.sendFailed' },
  refused: { title: 'online.notice.refusedTitle', text: 'online.notice.refused' },
} as const satisfies Record<OnlineNotice, { title: string; text: string }>;

function OnlineBoard({
  store,
  board,
  side,
  gameId,
  paused = false,
  onExit,
  onSettings,
  onRules,
  onMatchOver,
  now = Date.now,
}: OnlineMatchScreenProps & {
  store: OnlineStore;
  board: NonNullable<ReturnType<typeof onlineBoardStore>>;
  side: PlayerId;
}) {
  const { t } = useTranslation();
  const flow = useGameStore(board, (s) => s.flow);
  const matchKey = useGameStore(board, (s) => s.matchKey);
  const view = useOnlineStore(store, (s) => s.view);
  const sending = useOnlineStore(store, (s) => s.sending);
  const notice = useOnlineStore(store, (s) => s.notice);
  const clockOffset = useOnlineStore(store, (s) => s.clockOffset);
  const [overlay, setOverlay] = useState<Overlay>('none');
  const close = () => setOverlay('none');

  // The clock: a new time each second live, each half minute async.
  const pace = view?.pace ?? 'live';
  const [clockNow, setClockNow] = useState(now);
  useEffect(() => {
    const timer = setInterval(() => setClockNow(now()), clockTickMs(pace));
    return () => clearInterval(timer);
  }, [pace, now]);

  // Games that end while the screen is open show their game-end sheet.
  // Games that ended before it opened do not.
  const games = flow.match.games;
  const [closedGames, setClosedGames] = useState(games.length);

  const seats = onlineSeats(side, t);
  const name = (player: PlayerId) => seats[player].name;
  if (view === null) return null;

  const finished = view.status === 'finished';
  const last = games.at(-1);
  const ended: OnlineEndedGame | null =
    !finished && games.length > closedGames && last !== undefined
      ? {
          record: last,
          key: `${matchKey}:end:${games.length}`,
          onClose: () => {
            setClosedGames(games.length);
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
          key: `${matchKey}:v${view.version}:${notice}`,
          title: t(NOTICE_KEYS[notice].title),
          text: t(NOTICE_KEYS[notice].text),
          onClose: () => store.getState().clearNotice(),
        };

  const waitingFor = view.waitingFor;
  // The clock ticks once a second (or half minute): a view newer than the
  // last tick would show more than a whole turn.
  const left = timeLeft(view, clockNow, clockOffset);
  const shown = left === null ? null : Math.min(left, TURN_TIME_MS[view.pace]);
  const online: OnlineSide = {
    me: side,
    version: view.version,
    locked: sending || waitingFor !== side,
    status: sending ? t('online.status.sending') : t('online.status.waiting'),
    clock:
      waitingFor === null || shown === null || finished
        ? null
        : { player: waitingFor, text: clockText(shown, view.pace, t) },
    ended,
    notice: noticeCard,
  };

  const game = t(`games.${view.choice}`);
  const playing = variantName(flow.game.state.variant, t);
  const gameLabel = currentGameLabel(flow, t);
  // The next game is on the board already: the sheet names it.
  const nextLabel =
    ended !== null
      ? t('game.end.nextGame', { number: games.length + 1, game: playing })
      : undefined;
  const score = t('game.end.score', {
    white: name('white'),
    black: name('black'),
    whiteScore: flow.match.score.white,
    blackScore: flow.match.score.black,
  });

  let content = null;
  if (overlay === 'menu') {
    content = (
      <GameMenu
        gameLabel={gameLabel}
        summary={t('online.summary', { game, score })}
        resignGameHint={null}
        resignMatchHint={
          finished ? null : t('game.menu.resignMatchHint', { name: name(opponent(side)) })
        }
        rulesLabel={t('game.menu.rules', { game: playing })}
        onResignMatch={() => setOverlay('resignMatch')}
        onRules={() => {
          close();
          const { state } = flow.game;
          onRules(state.variant, state.rules.presetId);
        }}
        onSettings={() => {
          close();
          onSettings();
        }}
        exitHint={t('online.exitHint')}
        onExit={() => {
          close();
          onExit();
        }}
        onResume={close}
      />
    );
  } else if (overlay === 'resignMatch' && !finished) {
    content = (
      <ConfirmDialog
        testID="resign-match-dialog"
        title={t('game.resign.matchTitle')}
        lines={[t('game.resign.matchBody', { winner: name(opponent(side)) })]}
        confirmLabel={t('game.resign.confirm')}
        cancelLabel={t('game.resign.keep')}
        onConfirm={() => {
          // The server ends the match; its view opens match end.
          store.getState().dispatch({ type: 'resignMatch', player: side });
          close();
        }}
        onCancel={close}
      />
    );
  }

  return (
    <>
      <GameScreen
        store={board}
        seats={seats}
        online={online}
        paused={paused || overlay !== 'none'}
        covered={content !== null}
        onOpenMenu={() => setOverlay('menu')}
        onHome={onExit}
        onMatchOver={onMatchOver}
        gameLabel={gameLabel}
        {...(nextLabel ? { nextGameLabel: nextLabel } : {})}
      />
      <Sheet
        visible={content !== null}
        onClose={close}
        closeLabel={t('game.menu.resume')}
        look={overlay === 'menu' ? 'sheet' : 'dialog'}
        // The game screen turns with the phone (#185); its menu and dialog too.
        turns>
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
