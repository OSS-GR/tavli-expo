import type { AuthProvider } from '@tavli/contracts';

import { cachedFor, rememberFor } from './shownCache';

/** An auth with only `currentUser`, which is all the cache reads. */
function as(id: string | null): AuthProvider {
  return {
    currentUser: () => (id === null ? null : { id, isGuest: false }),
  } as unknown as AuthProvider;
}

describe('shownCache (#672)', () => {
  it('gives back what a screen showed, to the same user only', () => {
    rememberFor(as('ann'), 'friends', ['bob']);
    expect(cachedFor(as('ann'), 'friends')).toEqual(['bob']);
    // Another account, or no session: nothing, not even for one frame.
    expect(cachedFor(as('carl'), 'friends')).toBeUndefined();
    expect(cachedFor(as(null), 'friends')).toBeUndefined();
    expect(cachedFor(undefined, 'friends')).toBeUndefined();
  });

  it('keeps nothing with no signed-in user', () => {
    rememberFor(as(null), 'friends', ['bob']);
    expect(cachedFor(as('ann'), 'friends')).toBeUndefined();
  });
});
