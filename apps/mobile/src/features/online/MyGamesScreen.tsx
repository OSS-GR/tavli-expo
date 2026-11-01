/**
 * "See all" of "Your online games" (#297): every active online game of
 * the saved session (at most `MAX_LISTED_GAMES`), "Your turn" first, live
 * from the server. The Home style (#362): `Screen` and `ScreenHeader`; the
 * list draws its own cards, as on Home.
 */
import type { AuthProvider, GameTransport } from '@tavli/contracts';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';

import { OnlineGameList } from './OnlineGameList';
import { listTickMs, useMyOnlineGames, usePhoneClock } from './myGames';

export interface MyGamesScreenProps {
  auth: AuthProvider;
  games: GameTransport;
  /** The screen is in view: the clocks tick only then. */
  focused: boolean;
  onOpen: (gameId: string) => void;
  /** Goes back. Without it the header has no back button. */
  onBack?: () => void;
}

export function MyGamesScreen({ auth, games, focused, onOpen, onBack }: MyGamesScreenProps) {
  const { t } = useTranslation();
  const { state, retry } = useMyOnlineGames(auth, games);
  const now = usePhoneClock(listTickMs(state.status === 'loaded' ? state.games : []), focused);
  const empty = t('home.online.empty');
  return (
    <Screen>
      <ScreenHeader
        title={t('home.online.title')}
        {...(onBack ? { onBack } : {})}
        backLabel={t('newGame.back')}
        testID="online-games-back"
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {state.status === 'signedOut' ? (
          <Text testID="online-games-empty" style={styles.note}>
            {empty}
          </Text>
        ) : (
          <OnlineGameList
            state={state}
            now={now}
            onOpen={onOpen}
            onRetry={retry}
            emptyText={empty}
          />
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    gap: theme.space.md,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.sm,
    paddingBottom: rt.insets.bottom + theme.space.xl,
  },
  note: {
    ...theme.type.body,
    color: theme.colors.textDim,
  },
}));
