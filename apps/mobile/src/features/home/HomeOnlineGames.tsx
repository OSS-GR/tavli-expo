/**
 * "Your games" on Home (#297, #517): the games in progress that are not
 * in the hero. The saved game on this phone comes first (`saved`), then
 * the first few active online games of the saved session, "Your turn"
 * first, live from the server (`useMyOnlineGames`, in the route). It
 * shows nothing with no game and no failure. "See all" opens the whole
 * online list.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { SectionHeader } from '@/components/SectionHeader';
import { OnlineGameList } from '@/features/online/OnlineGameList';
import {
  HOME_GAME_ROWS,
  listTickMs,
  usePhoneClock,
  type MyGamesState,
} from '@/features/online/myGames';

export interface HomeOnlineGamesProps {
  /** The online games (`useMyOnlineGames`). */
  state: MyGamesState;
  retry: () => void;
  /** The online game in the hero: left out of the list. */
  heroGameId?: string | null;
  /** The saved game's row (`SavedGameRow`), when the hero is not the saved game. */
  saved?: ReactNode;
  /** Home is in view: the clocks tick only then. */
  focused: boolean;
  onOpen: (gameId: string) => void;
  onSeeAll: () => void;
}

export function HomeOnlineGames({
  state,
  retry,
  heroGameId = null,
  saved = null,
  focused,
  onOpen,
  onSeeAll,
}: HomeOnlineGamesProps) {
  const { t } = useTranslation();
  const listed: MyGamesState =
    state.status === 'loaded' && heroGameId !== null
      ? { ...state, games: state.games.filter((game) => game.gameId !== heroGameId) }
      : state;
  const shown = listed.status === 'loaded' ? listed.games.slice(0, HOME_GAME_ROWS) : [];
  const now = usePhoneClock(listTickMs(shown), focused);
  // No online game to list (and no failure): only the saved row, if any.
  const noOnline =
    listed.status === 'signedOut' ||
    (listed.status === 'loaded' && listed.games.length === 0 && !listed.failed);
  if (noOnline && saved === null) return null;
  const title = t('home.games.title');
  return (
    <View testID="home-online-games" style={styles.section}>
      <SectionHeader title={title} />
      {saved}
      <OnlineGameList
        state={listed}
        now={now}
        limit={HOME_GAME_ROWS}
        {...(state.status === 'loaded' ? { total: state.games.length } : {})}
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
}));
