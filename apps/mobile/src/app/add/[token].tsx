/**
 * A friend link (#406): `tavlaki://add/<token>`, from a shared link or a
 * QR code the phone's camera read. A build with no online server goes
 * Home.
 */
import { Redirect, router, useLocalSearchParams } from 'expo-router';

import { FriendLinkScreen } from '@/features/friends/FriendLinkScreen';
import { friendTokenFromLink } from '@/features/friends/friendLink';
import { FRIENDS_HREF, parseIdParam } from '@/features/match/routes';
import { auth, friends } from '@/services';

export default function FriendLinkRoute() {
  const params = useLocalSearchParams<{ token?: string }>();
  const token = friendTokenFromLink(parseIdParam(params.token) ?? '');
  if (auth === undefined || friends === undefined) return <Redirect href="/" />;
  return (
    <FriendLinkScreen
      // A new token is a new screen, with its own state.
      key={token ?? ''}
      token={token}
      auth={auth}
      friends={friends}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      onFriends={() => router.replace(FRIENDS_HREF)}
      onAccount={() => router.push('/account')}
    />
  );
}
