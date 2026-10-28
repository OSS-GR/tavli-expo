import { INVITE_TIME_MS, type InviteView } from '@tavli/contracts';

import i18n from '@/i18n';

import { inviteClockOffset, inviteRowText, openInvites } from './myInvites';

const NOW = Date.UTC(2026, 9, 28, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

function invite(code: string, fields: Partial<InviteView> = {}): InviteView {
  return {
    code,
    from: 'guest-1',
    choice: 'portes',
    targetPoints: 3,
    pace: 'live',
    status: 'open',
    // Made an hour ago.
    expiresAt: NOW - HOUR + INVITE_TIME_MS,
    gameId: null,
    ...fields,
  };
}

describe('inviteClockOffset', () => {
  it('sets right a phone that runs behind the newest invite', () => {
    const made = invite('A', { expiresAt: NOW + 5000 + INVITE_TIME_MS });
    expect(inviteClockOffset([invite('B'), made], NOW)).toBe(5000);
  });

  it('keeps the phone clock otherwise', () => {
    expect(inviteClockOffset([invite('A')], NOW)).toBe(0);
    expect(inviteClockOffset([], NOW)).toBe(0);
  });
});

describe('openInvites', () => {
  it('keeps the open invites before their expiresAt, in order', () => {
    const soon = invite('A', { expiresAt: NOW + 1 });
    const later = invite('B');
    expect(openInvites([later, soon], NOW, 0)).toEqual([later, soon]);
  });

  it('hides an invite at its expiresAt, on the server clock', () => {
    const due = invite('A', { expiresAt: NOW });
    const ahead = invite('B', { expiresAt: NOW + 1000 });
    expect(openInvites([due, ahead], NOW, 0)).toEqual([ahead]);
    // The server clock is a second ahead of the phone.
    expect(openInvites([due, ahead], NOW, 1000)).toEqual([]);
  });

  it('hides an invite that is no longer open', () => {
    expect(openInvites([invite('A', { status: 'accepted', gameId: 'g' })], NOW, 0)).toEqual([]);
  });
});

describe('inviteRowText', () => {
  it('shows the game, the length, the pace, the time left and the code', () => {
    const text = inviteRowText(invite('ABCD2345'), i18n.t, NOW, 0);
    expect(text).toEqual({
      title: 'Portes · first to 3 points',
      line: 'Live · 23 h left',
      code: 'Code ABCD2345',
      label: 'Invite, Portes, first to 3 points, Live, 23 h left',
    });
  });

  it('counts minutes in the last hour, and one point', () => {
    const last = invite('A', { expiresAt: NOW + 40 * 60 * 1000, targetPoints: 1, pace: 'async' });
    const text = inviteRowText(last, i18n.t, NOW, 0);
    expect(text.title).toBe('Portes · first to 1 point');
    expect(text.line).toBe('Async · 40 min left');
  });

  it('uses the clock offset', () => {
    expect(inviteRowText(invite('A'), i18n.t, NOW, 2 * HOUR).line).toBe('Live · 21 h left');
  });

  it('shows Greek', async () => {
    await i18n.changeLanguage('el');
    try {
      const text = inviteRowText(invite('ABCD2345', { choice: 'plakoto' }), i18n.t, NOW, 0);
      expect(text).toEqual({
        title: 'Πλακωτό · έως 3 βαθμούς',
        line: 'Ζωντανά · Λήγει σε 23 ώρες',
        code: 'Κωδικός ABCD2345',
        label: 'Πρόσκληση, Πλακωτό, έως 3 βαθμούς, Ζωντανά, Λήγει σε 23 ώρες',
      });
    } finally {
      await i18n.changeLanguage('en');
    }
  });
});
