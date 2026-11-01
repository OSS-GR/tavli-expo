/**
 * "See all" of "Your online games" on Home (#297). A tap opens the game
 * (`game/<gameId>`). A build with no online server goes Home.
 */
import { Redirect, Stack, router, useIsFocused } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { gameHref } from '@/features/match/routes';
import { MyGamesScreen } from '@/features/online/MyGamesScreen';
import { auth, games } from '@/services';

export default function OnlineGamesRoute() {
  const { t } = useTranslation();
  const focused = useIsFocused();
  if (auth === undefined || games === undefined) return <Redirect href="/" />;
  return (
    <>
      {/* The screen draws its own header (#362). */}
      <Stack.Screen options={{ title: t('home.online.title'), headerShown: false }} />
      <MyGamesScreen
        auth={auth}
        games={games}
        focused={focused}
        onOpen={(gameId) => router.push(gameHref(gameId))}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
    </>
  );
}
