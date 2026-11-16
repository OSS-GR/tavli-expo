import type { AuthProvider, Friends, FriendRequests, MyRating, Ratings } from '@tavli/contracts';

import { applyTileNews, loadTileNews, NO_SHOWN_NEWS } from './useTileNews';

function authAs(user: { id: string; isGuest: boolean } | null): AuthProvider {
  return { loadSession: jest.fn(async () => user) } as unknown as AuthProvider;
}

function ratingsWith(mine: () => Promise<MyRating>): Ratings {
  return { mine: jest.fn(mine) } as unknown as Ratings;
}

function friendsWith(requests: () => Promise<FriendRequests>): Friends {
  return { listRequests: jest.fn(requests) } as unknown as Friends;
}

const rated: MyRating = { rating: 1532, matches: 4, experience: 12, shown: true, listed: false };
const request = {
  playerId: 'p2',
  name: null,
  sentAt: 0,
} as unknown as FriendRequests['incoming'][number];

describe('loadTileNews (#517)', () => {
  it('gives the rating and the friend requests to a saved account', async () => {
    const ratings = ratingsWith(async () => rated);
    const friends = friendsWith(async () => ({
      incoming: [request, request],
      outgoing: [request],
    }));
    await expect(
      loadTileNews(authAs({ id: 'p1', isGuest: false }), ratings, friends),
    ).resolves.toEqual({ user: 'p1', update: { rating: 1532, friendRequests: 2 } });
  });

  it('gives null before the first rated match', async () => {
    const ratings = ratingsWith(async () => ({ ...rated, rating: 1500, matches: 0 }));
    const news = await loadTileNews(authAs({ id: 'p1', isGuest: false }), ratings, undefined);
    expect(news).toEqual({ user: 'p1', update: { rating: null } });
  });

  it('asks nothing for a guest or with nobody signed in', async () => {
    const ratings = ratingsWith(async () => rated);
    const friends = friendsWith(async () => ({ incoming: [request], outgoing: [] }));
    for (const user of [{ id: 'g1', isGuest: true }, null]) {
      await expect(loadTileNews(authAs(user), ratings, friends)).resolves.toEqual({
        user: null,
        update: {},
      });
    }
    expect(ratings.mine).not.toHaveBeenCalled();
    expect(friends.listRequests).not.toHaveBeenCalled();
  });

  it('leaves out a part that fails, and keeps the other', async () => {
    const ratings = ratingsWith(async () => {
      throw new Error('offline');
    });
    const friends = friendsWith(async () => ({ incoming: [request], outgoing: [] }));
    await expect(
      loadTileNews(authAs({ id: 'p1', isGuest: false }), ratings, friends),
    ).resolves.toEqual({ user: 'p1', update: { friendRequests: 1 } });
  });
});

describe('applyTileNews (#517)', () => {
  const shown = { user: 'p1', news: { rating: 1532, friendRequests: 2 } };

  it('keeps the rating when only the friend requests loaded', () => {
    expect(applyTileNews(shown, { user: 'p1', update: { friendRequests: 3 } }).news).toEqual({
      rating: 1532,
      friendRequests: 3,
    });
  });

  it('keeps the request count when only the rating loaded', () => {
    expect(applyTileNews(shown, { user: 'p1', update: { rating: 1540 } }).news).toEqual({
      rating: 1540,
      friendRequests: 2,
    });
  });

  it('keeps everything when both parts failed', () => {
    expect(applyTileNews(shown, { user: 'p1', update: {} })).toEqual(shown);
  });

  it("never keeps the last user's news for another user", () => {
    expect(applyTileNews(shown, { user: 'p2', update: { friendRequests: 1 } })).toEqual({
      user: 'p2',
      news: { friendRequests: 1 },
    });
  });

  it('forgets everything with no saved account', () => {
    expect(applyTileNews(shown, { user: null, update: {} })).toEqual(NO_SHOWN_NEWS);
  });
});
