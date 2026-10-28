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
 * first-launch flow) was due, until the welcome flow has redirected.
 * Else `null`.
 *
 * It adjusts its state while it renders, as React suggests for state that
 * follows props (an effect would set it one render late, and lint refuses
 * a set state in an effect).
 */
export function usePendingInvite(welcome: boolean): string | null {
  const pathname = usePathname();
  const [pending, setPending] = useState<string | null>(null);
  const code = inviteCodeFromPath(pathname);
  const onWelcome = pathname.startsWith('/welcome');
  // The guarded invite route is in the state for a moment before the
  // router redirects to the welcome flow: remember its code.
  if (welcome && code !== null && code !== pending) setPending(code);
  // The answer is in and the router has left the welcome routes (to the
  // invite, or anywhere else): nothing waits any more, so a later welcome
  // flow cannot open this invite again.
  if (!welcome && !onWelcome && pending !== null) setPending(null);
  return pending;
}
