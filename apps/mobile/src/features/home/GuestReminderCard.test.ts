import type { GameSummary } from '@tavli/contracts';

import { MAX_LISTED_GAMES } from '@tavli/contracts';

import { listMayBeCut, onlineWins } from './GuestReminderCard';

function game(winner: GameSummary['winner'], status: GameSummary['status'] = 'finished') {
  return { status, mySide: 'white', winner } as GameSummary;
}

describe('onlineWins (#463)', () => {
  it('counts the finished matches the caller won', () => {
    expect(onlineWins([])).toBe(0);
    expect(onlineWins([game('white'), game('black'), game('white'), game(null, 'active')])).toBe(2);
  });

  it('counts the side the caller played, not White', () => {
    expect(onlineWins([{ ...game('black'), mySide: 'black' }])).toBe(1);
  });
});

describe('listMayBeCut (#463)', () => {
  it('is true only for a full list', () => {
    expect(listMayBeCut(Array.from({ length: MAX_LISTED_GAMES - 1 }, () => game('white')))).toBe(
      false,
    );
    expect(listMayBeCut(Array.from({ length: MAX_LISTED_GAMES }, () => game('white')))).toBe(true);
  });
});
