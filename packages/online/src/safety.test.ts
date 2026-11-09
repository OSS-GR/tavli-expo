import { describe, expect, it } from 'vitest';

import {
  MAX_BLOCKS,
  MAX_REPORTS_PER_DAY,
  REPORT_REASONS,
  REPORT_WINDOW_MS,
  guestName,
  usernameName,
} from '@tavli/contracts';
import type { InviteView } from '@tavli/contracts';

import { SERVER_ACTOR } from './calls';
import { checkNotBlocked, inviteSeenBy } from './invites';
import {
  SafetyError,
  checkBlockCap,
  checkMet,
  checkReason,
  checkReportCap,
  checkTarget,
  namesSeenBy,
  reportWindowStart,
} from './safety';

function codeOf(step: () => unknown): string | null {
  try {
    step();
    return null;
  } catch (error) {
    if (error instanceof SafetyError) return error.code;
    if (error instanceof Error && 'code' in error) return String(error.code);
    throw error;
  }
}

describe('checkTarget', () => {
  it('refuses an empty id, the server id and the caller', () => {
    expect(codeOf(() => checkTarget('alice', ''))).toBe('BAD_REQUEST');
    expect(codeOf(() => checkTarget('alice', '  '))).toBe('BAD_REQUEST');
    expect(codeOf(() => checkTarget('alice', SERVER_ACTOR))).toBe('BAD_REQUEST');
    expect(codeOf(() => checkTarget('alice', 'alice'))).toBe('BAD_REQUEST');
    expect(codeOf(() => checkTarget('alice', 'bob'))).toBeNull();
  });
});

describe('checkMet', () => {
  it('needs the two players to have met', () => {
    expect(codeOf(() => checkMet(false))).toBe('UNKNOWN_PLAYER');
    expect(codeOf(() => checkMet(true))).toBeNull();
  });
});

describe('caps', () => {
  it('allows blocks below MAX_BLOCKS', () => {
    expect(codeOf(() => checkBlockCap(MAX_BLOCKS - 1))).toBeNull();
    expect(codeOf(() => checkBlockCap(MAX_BLOCKS))).toBe('TOO_MANY_BLOCKS');
  });

  it('allows reports below the daily cap', () => {
    expect(codeOf(() => checkReportCap(MAX_REPORTS_PER_DAY - 1))).toBeNull();
    expect(codeOf(() => checkReportCap(MAX_REPORTS_PER_DAY))).toBe('TOO_MANY_REPORTS');
  });

  it('counts reports over the last 24 hours', () => {
    expect(reportWindowStart(REPORT_WINDOW_MS + 5)).toBe(5);
  });
});

describe('checkReason', () => {
  it('takes only the listed reasons', () => {
    for (const reason of REPORT_REASONS) expect(checkReason(reason)).toBe(reason);
    expect(codeOf(() => checkReason('rude'))).toBe('BAD_REQUEST');
    expect(codeOf(() => checkReason(undefined))).toBe('BAD_REQUEST');
  });
});

describe('checkNotBlocked', () => {
  it('tells the blocker, and hides the block from the blocked player', () => {
    expect(codeOf(() => checkNotBlocked({ byCaller: true, byInviter: false }))).toBe('BLOCKED');
    expect(codeOf(() => checkNotBlocked({ byCaller: true, byInviter: true }))).toBe('BLOCKED');
    expect(codeOf(() => checkNotBlocked({ byCaller: false, byInviter: true }))).toBe(
      'INVITE_EXPIRED',
    );
    expect(codeOf(() => checkNotBlocked({ byCaller: false, byInviter: false }))).toBeNull();
  });
});

describe('inviteSeenBy', () => {
  const view: InviteView = {
    code: 'ABCDEFGH',
    from: 'alice',
    fromName: null,
    choice: 'portes',
    targetPoints: 3,
    turnTimeMinutes: null,
    status: 'open',
    expiresAt: 1000,
    gameId: null,
  };

  it('shows an open invite as expired to a player the inviter blocks', () => {
    expect(inviteSeenBy(view, true).status).toBe('expired');
    expect(inviteSeenBy(view, false)).toBe(view);
  });

  it('leaves a closed invite as it is', () => {
    const accepted = { ...view, status: 'accepted', gameId: 'g1' } as const;
    expect(inviteSeenBy(accepted, true)).toBe(accepted);
  });
});

describe('namesSeenBy', () => {
  it('hides the sides the viewer blocks', () => {
    const names = { white: usernameName('Alex'), black: guestName('4821') };
    const players = { white: 'alice', black: 'bob' };
    expect(namesSeenBy(names, players, (id) => id === 'bob')).toEqual({
      white: usernameName('Alex'),
      black: null,
    });
    expect(namesSeenBy(names, players, () => false)).toEqual(names);
  });
});
