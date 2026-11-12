/**
 * A friend invite sent from the full setup (`/friends/invite/<id>`, #507).
 * The friend gets a push, so the inviter needs no waiting screen: the
 * route goes back to Friends, and Friends says "Invite sent". This note
 * carries the send across. It is one slot in memory, and Friends takes it
 * when it comes into view. It holds no name: Friends has the name in its
 * list.
 */
export interface SentInvite {
  readonly playerId: string;
  readonly code: string;
}

let pending: SentInvite | null = null;

/** The full setup sent a friend invite. A newer send replaces an older one. */
export function noteInviteSent(sent: SentInvite): void {
  pending = sent;
}

/** The send to show, once, or `null`. */
export function takeInviteSent(): SentInvite | null {
  const sent = pending;
  pending = null;
  return sent;
}
