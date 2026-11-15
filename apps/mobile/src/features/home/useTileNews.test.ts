import type { AuthProvider, Friends, FriendRequests, MyRating, Ratings } from '@tavli/contracts';

import { loadTileNews, NO_TILE_NEWS } from './useTileNews';

function authAs(user: { id: string; isGuest: boolean } | null): AuthProvider {
  return { ready: jest.fn(async () => user) } as unknown as AuthProvider;
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
    ).resolves.toEqual({ rating: 1532, friendRequests: 2 });
  });

  it('gives null before the first rated match', async () => {
    const ratings = ratingsWith(async () => ({ ...rated, rating: 1500, matches: 0 }));
    const news = await loadTileNews(authAs({ id: 'p1', isGuest: false }), ratings, undefined);
    expect(news).toEqual({ rating: null, friendRequests: 0 });
  });

  it('asks nothing for a guest or with nobody signed in', async () => {
    const ratings = ratingsWith(async () => rated);
    const friends = friendsWith(async () => ({ incoming: [request], outgoing: [] }));
    for (const user of [{ id: 'g1', isGuest: true }, null]) {
      await expect(loadTileNews(authAs(user), ratings, friends)).resolves.toEqual(NO_TILE_NEWS);
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
    ).resolves.toEqual({ friendRequests: 1 });
  });
});
