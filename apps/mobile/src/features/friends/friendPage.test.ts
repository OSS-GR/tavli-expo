import type { GameSummary, InviteView } from '@tavli/contracts';
import { ASYNC_TURN_TIME_MS } from '@tavli/contracts';

import i18n from '@/i18n';

import {
  activeGameText,
  gamesWith,
  inviteText,
  invitesFrom,
  lastMatchAt,
  rematchSetup,
} from './friendPage';

const NOW = Date.UTC(2026, 10, 19, 12, 0, 0);
const HOUR = 60 * 60 * 1000;
const t = i18n.t.bind(i18n);

function summary(gameId: string, fields: Partial<GameSummary> = {}): GameSummary {
  return {
    gameId,
    status: 'active',
    choice: 'portes',
    presetId: 'portes',
    variant: 'portes',
    targetPoints: 5,
    turnTimeMinutes: null,
    ranked: false,
    mySide: 'white',
    waitingFor: 'white',
    myTurn: true,
    score: { white: 2, black: 1 },
    winner: null,
    updatedAt: NOW - HOUR,
    turnDeadline: NOW - HOUR + ASYNC_TURN_TIME_MS,
    opponentId: 'ann',
    opponentName: null,
    ...fields,
  };
}

function invite(code: string, fields: Partial<InviteView> = {}): InviteView {
  return {
    code,
    from: 'ann',
    fromName: null,
    choice: 'fevga',
    targetPoints: 3,
    turnTimeMinutes: null,
    status: 'open',
    expiresAt: NOW + 20 * HOUR,
    gameId: null,
    ...fields,
  } as InviteView;
}

describe('friend page parts (#644)', () => {
  it('keeps only the games and open invites of this friend', () => {
    const games = [summary('a'), summary('b', { opponentId: 'bob' }), summary('c')];
    expect(gamesWith(games, 'ann').map((g) => g.gameId)).toEqual(['a', 'c']);
    const invites = [invite('X'), invite('Y', { from: 'bob' }), invite('Z', { status: 'expired' })];
    expect(invitesFrom(invites, 'ann').map((i) => i.code)).toEqual(['X']);
  });

  it('a rematch takes the newest finished friend match, never a ranked one', () => {
    expect(rematchSetup([])).toBeNull();
    const old = summary('old', { choice: 'plakoto', targetPoints: 3, updatedAt: NOW - 9 * HOUR });
    const ranked = summary('ranked', { ranked: true, turnTimeMinutes: 2, updatedAt: NOW });
    const newest = summary('new', {
      choice: 'tavli',
      targetPoints: 5,
      turnTimeMinutes: 60,
      updatedAt: NOW - HOUR,
    });
    expect(rematchSetup([old, ranked, newest])).toEqual({
      choice: 'tavli',
      targetPoints: 5,
      turnTimeMinutes: 60,
    });
    expect(rematchSetup([ranked])).toBeNull();
    expect(lastMatchAt([old, newest])).toBe(NOW - HOUR);
    expect(lastMatchAt([])).toBeNull();
  });

  it('a game row says whose turn, the game, the score and the time left', () => {
    expect(activeGameText(summary('a'), t, NOW, 0)).toEqual({
      title: 'Your turn',
      line: 'Portes · first to 5 points · 2–1 · 23 h left',
      label: 'Your turn, Portes · first to 5 points, 2 to 1, 23 h left',
      yours: true,
    });
    const theirs = summary('b', { myTurn: false, waitingFor: 'black' });
    expect(activeGameText(theirs, t, NOW, 0)).toMatchObject({
      title: 'Waiting for your friend',
      yours: false,
    });
  });

  it('an invite row says it is for you and when it ends', () => {
    expect(inviteText(invite('X'), t, NOW)).toMatchObject({
      title: 'Invite for you',
      line: 'Fevga · first to 3 points · 20 h left',
      yours: true,
    });
    expect(inviteText(invite('X', { expiresAt: NOW }), t, NOW).line).toBe(
      'Fevga · first to 3 points · Expiring now',
    );
  });
});
