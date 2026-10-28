/**
 * Play a friend online (#281): Home → "Play a friend" opens here. "Make
 * an invite" replaces this screen with the waiting screen of the new
 * invite (`friend/<code>`), so Back from it goes Home. A build with no
 * online server goes Home.
 */
import { Redirect, router } from 'expo-router';

import { FriendSetupScreen } from '@/features/invites/FriendSetupScreen';
import { inviteWaitHref } from '@/features/match/routes';
import { auth, invites } from '@/services';

export default function FriendRoute() {
  if (auth === undefined || invites === undefined) return <Redirect href="/" />;
  return (
    <FriendSetupScreen
      auth={auth}
      invites={invites}
      onCreated={(code) => router.replace(inviteWaitHref(code))}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    />
  );
}
