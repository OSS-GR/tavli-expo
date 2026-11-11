/**
 * The last setup of a friend invite (#488): saved on the phone, read back,
 * and bad data gives `null`.
 */
import { createMemoryStorage } from '@tavli/contracts';

import {
  FRIEND_INVITE_SETUP_KEY,
  loadFriendInviteSetup,
  saveFriendInviteSetup,
} from './friendInviteSetup';

describe('friendInviteSetup', () => {
  it('reads back what it saved', () => {
    const storage = createMemoryStorage();
    expect(loadFriendInviteSetup(storage)).toBeNull();
    saveFriendInviteSetup({ choice: 'tavli', targetPoints: 7, turnTimeMinutes: 5 }, storage);
    expect(loadFriendInviteSetup(storage)).toEqual({
      choice: 'tavli',
      targetPoints: 7,
      turnTimeMinutes: 5,
    });
    saveFriendInviteSetup({ choice: 'portes', targetPoints: 1, turnTimeMinutes: null }, storage);
    expect(loadFriendInviteSetup(storage)).toEqual({
      choice: 'portes',
      targetPoints: 1,
      turnTimeMinutes: null,
    });
  });

  it('saves only the setup: no other field', () => {
    const storage = createMemoryStorage();
    const game = { choice: 'fevga', targetPoints: 3, turnTimeMinutes: null, to: 'ann' } as const;
    saveFriendInviteSetup(game, storage);
    expect(JSON.parse(storage.getString(FRIEND_INVITE_SETUP_KEY)!)).toEqual({
      choice: 'fevga',
      targetPoints: 3,
      turnTimeMinutes: null,
    });
  });

  it.each([
    ['not JSON', '{'],
    ['not an object', '3'],
    ['an unknown game', '{"choice":"chess","targetPoints":1,"turnTimeMinutes":null}'],
    [
      'a length the screen has no button for',
      '{"choice":"portes","targetPoints":2,"turnTimeMinutes":null}',
    ],
    [
      'a timer the screen has no button for',
      '{"choice":"portes","targetPoints":1,"turnTimeMinutes":3}',
    ],
    ['a missing timer', '{"choice":"portes","targetPoints":1}'],
  ])('gives null for %s', (_, text) => {
    const storage = createMemoryStorage({ [FRIEND_INVITE_SETUP_KEY]: text });
    expect(loadFriendInviteSetup(storage)).toBeNull();
  });

  it('gives null when storage throws', () => {
    const storage = {
      getString: () => {
        throw new Error('broken');
      },
      setString: () => {
        throw new Error('broken');
      },
      remove: () => {},
    };
    expect(loadFriendInviteSetup(storage)).toBeNull();
    expect(() =>
      saveFriendInviteSetup({ choice: 'portes', targetPoints: 1, turnTimeMinutes: null }, storage),
    ).not.toThrow();
  });
});
