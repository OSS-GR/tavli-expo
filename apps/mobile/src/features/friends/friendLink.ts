/**
 * Friend links (#406). Pure: no React, no router.
 *
 * The link is `tavlaki://add/<TOKEN>`: the app scheme (`app.json`), like
 * the invite link (`features/invites/link.ts`). The QR code holds the same
 * link, so the phone's own camera opens it in the app: the app has no
 * scanner and never asks for the camera.
 *
 * The token is the random friend link token from the server
 * (`Friends.myFriendLink`), never the account id. It may come in any
 * case. A pasted bare token works too.
 */
import { normalizeFriendToken } from '@tavli/contracts';

/** `tavlaki://add/<token>`, with an optional `/` and query or hash, which we ignore. */
const LINK_FORM = /^tavlaki:\/\/add\/([0-9a-z]+)\/?(?:[?#].*)?$/i;

/** The app link of a friend link token: `tavlaki://add/<TOKEN>`. Throws for text that is not a token. */
export function friendLinkUrl(token: string): string {
  const normal = normalizeFriendToken(token);
  if (normal === null) throw new Error('not a friend link token');
  return `tavlaki://add/${normal}`;
}

/**
 * The token in a pasted friend link (or a bare token), in capital
 * letters, or `null` when the text is neither.
 */
export function friendTokenFromLink(text: string): string | null {
  const trimmed = text.trim();
  const token = LINK_FORM.exec(trimmed)?.[1];
  return normalizeFriendToken(token ?? trimmed);
}
