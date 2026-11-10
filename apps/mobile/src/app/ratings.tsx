/**
 * Leaderboards (#407), from Settings → Online and the Friends screen. A
 * build with no online server goes back to Settings.
 */
import { Redirect, router } from 'expo-router';

import { useVisit } from '@/features/friends/useVisit';
import { RatingsScreen } from '@/features/ratings/RatingsScreen';
import { auth, ratings } from '@/services';

export default function RatingsRoute() {
  // Counts the times the screen shows, so it loads again on the way back.
  const visit = useVisit();
  if (auth === undefined || ratings === undefined) return <Redirect href="/settings" />;
  return (
    <RatingsScreen
      auth={auth}
      ratings={ratings}
      visit={visit}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
      onAccount={() => router.push('/account')}
      onUsername={() => router.push('/username')}
    />
  );
}
