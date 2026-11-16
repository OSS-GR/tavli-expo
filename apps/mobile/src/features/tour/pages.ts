/**
 * The pages of the app tour (#573), in order. Pure: no React.
 *
 * The friend page needs online play (a build with a Convex URL); the
 * account page needs at least one of Play ranked, Friends and
 * Leaderboards. A page never talks about a mode this build does not have.
 */
export type TourPageId =
  'welcome' | 'roll' | 'move' | 'home' | 'local' | 'friend' | 'account' | 'help';

/** What this build offers. */
export interface TourOffers {
  /** Play a friend and Join with a code. */
  readonly friend: boolean;
  readonly ranked: boolean;
  readonly friends: boolean;
  readonly ratings: boolean;
}

export function tourPages(offers: TourOffers): readonly TourPageId[] {
  const account = offers.ranked || offers.friends || offers.ratings;
  return [
    'welcome',
    'roll',
    'move',
    'home',
    'local',
    ...(offers.friend ? (['friend'] as const) : []),
    ...(account ? (['account'] as const) : []),
    'help',
  ];
}

/** The pages where the player tries something: Next waits for the steps, not the clock. */
export function isTryPage(page: TourPageId): boolean {
  return page === 'roll' || page === 'move';
}
