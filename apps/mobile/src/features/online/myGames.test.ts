import { ASYNC_TURN_TIME_MS, type GameSummary } from '@tavli/contracts';

import i18n from '@/i18n';

import { clockOffset, gameRowText, listTickMs, yourTurnFirst } from './myGames';

const NOW = Date.UTC(2026, 9, 28, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

function summary(gameId: string, fields: Partial<GameSummary> = {}): GameSummary {
  return {
    gameId,
    status: 'active',
    choice: 'portes',
    presetId: 'portes',
    variant: 'portes',
    targetPoints: 5,
    turnTimeMinutes: null,
    mySide: 'white',
    waitingFor: 'white',
    myTurn: true,
    score: { white: 3, black: 1 },
    winner: null,
    updatedAt: NOW - HOUR,
    turnDeadline: NOW - HOUR + ASYNC_TURN_TIME_MS,
    ...fields,
  };
}

const waiting: Partial<GameSummary> = { waitingFor: 'black', myTurn: false };

describe('yourTurnFirst', () => {
  it('puts your turn first, and keeps the server order (newest first) in each part', () => {
    const list = [summary('a', waiting), summary('b'), summary('c', waiting), summary('d')];
    expect(yourTurnFirst(list).map((game) => game.gameId)).toEqual(['b', 'd', 'a', 'c']);
    expect(yourTurnFirst([])).toEqual([]);
  });
});

describe('clockOffset', () => {
  it('sets right a phone that runs behind the newest change', () => {
    expect(clockOffset([summary('a', { updatedAt: NOW + 5000 })], NOW)).toBe(5000);
  });

  it('keeps the phone clock otherwise', () => {
    expect(clockOffset([summary('a', { updatedAt: NOW - HOUR })], NOW)).toBe(0);
    expect(clockOffset([], NOW)).toBe(0);
  });
});

describe('listTickMs', () => {
  it('ticks as often as the fastest game with a turn timer needs', () => {
    expect(listTickMs([summary('a')])).toBe(30_000);
    expect(listTickMs([summary('a'), summary('b', { turnTimeMinutes: 1 })])).toBe(1000);
    expect(listTickMs([summary('a', { turnTimeMinutes: 1, turnDeadline: null })])).toBeNull();
    expect(listTickMs([])).toBeNull();
  });
});

describe('gameRowText', () => {
  const en = i18n.getFixedT('en');
  const el = i18n.getFixedT('el');

  it('says the game, whose turn, your points first and the time left', () => {
    expect(gameRowText(summary('a'), en, NOW, 0)).toEqual({
      title: 'Portes vs friend',
      turn: 'Your turn',
      score: '3–1',
      time: '23 h left',
      label: 'Portes vs friend, Your turn, 3 to 1, 23 h left',
    });
  });

  it('counts your side: as Black your points come first too', () => {
    const black = summary('a', { mySide: 'black', ...waiting, choice: 'tavli' });
    expect(gameRowText(black, en, NOW, 0)).toMatchObject({
      title: 'Tavli vs friend',
      turn: 'Waiting for your friend',
      score: '1–3',
      label: 'Tavli vs friend, Waiting for your friend, 1 to 3, 23 h left',
    });
  });

  it('counts seconds in a live game, with the clock offset', () => {
    const live = summary('a', { turnTimeMinutes: 1, turnDeadline: NOW + 42_000 });
    expect(gameRowText(live, en, NOW, 0).time).toBe('42 s left');
    expect(gameRowText(live, en, NOW, 2000).time).toBe('40 s left');
  });

  it('has no time with no turn timer', () => {
    const text = gameRowText(summary('a', { turnDeadline: null }), en, NOW, 0);
    expect(text.time).toBeNull();
    expect(text.label).toBe('Portes vs friend, Your turn, 3 to 1');
  });

  it('speaks Greek', () => {
    expect(gameRowText(summary('a', { choice: 'plakoto' }), el, NOW, 0)).toEqual({
      title: 'Πλακωτό με φίλο',
      turn: 'Σειρά σου',
      score: '3–1',
      time: 'Χρόνος: 23 ώρες',
      label: 'Πλακωτό με φίλο, Σειρά σου, 3 προς 1, Χρόνος: 23 ώρες',
    });
    expect(gameRowText(summary('a', waiting), el, NOW, 0).turn).toBe('Περιμένουμε τον φίλο σου');
  });
});
