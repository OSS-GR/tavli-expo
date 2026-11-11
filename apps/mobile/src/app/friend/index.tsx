/**
 * Play a friend online (#281): Home → "Play a friend" opens here. "Make
 * an invite" replaces this screen with the waiting screen of the new
 * invite (`friend/<code>`), so Back from it goes Home. A build with no
 * online server goes Home. After an async invite the app offers turn
 * notifications (#285, #183). A saved account with friends sees a short
 * list of them (#488): a tap sends a friend invite, and its waiting screen
 * replaces this one too.
 */
import { Redirect, router } from 'expo-router';
import { useState } from 'react';

import { FriendSetupScreen } from '@/features/invites/FriendSetupScreen';
import { FRIENDS_HREF, inviteWaitHref } from '@/features/match/routes';
import { turnPushes } from '@/features/notifications/appTurnPushes';
import { hasOnlineAccount } from '@/features/online/accountHint';
import { useAppUpdateCheck } from '@/features/update/updateCheck';
import { auth, friends, invites } from '@/services';

export default function FriendRoute() {
  // Update needed (#390): a phone that played online asks the server when
  // it opens. Before the first invite the app does not talk to the server
  // (privacy policy): Make an invite asks then (`signInForOnline`).
  const [playedOnline] = useState(hasOnlineAccount);
  useAppUpdateCheck(playedOnline);
  if (auth === undefined || invites === undefined) return <Redirect href="/" />;
  return (
    <FriendSetupScreen
      auth={auth}
      invites={invites}
      {...(friends === undefined ? {} : { friends })}
      onFriends={() => router.push(FRIENDS_HREF)}
      onCreated={(code, game) => {
        router.replace(inviteWaitHref(code));
        // Every online game can last a while: offer turn notifications (#285).
        void turnPushes()?.offer();
      }}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    />
  );
}
