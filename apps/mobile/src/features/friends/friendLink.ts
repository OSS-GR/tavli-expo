/**
 * Friend links (#406). Pure: no React, no router.
 *
 * The link is `https://tavlaki.com/add/<TOKEN>` (#629), like the invite
 * share link (`features/invites/link.ts`). On an iPhone with the app, iOS
 * opens it in the app (a universal link: the site's
 * `apple-app-site-association` holds `/add/*`), and Expo Router gets the
 * path `/add/<TOKEN>` (`app/add/[token].tsx`). Without the app, the link
 * opens the site's fallback page (`docs/legal/site/add/`). The QR code
 * holds the same link, so the phone's own camera opens it: the app has no
 * scanner and never asks for the camera. An app-scheme link
 * (`tavlaki://add/<TOKEN>`, the form before #629) still opens the screen.
 *
 * The token is the random friend link token from the server
 * (`Friends.myFriendLink`), never the account id. It may come in any
 * case. A pasted bare token works too.
 */
import { normalizeFriendToken } from '@tavli/contracts';

import { INVITE_LINK_ORIGIN } from '@/features/invites/link';

/**
 * `https://tavlaki.com/add/<token>` (also `www.`) or `tavlaki://add/<token>`,
 * with an optional `/` and query or hash, which we ignore.
 */
const LINK_FORMS = [
  /^https:\/\/(?:www\.)?tavlaki\.com\/add\/([0-9a-z]+)\/?(?:[?#].*)?$/i,
  /^tavlaki:\/\/add\/([0-9a-z]+)\/?(?:[?#].*)?$/i,
];

/** The friend link of a token: `https://tavlaki.com/add/<TOKEN>`. Throws for text that is not a token. */
export function friendLinkUrl(token: string): string {
  const normal = normalizeFriendToken(token);
  if (normal === null) throw new Error('not a friend link token');
  return `${INVITE_LINK_ORIGIN}/add/${normal}`;
}

/**
 * The token in a pasted friend link (or a bare token), in capital
 * letters, or `null` when the text is neither.
 */
export function friendTokenFromLink(text: string): string | null {
  const trimmed = text.trim();
  const token = LINK_FORMS.map((form) => form.exec(trimmed)?.[1]).find((t) => t !== undefined);
  return normalizeFriendToken(token ?? trimmed);
}
