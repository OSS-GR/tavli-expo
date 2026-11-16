import { isTryPage, tourPages } from './pages';

const NONE = { friend: false, ranked: false, friends: false, ratings: false };

describe('tour pages (#573)', () => {
  it('has every page in a build with online play', () => {
    expect(tourPages({ friend: true, ranked: true, friends: true, ratings: true })).toEqual([
      'welcome',
      'roll',
      'move',
      'home',
      'local',
      'friend',
      'account',
      'help',
    ]);
  });

  it('never talks about online play in a build without it', () => {
    expect(tourPages(NONE)).toEqual(['welcome', 'roll', 'move', 'home', 'local', 'help']);
  });

  it('shows the account page with any one of its modes', () => {
    expect(tourPages({ ...NONE, ratings: true })).toContain('account');
    expect(tourPages({ ...NONE, friend: true })).not.toContain('account');
  });

  it('knows the try-it pages', () => {
    expect(tourPages(NONE).filter(isTryPage)).toEqual(['roll', 'move']);
  });
});
