/**
 * A friend invite sent from the full setup (`/friends/invite/<id>`, #507).
 * The friend gets a push, so the inviter needs no waiting screen: the
 * route goes back to Friends, and Friends says "Invite sent". This note
 * carries the send across. It is one slot in memory, and Friends takes it
 * when it comes into view. It holds no name: Friends has the name in its
 * list.
 *
 * Back may land somewhere else (the setup opened from a link). The note
 * then goes stale: after `SENT_NOTE_MS` Friends no longer shows it.
 */
export interface SentInvite {
  readonly playerId: string;
  readonly code: string;
}

/** How long a note waits for Friends. Back to Friends takes far less. */
export const SENT_NOTE_MS = 10_000;

let pending: { readonly sent: SentInvite; readonly at: number } | null = null;

/** The full setup sent a friend invite. A newer send replaces an older one. */
export function noteInviteSent(sent: SentInvite): void {
  pending = { sent, at: Date.now() };
}

/**
 * The send to show, once, or `null`. A note older than `SENT_NOTE_MS` is
 * dropped. A clock that moved back keeps it: a stale note only shows a
 * line, and the next take clears it.
 */
export function takeInviteSent(): SentInvite | null {
  const note = pending;
  pending = null;
  if (note === null || Date.now() - note.at > SENT_NOTE_MS) return null;
  return note.sent;
}
