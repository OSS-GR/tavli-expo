/**
 * Match end of an online game (#255): the final score from the server,
 * with no Rematch and no Change settings. The route
 * (`app/game/[id]/match-end.tsx`) shows it for an online id.
 */
import type { GameTransport } from '@tavli/contracts';
import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { MatchEndScreen } from '@/features/match/MatchEndScreen';
import { MissingGame } from '@/features/match/MissingGame';
import { gameHref } from '@/features/match/routes';

import { useOnlineStore, type OnlineStore } from './onlineStore';
import { onlineSeats } from './seats';
import { useOnlineGame } from './useOnlineGame';

export interface OnlineMatchEndProps {
  gameId: string;
  transport: GameTransport;
  me: string;
  onHome: () => void;
}

export function OnlineMatchEnd(props: OnlineMatchEndProps) {
  // A new game id is a new screen, with its own store.
  return <OnlineMatchEndGame key={props.gameId} {...props} />;
}

function OnlineMatchEndGame(props: OnlineMatchEndProps) {
  const { gameId, transport, me } = props;
  const store = useOnlineGame({ transport, gameId, me });
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
  onHome,
}: OnlineMatchEndProps & { store: OnlineStore }) {
  const { t } = useTranslation();
  const view = useOnlineStore(store, (s) => s.view);
  const side = useOnlineStore(store, (s) => s.side);
  const loadError = useOnlineStore(store, (s) => s.loadError);
  if (view === null) return loadError !== null ? <MissingGame onHome={onHome} /> : <Waiting />;
  if (side === null) return <MissingGame onHome={onHome} />;
  // A match that is not over yet belongs on the board.
  if (view.status !== 'finished') return <Redirect href={gameHref(gameId)} />;
  return (
    <MatchEndScreen
      online={{
        seats: onlineSeats(side, t),
        me: side,
        label: t('online.label', { game: t(`games.${view.choice}`) }),
      }}
      match={view.match}
      // The result is read once per app run (#216).
      announceKey={`online:${gameId}`}
      onHome={onHome}
    />
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
