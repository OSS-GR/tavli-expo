/**
 * Join with a code (#333): Home → "Join with a code" opens here. A code
 * that passes the phone's check opens the invite screen (`/invite/<CODE>`,
 * the same route as an invite link), so the account step, the invite's
 * states, Accept and dev invites all work as for a link. The invite is
 * pushed over this screen: Back from "not found" returns to the typed code.
 * A build with no online server goes Home.
 */
import { Redirect, router } from 'expo-router';

import { JoinCodeScreen } from '@/features/invites/JoinCodeScreen';
import { inviteHref } from '@/features/match/routes';
import { invites } from '@/services';

export default function JoinRoute() {
  if (invites === undefined) return <Redirect href="/" />;
  return (
    <JoinCodeScreen
      onCode={(code) => router.push(inviteHref(code))}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    />
  );
}
