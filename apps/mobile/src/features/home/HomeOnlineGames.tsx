/**
 * "Your online games" on Home (#297): the first few active online games
 * of the saved session, "Your turn" first, live from the server. It shows
 * nothing after a sign-out, or with no active game and no failure. "See
 * all" opens the whole list.
 */
import type { AuthProvider, GameTransport } from '@tavli/contracts';
import { displayCaps } from '@tavli/ui';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OnlineGameList } from '@/features/online/OnlineGameList';
import {
  HOME_GAME_ROWS,
  listTickMs,
  useMyOnlineGames,
  usePhoneClock,
} from '@/features/online/myGames';

export interface HomeOnlineGamesProps {
  auth: AuthProvider;
  games: GameTransport;
  /** Home is in view: the clocks tick only then. */
  focused: boolean;
  onOpen: (gameId: string) => void;
  onSeeAll: () => void;
}

export function HomeOnlineGames({ auth, games, focused, onOpen, onSeeAll }: HomeOnlineGamesProps) {
  const { t } = useTranslation();
  const { state, retry } = useMyOnlineGames(auth, games);
  const shown = state.status === 'loaded' ? state.games.slice(0, HOME_GAME_ROWS) : [];
  const now = usePhoneClock(listTickMs(shown), focused);
  if (state.status === 'signedOut') return null;
  // No active game: no card, unless the list may be out of date.
  if (state.status === 'loaded' && state.games.length === 0 && !state.failed) return null;
  const title = t('home.online.title');
  return (
    <View testID="home-online-games" style={styles.section}>
      <Text style={styles.header} accessibilityRole="header" accessibilityLabel={title}>
        {displayCaps(title)}
      </Text>
      <OnlineGameList
        state={state}
        now={now}
        limit={HOME_GAME_ROWS}
        onOpen={onOpen}
        onSeeAll={onSeeAll}
        onRetry={retry}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: {
    gap: theme.space.sm,
  },
  header: {
    ...theme.type.section,
    color: theme.colors.textDim,
    paddingTop: theme.space.sm,
  },
}));
