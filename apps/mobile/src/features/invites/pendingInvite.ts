/**
 * An invite link on first launch (#256). The app routes are guarded until
 * the user answers the welcome flow (`app/_layout.tsx`), so the router
 * sends `/invite/<code>` to the language step first. The layout keeps the
 * code here, and the welcome group's redirect then opens the invite
 * instead of Home.
 */
import { usePathname } from 'expo-router';
import { useState } from 'react';

import { inviteCodeFromPath } from './link';

/**
 * The code of an invite link that opened the app while `welcome` (the
 * first-launch flow) was due, until that invite shows. Else `null`.
 */
export function usePendingInvite(welcome: boolean): string | null {
  const pathname = usePathname();
  const [pending, setPending] = useState<string | null>(null);
  const code = inviteCodeFromPath(pathname);
  // The guarded invite route is in the state for a moment before the
  // router redirects to the welcome flow: remember its code.
  if (welcome && code !== null && code !== pending) setPending(code);
  // After the welcome flow the invite shows: nothing waits any more.
  if (!welcome && code !== null && code === pending) setPending(null);
  return pending;
}
