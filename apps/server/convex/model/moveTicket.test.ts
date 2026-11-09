import { describe, expect, it } from 'vitest';

import { makeKeyNonce } from './keyNonce';
import { checkMoveTicket, makeMoveTicket, MOVE_TICKET_TTL_MS } from './moveTicket';

const SECRET = 'a-test-secret-that-is-long-enough-0123456789';
const MOVE = { source: 'guest-1', target: 'owner-1' };

describe('move tickets (#403)', () => {
  it('a ticket names the guest and the account until it runs out', async () => {
    const ticket = await makeMoveTicket(SECRET, MOVE, 1_000);
    expect(await checkMoveTicket(SECRET, ticket, 1_000)).toEqual(MOVE);
    expect(await checkMoveTicket(SECRET, ticket, 1_000 + MOVE_TICKET_TTL_MS - 1)).toEqual(MOVE);
    expect(await checkMoveTicket(SECRET, ticket, 1_000 + MOVE_TICKET_TTL_MS)).toBeNull();
  });

  it('turns down another secret, a changed payload or a changed signature', async () => {
    const ticket = await makeMoveTicket(SECRET, MOVE, 1_000);
    expect(
      await checkMoveTicket('another-secret-that-is-long-enough-000000', ticket, 1_000),
    ).toBeNull();
    const [payload, mac] = ticket.split('.') as [string, string];
    const other = (await makeMoveTicket(SECRET, { ...MOVE, target: 'owner-2' }, 1_000)).split(
      '.',
    )[0]!;
    expect(await checkMoveTicket(SECRET, `${other}.${mac}`, 1_000)).toBeNull();
    expect(await checkMoveTicket(SECRET, `${payload}.${mac.slice(1)}x`, 1_000)).toBeNull();
    for (const bad of ['', 'a', 'a.b', `.${mac}`, `${payload}.`, `${ticket}.more`]) {
      expect(await checkMoveTicket(SECRET, bad, 1_000)).toBeNull();
    }
  });

  it('a key nonce is never a ticket', async () => {
    const nonce = await makeKeyNonce(SECRET, 1_000, new Uint8Array(16).fill(7));
    const [expires, random, mac] = nonce.split('.') as [string, string, string];
    expect(await checkMoveTicket(SECRET, `${expires}${random}.${mac}`, 1_000)).toBeNull();
  });
});
