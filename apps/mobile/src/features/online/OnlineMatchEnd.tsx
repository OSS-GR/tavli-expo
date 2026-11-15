/**
 * Match end of an online game (#255): the final score from the server,
 * with no Rematch and no Change settings. The route
 * (`app/game/[id]/match-end.tsx`) shows it for an online id. With `safety`
 * it has Report or block for the other player (#435). A ranked match
 * (#532) adds the rating change, Play again (a friend), New player and
 * Add friend (`features/ranked/RankedMatchEnd.tsx`).
 */
import {
  isRankedGame,
  type Friends,
  type GameTransport,
  type RankedGame,
  type Ratings,
  type Safety,
} from '@tavli/contracts';
import { opponent } from '@tavli/engine';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { MatchEndScreen } from '@/features/match/MatchEndScreen';
import { MissingGame } from '@/features/match/MissingGame';
import { gameHref } from '@/features/match/routes';
import {
  RankedEndActions,
  RankedRatingChange,
  useRankedEnd,
} from '@/features/ranked/RankedMatchEnd';
import { ReportOrBlockSheet, type SafetyPlayer } from '@/features/safety/ReportOrBlock';

import { useOnlineStore, type OnlineStore } from './onlineStore';
import { onlineSeats } from './seats';
import { useOnlineGame } from './useOnlineGame';

export interface OnlineMatchEndProps {
  gameId: string;
  transport: GameTransport;
  /** Block and report (#435). Without it there is no Report or block. */
  safety?: Safety;
  me: string;
  onHome: () => void;
  /** A ranked match (#532): the rating change. */
  ratings?: Ratings;
  /** A ranked match (#532): Play again with a friend, Add friend. */
  friends?: Friends;
  /** Opens the Leaderboards. */
  onLeaderboards?: () => void;
  /** Play ranked again, in this game. */
  onNewPlayer?: (game: RankedGame) => void;
  /** A friend invite to the other player. */
  onPlayAgain?: (playerId: string) => void;
}

export function OnlineMatchEnd(props: OnlineMatchEndProps) {
  // A new game id is a new screen, with its own store.
  return <OnlineMatchEndGame key={props.gameId} {...props} />;
}

function OnlineMatchEndGame(props: OnlineMatchEndProps) {
  const { gameId, transport, me } = props;
  const store = useOnlineGame({ transport, gameId, me });
  if (store === null) return <Waiting />;
  return <OnlineMatchEndView store={store} {...props} />;
}

function Waiting() {
  return (
    <View testID="online-loading" style={styles.loading}>
      <ActivityIndicator />
    </View>
  );
}

function OnlineMatchEndView({
  store,
  gameId,
  safety,
  onHome,
  ratings,
  friends,
  onLeaderboards,
  onNewPlayer,
  onPlayAgain,
}: OnlineMatchEndProps & { store: OnlineStore }) {
  const { t } = useTranslation();
  const [reporting, setReporting] = useState<SafetyPlayer | null>(null);
  const view = useOnlineStore(store, (s) => s.view);
  const side = useOnlineStore(store, (s) => s.side);
  const loadError = useOnlineStore(store, (s) => s.loadError);
  const ranked = view?.ranked === true && view.status === 'finished' && side !== null;
  const opponentId = view !== null && side !== null ? view.players[opponent(side)] : '';
  const rankedEnd = useRankedEnd({ ratings, friends, gameId, opponentId, enabled: ranked });
  if (view === null) return loadError !== null ? <MissingGame onHome={onHome} /> : <Waiting />;
  if (side === null) return <MissingGame onHome={onHome} />;
  // A match that is not over yet belongs on the board.
  if (view.status !== 'finished') return <Redirect href={gameHref(gameId)} />;
  const other = opponent(side);
  const player: SafetyPlayer = { id: view.players[other], name: view.names[other] };
  const game = view.choice;
  const rankedParts =
    ranked && isRankedGame(game)
      ? {
          extra:
            rankedEnd.rating !== null ? (
              <RankedRatingChange
                rating={rankedEnd.rating}
                onLeaderboards={() => onLeaderboards?.()}
              />
            ) : null,
          actions: (
            <RankedEndActions
              opponentName={view.names[other]}
              friend={rankedEnd.friend}
              sending={rankedEnd.sending}
              onPlayAgain={() => onPlayAgain?.(view.players[other])}
              onAddFriend={rankedEnd.addFriend}
              onNewPlayer={() => onNewPlayer?.(game)}
            />
          ),
        }
      : {};
  return (
    <>
      <MatchEndScreen
        online={{
          seats: onlineSeats(side, t, view.names[other]),
          me: side,
          label: t('online.label', { game: t(`games.${view.choice}`) }),
          endReason: view.matchEndReason,
          ...rankedParts,
          ...(safety ? { onReportOrBlock: () => setReporting(player) } : {}),
        }}
        match={view.match}
        // The result is read once per app run (#216).
        announceKey={`online:${gameId}`}
        onHome={onHome}
      />
      {safety ? (
        <ReportOrBlockSheet player={reporting} safety={safety} onClose={() => setReporting(null)} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
}));
