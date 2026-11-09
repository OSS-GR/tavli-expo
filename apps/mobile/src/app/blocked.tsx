/**
 * Settings → Blocked players (#435): the players you blocked or reported,
 * with Unblock. A build with no online server goes back to Settings.
 */
import { Redirect, router } from 'expo-router';

import { BlockedPlayersScreen } from '@/features/safety/BlockedPlayersScreen';
import { auth, safety } from '@/services';

export default function BlockedRoute() {
  if (auth === undefined || safety === undefined) return <Redirect href="/settings" />;
  return (
    <BlockedPlayersScreen
      auth={auth}
      safety={safety}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
    />
  );
}
