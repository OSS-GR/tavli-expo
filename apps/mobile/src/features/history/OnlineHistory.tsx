/**
 * The "Online" section of History (#313): the finished online matches of
 * the saved session, live from the server (`watchMyGames` with
 * `finished`), newest first. The server keeps them, so they never go into
 * `historyStore` or the local stats.
 *
 * Like Home (#297), it reads the session only when this phone has used an
 * online account (`hasOnlineAccount`), and it never makes one. With no
 * online server (`auth` or `games` is `undefined`), no note, no session
 * or no finished match it shows nothing. A row has no tap: Home opens
 * only games in play.
 */
import type { AuthProvider, GameTransport } from '@tavli/contracts';
import { useLocales } from 'expo-localization';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { hasOnlineAccount } from '@/features/online/accountHint';
import { OnlineGameList } from '@/features/online/OnlineGameList';
import { useMyOnlineGames } from '@/features/online/myGames';

import { dateLocale, onlineHistoryRow } from './format';
import { MatchList, SectionTitle } from './MatchList';

export interface OnlineHistoryProps {
  auth: AuthProvider | undefined;
  games: GameTransport | undefined;
}

export function OnlineHistory({ auth, games }: OnlineHistoryProps) {
  // Read once when History opens: no note, no network call.
  const [account] = useState(hasOnlineAccount);
  if (!account || auth === undefined || games === undefined) return null;
  return <FinishedOnlineMatches auth={auth} games={games} />;
}

function FinishedOnlineMatches({ auth, games }: { auth: AuthProvider; games: GameTransport }) {
  const { t, i18n } = useTranslation();
  const locale = dateLocale(i18n.resolvedLanguage ?? i18n.language, useLocales());
  const { state, retry } = useMyOnlineGames(auth, games, 'finished');
  if (state.status === 'signedOut') return null;
  // No finished match: no section, unless the list may be out of date.
  if (state.status === 'loaded' && state.games.length === 0 && !state.failed) return null;
  return (
    <View testID="history-online" style={styles.section}>
      <SectionTitle title={t('history.online.title')} />
      <OnlineGameList
        state={state}
        // Finished matches have no clock.
        now={0}
        onRetry={retry}
        renderRows={(shown) =>
          shown.length === 0 ? null : (
            <MatchList
              rows={shown.map((game) => ({
                ...onlineHistoryRow(game, t, locale),
                key: game.gameId,
                testID: `history-online-${game.gameId}`,
              }))}
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: {
    gap: theme.space.sm,
  },
}));
