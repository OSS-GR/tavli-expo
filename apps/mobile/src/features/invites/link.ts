/**
 * Invite links (#256). Pure: no React, no router.
 *
 * Two forms open the invite screen:
 * - `tavlaki://invite/<code>`: the app scheme (`app.json`). It works now.
 * - `https://tavlaki.com/i/<code>`: the share link. The phone opens it in
 *   the app only once tavlaki.com hosts the universal link and App Link
 *   files (owner, a later issue). Until then it opens in the browser.
 *
 * The code may come in any case. A code with a wrong length, or with a
 * character that is not in `INVITE_CODE_ALPHABET`, is refused.
 */
import { normalizeInviteCode } from '@tavli/contracts';

/** The site of the share link. */
export const INVITE_LINK_ORIGIN = 'https://tavlaki.com';

/**
 * `tavlaki://invite/<code>` or `https://tavlaki.com/i/<code>` (also
 * `www.`), with an optional `/` at the end and an optional query or hash,
 * which we ignore. The scheme and the host may come in any case.
 */
const LINK_FORMS = [
  /^tavlaki:\/\/invite\/([0-9a-z]+)\/?(?:[?#].*)?$/i,
  /^https:\/\/(?:www\.)?tavlaki\.com\/i\/([0-9a-z]+)\/?(?:[?#].*)?$/i,
];

/**
 * The invite code in `link`, in capital letters, or `null` when `link` is
 * not an invite link or its code is not a code.
 *
 * No route uses it yet: the router opens `tavlaki://invite/<code>` by
 * itself. It is here for universal links and app links later, when an
 * `https://tavlaki.com/i/<code>` link must be turned into the route.
 */
export function inviteCodeFromLink(link: string): string | null {
  const text = link.trim();
  for (const form of LINK_FORMS) {
    const code = form.exec(text)?.[1];
    if (code !== undefined) return normalizeInviteCode(code);
  }
  return null;
}

/**
 * The invite code in a router path (`/invite/<code>`, what Expo Router
 * makes of `tavlaki://invite/<code>`), in capital letters, or `null`.
 */
export function inviteCodeFromPath(pathname: string): string | null {
  const code = /^\/invite\/([0-9a-z]+)\/?$/i.exec(pathname)?.[1];
  return code === undefined ? null : normalizeInviteCode(code);
}

/** The share link of an invite: `https://tavlaki.com/i/<CODE>`. */
export function inviteUrl(code: string): string {
  return `${INVITE_LINK_ORIGIN}/i/${checked(code)}`;
}

/**
 * The app link of an invite: `tavlaki://invite/<CODE>`. It opens the
 * invite in an installed app, for example on a simulator
 * (`xcrun simctl openurl booted tavlaki://invite/<CODE>`).
 */
export function inviteAppUrl(code: string): string {
  return `tavlaki://invite/${checked(code)}`;
}

/** The code in capital letters. Throws for text that is not a code: that is a bug. */
function checked(code: string): string {
  const normal = normalizeInviteCode(code);
  if (normal === null) throw new Error(`not an invite code: ${code}`);
  return normal;
}
