/**
 * Play ranked (#532): Home → "Play ranked" opens here, and New player at
 * the end of a ranked match (`?game=`). A match found replaces this
 * screen with the game, so Back from the game goes Home. A build with no
 * online server goes Home.
 */
import { isRankedGame } from '@tavli/contracts';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { useVisit } from '@/features/friends/useVisit';
import { gameHref, newGameHref } from '@/features/match/routes';
import { turnPushes } from '@/features/notifications/appTurnPushes';
import { hasOnlineAccount } from '@/features/online/accountHint';
import { RankedScreen } from '@/features/ranked/RankedScreen';
import { useAppUpdateCheck } from '@/features/update/updateCheck';
import {
  analytics,
  appleSheet,
  auth,
  games,
  matchmaking,
  onlineData,
  ratings,
  safety,
  usernames,
} from '@/services';

export default function RankedRoute() {
  // Update needed (#390): a phone that played online asks the server when
  // it opens. A phone that never did asks nothing until it signs in.
  const [playedOnline] = useState(hasOnlineAccount);
  useAppUpdateCheck(playedOnline);
  // Counts the times the screen shows, so the account loads again on the way back.
  const visit = useVisit();
  const { game } = useLocalSearchParams<{ game?: string }>();
  if (
    auth === undefined ||
    usernames === undefined ||
    onlineData === undefined ||
    matchmaking === undefined ||
    ratings === undefined ||
    games === undefined
  ) {
    return <Redirect href="/" />;
  }
  return (
    <RankedScreen
      account={{ auth, usernames, data: onlineData, appleSheet, analytics, pushes: turnPushes() }}
      matchmaking={matchmaking}
      ratings={ratings}
      games={games}
      {...(safety === undefined ? {} : { safety })}
      analytics={analytics}
      visit={visit}
      {...(game !== undefined && isRankedGame(game) ? { initialGame: game } : {})}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      onGame={(gameId) => router.replace(gameHref(gameId))}
      onBot={() => router.replace(newGameHref('bot'))}
    />
  );
}
