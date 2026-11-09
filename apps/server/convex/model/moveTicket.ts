/**
 * Move tickets (#403): a guest tried to save a key that another account
 * has already. The server answers with a ticket, and the app passes it
 * back when the player chooses to move the guest's games there.
 *
 * A ticket is signed, not stored: `<payload>.<signature>`, where the
 * payload is base64url JSON `{ source, target, expiresAt }` and the
 * signature an HMAC-SHA-256 of it with the Better Auth secret. The ticket
 * says which guest (`source`) may move into which account (`target`), so
 * the server never takes either id from the app. It works once: the move
 * deletes the guest.
 *
 * Pure: no Convex types. `now` is an argument.
 */
import { base64Url, sameText, signText } from './keyNonce';

/** How long a ticket stays good, ms. The player reads one short sheet. */
export const MOVE_TICKET_TTL_MS = 10 * 60 * 1000;

/** Text before the signed part, so this HMAC is never one of another use. */
const PURPOSE = 'tavlaki-move-ticket:';

/** Who moves into whom. */
export interface MoveTicket {
  /** The guest: its data moves, then it is deleted. */
  readonly source: string;
  /** The account that has the key. */
  readonly target: string;
}

function fromBase64Url(text: string): string | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** A new ticket that runs out `MOVE_TICKET_TTL_MS` after `now`. */
export async function makeMoveTicket(
  secret: string,
  ticket: MoveTicket,
  now: number,
): Promise<string> {
  const json = JSON.stringify({
    source: ticket.source,
    target: ticket.target,
    expiresAt: now + MOVE_TICKET_TTL_MS,
  });
  const payload = base64Url(new TextEncoder().encode(json));
  return `${payload}.${await signText(secret, PURPOSE, payload)}`;
}

/**
 * Who moves into whom, or `null` when this server did not make the
 * ticket, or it ran out at `now`.
 */
export async function checkMoveTicket(
  secret: string,
  ticket: string,
  now: number,
): Promise<MoveTicket | null> {
  const parts = ticket.split('.');
  if (parts.length !== 2) return null;
  const [payload, mac] = parts as [string, string];
  if (payload === '' || mac === '') return null;
  if (!sameText(mac, await signText(secret, PURPOSE, payload))) return null;
  const json = fromBase64Url(payload);
  if (json === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { source, target, expiresAt } = value as Record<string, unknown>;
  if (typeof source !== 'string' || typeof target !== 'string') return null;
  if (typeof expiresAt !== 'number' || !(expiresAt > now)) return null;
  if (source === '' || target === '' || source === target) return null;
  return { source, target };
}
