import type { GameSummary, InviteView } from '@tavli/contracts';

import { heroGameId, pickHero, type HeroInputs } from './heroPick';

const NOW = Date.UTC(2026, 10, 15, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

function game(gameId: string, fields: Partial<GameSummary> = {}): GameSummary {
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
    score: { white: 0, black: 0 },
    winner: null,
    updatedAt: NOW - HOUR,
    turnDeadline: NOW + 10 * HOUR,
    opponentId: 'friend',
    opponentName: null,
    ...fields,
  };
}

const waiting: Partial<GameSummary> = { waitingFor: 'black', myTurn: false };

function invite(code: string, expiresAt: number): InviteView {
  return {
    code,
    from: 'friend',
    fromName: null,
    choice: 'portes',
    targetPoints: 5,
    turnTimeMinutes: null,
    status: 'open',
    expiresAt,
    gameId: null,
  };
}

const nothing: HeroInputs = { games: [], friendInvites: [], hasSave: false, rankedRegular: false };

describe('pickHero', () => {
  it('offers Play vs bot with nothing else', () => {
    expect(pickHero(nothing)).toEqual({ kind: 'bot' });
  });

  it('offers Play ranked to a ranked regular, but a saved game comes first', () => {
    expect(pickHero({ ...nothing, rankedRegular: true })).toEqual({ kind: 'ranked' });
    expect(pickHero({ ...nothing, rankedRegular: true, hasSave: true })).toEqual({
      kind: 'saved',
    });
  });

  it('puts a waiting online game before the saved game', () => {
    const pick = pickHero({ ...nothing, hasSave: true, games: [game('a', waiting)] });
    expect(pick).toMatchObject({ kind: 'waiting', game: { gameId: 'a' } });
  });

  it('takes the first waiting game in the server order', () => {
    const pick = pickHero({ ...nothing, games: [game('a', waiting), game('b', waiting)] });
    expect(heroGameId(pick)).toBe('a');
  });

  it('puts a friend invite before a waiting game, the one that ends first', () => {
    const pick = pickHero({
      ...nothing,
      games: [game('a', waiting)],
      friendInvites: [invite('LATE', NOW + 2 * HOUR), invite('SOON', NOW + HOUR)],
    });
    expect(pick).toMatchObject({ kind: 'invite', invite: { code: 'SOON' } });
    expect(heroGameId(pick)).toBeNull();
  });

  it('puts your turn before everything, the one with the least time left', () => {
    const pick = pickHero({
      games: [
        game('a', waiting),
        game('late', { turnDeadline: NOW + 5 * HOUR }),
        game('soon', { turnDeadline: NOW + HOUR }),
      ],
      friendInvites: [invite('SOON', NOW + HOUR)],
      hasSave: true,
      rankedRegular: true,
    });
    expect(pick.kind).toBe('turn');
    expect(heroGameId(pick)).toBe('soon');
  });

  it('puts a turn with no deadline after one with a deadline, and keeps the order on a tie', () => {
    const pick = pickHero({
      ...nothing,
      games: [game('none', { turnDeadline: null }), game('timed')],
    });
    expect(heroGameId(pick)).toBe('timed');
    const tie = pickHero({ ...nothing, games: [game('first'), game('second')] });
    expect(heroGameId(tie)).toBe('first');
  });
});
