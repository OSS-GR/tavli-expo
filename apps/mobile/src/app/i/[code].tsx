/**
 * The share link of an invite (#332): `https://tavlaki.com/i/<code>`. On an
 * iPhone with the app, iOS opens the link in the app (a universal link), and
 * Expo Router gets the path `/i/<code>`. This route sends it on to the
 * invite route (`invite/[code]`), so both links show the same screen.
 *
 * The route is in the guarded group of `_layout.tsx`, like the invite route.
 * On first launch the welcome flow comes first: `usePendingInvite` keeps the
 * code of this path too, and the layout opens the invite after the flow.
 *
 * `Redirect` replaces this route, so Back never returns to it. Text that is
 * not a code goes on as it is: the invite route shows "not found". With no
 * code at all, the route opens Home.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';

import { inviteHref, parseIdParam } from '@/features/match/routes';

export default function ShareLinkRoute() {
  const params = useLocalSearchParams<{ code?: string }>();
  const code = parseIdParam(params.code);
  return <Redirect href={code === null ? '/' : inviteHref(code)} />;
}
