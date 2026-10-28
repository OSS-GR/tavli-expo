/**
 * "See all" of "Your online games" (#297): every active online game of
 * the saved session (at most `MAX_LISTED_GAMES`), "Your turn" first, live
 * from the server.
 */
import type { AuthProvider, GameTransport } from '@tavli/contracts';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OnlineGameList } from './OnlineGameList';
import { listTickMs, useMyOnlineGames, usePhoneClock } from './myGames';

export interface MyGamesScreenProps {
  auth: AuthProvider;
  games: GameTransport;
  /** The screen is in view: the clocks tick only then. */
  focused: boolean;
  onOpen: (gameId: string) => void;
}

export function MyGamesScreen({ auth, games, focused, onOpen }: MyGamesScreenProps) {
  const { t } = useTranslation();
  const { state, retry } = useMyOnlineGames(auth, games);
  const now = usePhoneClock(listTickMs(state.status === 'loaded' ? state.games : []), focused);
  const empty = t('home.online.empty');
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {state.status === 'signedOut' ? (
        <Text testID="online-games-empty" style={styles.note}>
          {empty}
        </Text>
      ) : (
        <OnlineGameList state={state} now={now} onOpen={onOpen} onRetry={retry} emptyText={empty} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flexGrow: 1,
    gap: theme.space.md,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.lg,
    paddingBottom: rt.insets.bottom + theme.space.xl,
  },
  note: {
    ...theme.type.body,
    color: theme.colors.textDim,
  },
}));
