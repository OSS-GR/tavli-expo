// The pure invite logic, with a seeded RNG (tests only; the server
// always uses `createCryptoRng`).

import { describe, expect, it } from 'vitest';

import { INVITE_CODE_ALPHABET, INVITE_TIME_MS, normalizeInviteCode } from '@tavli/contracts';
import type { InviteErrorCode, InviteStatus } from '@tavli/contracts';
import { createSeededRng } from '@tavli/engine';
import type { Rng } from '@tavli/engine';

import {
  InviteError,
  MAX_CODE_TRIES,
  MAX_OPEN_INVITES,
  checkAnswer,
  checkCancel,
  checkInviteCap,
  countOpenInvites,
  inviteExpiresAt,
  inviteStatus,
  isInviteExpired,
  newInvite,
  newInviteCode,
  pickInviteCode,
  pickInviteCodeNow,
  toInviteView,
} from './invites';
import type { InviteRecord } from './invites';

const NOW = Date.UTC(2026, 9, 28, 12, 0, 0);
const OPTIONS = { from: 'alice', choice: 'portes', targetPoints: 3, turnTimeMinutes: 1 } as const;

function invite(status: InviteStatus = 'open'): InviteRecord {
  return { ...newInvite(OPTIONS, 'ABCD2345', NOW), status };
}

/** An `Rng` that returns `values`, in order. */
function fixedRng(values: readonly number[]): Rng {
  let next = 0;
  return {
    nextUint32() {
      const value = values[next];
      if (value === undefined) throw new Error('no more values');
      next += 1;
      return value;
    },
  };
}

function rejects(step: () => unknown, code: InviteErrorCode) {
  expect(step).toThrow(InviteError);
  try {
    step();
  } catch (error) {
    expect((error as InviteError).code).toBe(code);
  }
}

describe('newInviteCode', () => {
  it('gives 8 characters from the alphabet, in their stored form', () => {
    const rng = createSeededRng(1);
    for (let i = 0; i < 200; i++) {
      const code = newInviteCode(rng);
      expect(code).toHaveLength(8);
      for (const char of code) expect(INVITE_CODE_ALPHABET).toContain(char);
      expect(normalizeInviteCode(code)).toBe(code);
    }
  });

  it('maps values to characters, and draws again above the fair limit', () => {
    const size = INVITE_CODE_ALPHABET.length;
    const limit = 2 ** 32 - (2 ** 32 % size);
    // 0 → '2', 1 → '3', size → '2' again; `limit` and above are drawn again.
    const rng = fixedRng([0, 1, size, limit, 0xffffffff, size - 1, 2, 3, 4, 5]);
    expect(newInviteCode(rng)).toBe(`232${INVITE_CODE_ALPHABET[size - 1]}4567`);
  });

  it('uses every character about as often', () => {
    const rng = createSeededRng(7);
    const counts = new Map<string, number>();
    for (let i = 0; i < 4000; i++) {
      for (const char of newInviteCode(rng)) counts.set(char, (counts.get(char) ?? 0) + 1);
    }
    // 32,000 characters: each about 1,032 times. The bounds are far apart.
    expect(counts.size).toBe(INVITE_CODE_ALPHABET.length);
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(800);
      expect(count).toBeLessThan(1300);
    }
  });
});

describe('pickInviteCode', () => {
  it('returns the first free code', async () => {
    const code = await pickInviteCode(createSeededRng(1), async () => false);
    expect(code).toBe(newInviteCode(createSeededRng(1)));
  });

  it('tries again on a clash', async () => {
    const taken: string[] = [];
    const code = await pickInviteCode(createSeededRng(2), async (candidate) => {
      taken.push(candidate);
      return taken.length < 3;
    });
    expect(taken).toHaveLength(3);
    expect(code).toBe(taken[2]);
    expect(new Set(taken).size).toBe(3);
  });

  it(`gives up after ${MAX_CODE_TRIES} clashes`, async () => {
    let tries = 0;
    await expect(
      pickInviteCode(createSeededRng(3), async () => {
        tries += 1;
        return true;
      }),
    ).rejects.toThrow(/no free invite code/);
    expect(tries).toBe(MAX_CODE_TRIES);
  });
});

describe('pickInviteCodeNow', () => {
  it('picks the same codes as pickInviteCode, with a check that answers at once', async () => {
    const takenNow: string[] = [];
    const now = pickInviteCodeNow(createSeededRng(2), (candidate) => {
      takenNow.push(candidate);
      return takenNow.length < 3;
    });
    const takenLater: string[] = [];
    const later = await pickInviteCode(createSeededRng(2), async (candidate) => {
      takenLater.push(candidate);
      return takenLater.length < 3;
    });
    expect(now).toBe(later);
    expect(takenNow).toEqual(takenLater);
  });

  it(`gives up after ${MAX_CODE_TRIES} clashes, with the same error`, () => {
    let tries = 0;
    expect(() =>
      pickInviteCodeNow(createSeededRng(3), () => {
        tries += 1;
        return true;
      }),
    ).toThrow(`no free invite code after ${MAX_CODE_TRIES} tries`);
    expect(tries).toBe(MAX_CODE_TRIES);
  });
});

describe('newInvite', () => {
  it('is open, with no game, and expires 24 hours later', () => {
    expect(newInvite(OPTIONS, 'ABCD2345', NOW)).toEqual({
      ...OPTIONS,
      code: 'ABCD2345',
      status: 'open',
      expiresAt: NOW + INVITE_TIME_MS,
      gameId: null,
    });
    expect(inviteExpiresAt(NOW)).toBe(NOW + 86_400_000);
  });

  it('rejects a bad match length and an empty player id', () => {
    for (const targetPoints of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      rejects(() => newInvite({ ...OPTIONS, targetPoints }, 'ABCD2345', NOW), 'BAD_REQUEST');
    }
    rejects(() => newInvite({ ...OPTIONS, from: '' }, 'ABCD2345', NOW), 'BAD_REQUEST');
  });
});

describe('expiry', () => {
  it('the time is up at expiresAt, not before', () => {
    const open = invite();
    expect(isInviteExpired(open, open.expiresAt - 1)).toBe(false);
    expect(isInviteExpired(open, open.expiresAt)).toBe(true);
    expect(inviteStatus(open, open.expiresAt - 1)).toBe('open');
    expect(inviteStatus(open, open.expiresAt)).toBe('expired');
  });

  it('a closed invite keeps its status after the time', () => {
    for (const status of ['accepted', 'declined', 'cancelled', 'expired'] as const) {
      const closed = invite(status);
      expect(isInviteExpired(closed, closed.expiresAt + 1)).toBe(false);
      expect(inviteStatus(closed, closed.expiresAt + 1)).toBe(status);
    }
  });
});

describe('checkAnswer (accept and decline)', () => {
  it('lets another player answer an open invite in time', () => {
    expect(() => checkAnswer(invite(), 'bob', NOW)).not.toThrow();
    expect(() => checkAnswer(invite(), 'bob', NOW + INVITE_TIME_MS - 1)).not.toThrow();
  });

  it('rejects your own invite', () => {
    rejects(() => checkAnswer(invite(), 'alice', NOW), 'OWN_INVITE');
  });

  it('rejects an invite whose time is up, marked or not', () => {
    rejects(() => checkAnswer(invite(), 'bob', NOW + INVITE_TIME_MS), 'INVITE_EXPIRED');
    rejects(() => checkAnswer(invite('expired'), 'bob', NOW), 'INVITE_EXPIRED');
  });

  it('rejects a closed invite', () => {
    for (const status of ['accepted', 'declined', 'cancelled'] as const) {
      rejects(() => checkAnswer(invite(status), 'bob', NOW), 'INVITE_CLOSED');
    }
  });
});

describe('checkCancel', () => {
  it('lets only the inviter cancel an open invite in time', () => {
    expect(() => checkCancel(invite(), 'alice', NOW)).not.toThrow();
    rejects(() => checkCancel(invite(), 'bob', NOW), 'NOT_YOUR_INVITE');
  });

  it('rejects a closed or expired invite', () => {
    rejects(() => checkCancel(invite('accepted'), 'alice', NOW), 'INVITE_CLOSED');
    rejects(() => checkCancel(invite('cancelled'), 'alice', NOW), 'INVITE_CLOSED');
    rejects(() => checkCancel(invite(), 'alice', NOW + INVITE_TIME_MS), 'INVITE_EXPIRED');
  });
});

describe('toInviteView', () => {
  it('shows the invite fields, and expired once the time is up', () => {
    const open = invite();
    expect(toInviteView(open, NOW)).toEqual({
      code: 'ABCD2345',
      from: 'alice',
      choice: 'portes',
      targetPoints: 3,
      turnTimeMinutes: 1,
      status: 'open',
      expiresAt: NOW + INVITE_TIME_MS,
      gameId: null,
    });
    expect(toInviteView(open, open.expiresAt).status).toBe('expired');
    expect(toInviteView({ ...invite('accepted'), gameId: 'g1' }, NOW)).toMatchObject({
      status: 'accepted',
      gameId: 'g1',
    });
  });
});

describe('the cap on open invites (#275)', () => {
  it('is 10', () => {
    expect(MAX_OPEN_INVITES).toBe(10);
  });

  it('counts only open invites of the player whose time is not up', () => {
    const open = invite();
    const invites: InviteRecord[] = [
      open,
      open,
      invite('accepted'),
      invite('declined'),
      invite('cancelled'),
      invite('expired'),
      { ...open, from: 'bob' },
    ];
    expect(countOpenInvites(invites, 'alice', NOW)).toBe(2);
    expect(countOpenInvites(invites, 'bob', NOW)).toBe(1);
    expect(countOpenInvites(invites, 'carol', NOW)).toBe(0);
    // At expiresAt the time is up, also before the server marks the row.
    expect(countOpenInvites(invites, 'alice', open.expiresAt - 1)).toBe(2);
    expect(countOpenInvites(invites, 'alice', open.expiresAt)).toBe(0);
  });

  it('lets a player make an invite below the cap, and rejects one at the cap', () => {
    expect(() => checkInviteCap(0)).not.toThrow();
    expect(() => checkInviteCap(MAX_OPEN_INVITES - 1)).not.toThrow();
    rejects(() => checkInviteCap(MAX_OPEN_INVITES), 'TOO_MANY_INVITES');
    rejects(() => checkInviteCap(MAX_OPEN_INVITES + 1), 'TOO_MANY_INVITES');
  });
});
