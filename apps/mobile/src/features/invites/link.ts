/**
 * Invite links (#256). Pure: no React, no router.
 *
 * Two forms open the invite screen:
 * - `tavlaki://invite/<code>`: the app scheme (`app.json`). Expo Router
 *   makes it the path `/invite/<code>` (`app/invite/[code].tsx`).
 * - `https://tavlaki.com/i/<code>`: the share link (#332). On an iPhone with
 *   a production build, iOS opens it in the app (a universal link:
 *   `ios.associatedDomains` in `app.json`, and the site's
 *   `apple-app-site-association` in `docs/legal/site/.well-known/`). Expo
 *   Router makes it the path `/i/<code>`, and `app/i/[code].tsx` sends it
 *   on to `/invite/<code>`. Without the app, or on Android (App Links come
 *   later), the link opens the site's fallback page (`docs/legal/site/i/`),
 *   which tells the friend how to get the app and enter the code.
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
 * The router opens both links by itself (as routes). "Join with a code"
 * (#333, `typedCode.ts`) uses this for a pasted link.
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
 * The invite code in a router path, in capital letters, or `null`. The path
 * is `/invite/<code>` (what Expo Router makes of `tavlaki://invite/<code>`)
 * or `/i/<code>` (of the share link `https://tavlaki.com/i/<code>`, #332).
 */
export function inviteCodeFromPath(pathname: string): string | null {
  const code = /^\/(?:invite|i)\/([0-9a-z]+)\/?$/i.exec(pathname)?.[1];
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
