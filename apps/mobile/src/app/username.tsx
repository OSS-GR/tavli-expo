/**
 * Settings → Username (#405): pick or change the username of a saved
 * account. A build with no online server goes back to Settings.
 */
import { Redirect, router } from 'expo-router';

import { UsernameScreen } from '@/features/online/UsernameScreen';
import { auth, usernames } from '@/services';

export default function UsernameRoute() {
  if (auth === undefined || usernames === undefined) return <Redirect href="/settings" />;
  return (
    <UsernameScreen
      auth={auth}
      usernames={usernames}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
    />
  );
}
