/**
 * "See all" of "Your online games" (#297): every active online game of
 * the saved session (at most `MAX_LISTED_GAMES`), "Your turn" first, live
 * from the server. The Home style (#362): `Screen` and `ScreenHeader`; the
 * list draws its own cards, as on Home.
 *
 * With no game (or no session) it shows the empty state of the Figma pass
 * (#521): the medallion, one sentence, Play a friend and, as a text button,
 * Join with a code. Each button only opens its screen, which does the rest.
 */
import type { AuthProvider, GameTransport } from '@tavli/contracts';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { EmptyMedallion } from '@/components/EmptyMedallion';
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
  /** The empty state's Play a friend. No button without it. */
  onPlayFriend?: () => void;
  /** The empty state's Join with a code. No button without it. */
  onJoin?: () => void;
}

export function MyGamesScreen({
  auth,
  games,
  focused,
  onOpen,
  onBack,
  onPlayFriend,
  onJoin,
}: MyGamesScreenProps) {
  const { t } = useTranslation();
  const { state, retry } = useMyOnlineGames(auth, games);
  const now = usePhoneClock(listTickMs(state.status === 'loaded' ? state.games : []), focused);
  // No game and no failure: the empty state. After a failure the list
  // says so (and may be out of date), so it keeps the list's own notes.
  const empty =
    state.status === 'signedOut' ||
    (state.status === 'loaded' && state.games.length === 0 && !state.failed);
  return (
    <Screen>
      <ScreenHeader
        title={t('home.online.title')}
        {...(onBack ? { onBack } : {})}
        backLabel={t('common.back')}
        testID="online-games-back"
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {empty ? (
          <View style={styles.empty}>
            <EmptyMedallion icon="globe" testID="online-games-medallion" />
            <View style={styles.emptyTexts}>
              <Text style={styles.emptyTitle} accessibilityRole="header">
                {t('onlineGames.empty.title')}
              </Text>
              <Text testID="online-games-empty" style={styles.emptyBody}>
                {t('onlineGames.empty.body')}
              </Text>
            </View>
            <View style={styles.emptyButtons}>
              {onPlayFriend ? (
                <ActionButton
                  testID="online-games-play-friend"
                  icon="send"
                  label={t('home.friend.title')}
                  onPress={onPlayFriend}
                />
              ) : null}
              {onJoin ? (
                <ActionButton
                  testID="online-games-join"
                  kind="text"
                  icon="keyboard"
                  label={t('home.join.title')}
                  onPress={onJoin}
                />
              ) : null}
            </View>
          </View>
        ) : (
          <OnlineGameList state={state} now={now} onOpen={onOpen} onRetry={retry} />
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
  // As in History's empty state: a little above the middle.
  empty: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: theme.space.lg,
    paddingHorizontal: theme.space.md,
    paddingBottom: theme.space.xxxl + theme.space.xxl,
  },
  emptyTexts: {
    gap: theme.space.xs + theme.space.xxs,
  },
  emptyTitle: {
    ...theme.type.title2,
    color: theme.colors.text,
    textAlign: 'center',
  },
  emptyBody: {
    ...theme.type.callout,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
  emptyButtons: {
    gap: theme.space.xs + theme.space.xxs,
  },
}));
