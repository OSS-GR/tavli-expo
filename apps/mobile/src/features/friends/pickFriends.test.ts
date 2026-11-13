/** The friends Play a friend shows (#488): most played first, then the newest. */
import type { Friend } from '@tavli/contracts';

import { FRIENDS_SHOWN, pickFriends } from './pickFriends';

const friend = (playerId: string, wins: number, losses: number, since: number): Friend => ({
  playerId,
  name: null,
  since,
  record: { wins, losses },
});

describe('pickFriends', () => {
  it('puts the friends played most first, then the newest friend', () => {
    const list = [
      friend('old', 0, 0, 1),
      friend('many', 4, 3, 2),
      friend('new', 0, 0, 9),
      friend('some', 1, 0, 3),
    ];
    expect(pickFriends(list, 4).map((f) => f.playerId)).toEqual(['many', 'some', 'new', 'old']);
    // The list it was given stays as it was.
    expect(list[0]!.playerId).toBe('old');
  });

  it(`shows at most ${FRIENDS_SHOWN}`, () => {
    const list = Array.from({ length: 8 }, (_, i) => friend(`p${i}`, i, 0, i));
    const shown = pickFriends(list);
    expect(shown).toHaveLength(FRIENDS_SHOWN);
    expect(shown[0]!.playerId).toBe('p7');
    expect(pickFriends([])).toEqual([]);
  });
});
