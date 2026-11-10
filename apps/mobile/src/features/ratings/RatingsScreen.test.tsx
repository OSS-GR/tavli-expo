/**
 * Leaderboards (#407), on the Jest online fake: the guest gate, your card,
 * the friends board, the global board and "Show me on the global board".
 */
import {
  MIN_BOARD_MATCHES,
  RATED_MATCHES_PER_PAIR_PER_DAY,
  START_RATING,
  TERMS_VERSION,
  type Ratings,
} from '@tavli/contracts';
import { act, render, screen } from '@testing-library/react-native';

import { auth } from '@/services';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { onlineFake } from '../../../test/onlineFake';

import { boardStatus, RatingsScreen } from './RatingsScreen';

runOnFakeTimers();

const ME = 'me';

/** Lets the server answer (it answers on later microtasks). */
async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}

/** Signs me in with a saved account. */
function signInSaved(): void {
  onlineFake.authStore.session = { id: ME, isGuest: false };
  onlineFake.server().markSaved(ME);
}

/** `winner` beats `loser` in a rated 3-point match (both saved). */
async function win(winner: string, loser: string): Promise<void> {
  const server = onlineFake.server();
  server.markSaved(winner);
  server.markSaved(loser);
  const gameId = server.createGame(winner, { white: winner, black: loser }, 'portes', 3, null);
  await server.transportFor(loser).resign(gameId);
}

/** I win `MIN_BOARD_MATCHES` rated matches against a few players. */
async function enoughMatches(): Promise<void> {
  for (let i = 0; i < MIN_BOARD_MATCHES; i += 1) {
    await win(ME, `p${Math.floor(i / RATED_MATCHES_PER_PAIR_PER_DAY)}`);
  }
}

async function setUsername(id: string, name: string): Promise<void> {
  await onlineFake
    .server()
    .usernamesFor(id, true)
    .setMine({ name, acceptTerms: TERMS_VERSION, ageChecked: true });
}

async function show(ratings: Ratings = onlineFake.ratings) {
  const props = { onBack: jest.fn(), onAccount: jest.fn(), onUsername: jest.fn() };
  await render(<RatingsScreen auth={auth!} ratings={ratings} {...props} />);
  await flush();
  return props;
}

describe('<RatingsScreen />', () => {
  it('a guest reads that ratings need a saved account, with the benefits and Account', async () => {
    onlineFake.authStore.session = { id: ME, isGuest: true };
    const props = await show();
    expect(screen.getByTestId('ratings-guest')).toHaveTextContent(
      'Ratings need a saved account. Save your guest account first: your games stay.',
    );
    expect(screen.getByTestId('ratings-benefits-ratings')).toBeOnTheScreen();
    await setupUser().press(screen.getByRole('button', { name: 'Save my account' }));
    expect(props.onAccount).toHaveBeenCalled();
  });

  it('with nobody signed in, says so and makes no account', async () => {
    await show();
    expect(screen.getByTestId('ratings-signed-out')).toBeOnTheScreen();
    expect(auth!.currentUser()).toBeNull();
  });

  it('a new player sees the start rating, the matches left, and only themselves', async () => {
    signInSaved();
    await show();
    expect(screen.getByTestId('ratings-mine-rating')).toHaveTextContent(String(START_RATING));
    expect(screen.getByLabelText(`Your rating: ${START_RATING}, from 0 rated matches.`));
    expect(screen.getByTestId('ratings-status-fewMatches')).toHaveTextContent(
      `Play ${MIN_BOARD_MATCHES} more rated matches to show on the global board.`,
    );
    // No game yet, so no guest name either.
    expect(screen.getByLabelText('Place 1: Player (you), rating 1500')).toBeOnTheScreen();
  });

  it('shows rated friends best first, and my place among them', async () => {
    signInSaved();
    await win('ann', ME);
    // Ann and I become friends.
    const server = onlineFake.server();
    await server.friendsFor('ann').sendRequest(ME);
    await server.friendsFor(ME).acceptRequest('ann');
    // Bob beats me too, but he is no friend.
    await win('bob', ME);
    await show();
    const ann = screen.getByTestId('ratings-friends-row-ann');
    const me = screen.getByTestId(`ratings-friends-row-${ME}`);
    expect(ann.props.accessibilityLabel).toMatch(/^Place 1: Guest \d{4}, rating 15\d\d$/);
    expect(me.props.accessibilityLabel).toMatch(/^Place 2: Guest \d{4} \(you\), rating 14\d\d$/);
    expect(screen.queryByTestId('ratings-friends-row-bob')).toBeNull();
  });

  it('asks for a username when it is the only thing missing for the global board', async () => {
    signInSaved();
    await enoughMatches();
    const props = await show();
    expect(screen.getByTestId('ratings-status-noUsername')).toBeOnTheScreen();
    await setupUser().press(screen.getByRole('button', { name: 'Pick a username' }));
    expect(props.onUsername).toHaveBeenCalled();
  });

  it('lists me on Everyone with a username, and the switch takes me off and back', async () => {
    signInSaved();
    await enoughMatches();
    await setUsername(ME, 'Orestis');
    await show();
    expect(screen.getByTestId('ratings-status-listed')).toBeOnTheScreen();
    const user = setupUser();
    await user.press(screen.getByRole('radio', { name: 'Everyone' }));
    expect(screen.getByTestId(`ratings-everyone-row-${ME}`)).toHaveTextContent(/Orestis \(you\)/);

    const toggle = screen.getByRole('switch', { name: 'Show me on the global board' });
    await user.press(toggle);
    await flush();
    expect(screen.getByTestId('ratings-everyone-empty')).toBeOnTheScreen();
    expect(screen.getByTestId('ratings-status-hidden')).toBeOnTheScreen();
    expect((await onlineFake.ratings.mine()).shown).toBe(false);

    await user.press(screen.getByRole('switch', { name: 'Show me on the global board' }));
    await flush();
    expect(screen.getByTestId(`ratings-everyone-row-${ME}`)).toBeOnTheScreen();
  });

  it('a failed switch opens the problem popup and keeps the board', async () => {
    signInSaved();
    const failing: Ratings = {
      ...onlineFake.ratings,
      setShown: () => Promise.reject(new Error('offline')),
    };
    await show(failing);
    const user = setupUser();
    await user.press(screen.getByRole('radio', { name: 'Everyone' }));
    await user.press(screen.getByRole('switch', { name: 'Show me on the global board' }));
    await flush();
    expect(await screen.findByText('Your choice was not saved')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByText('Your choice was not saved')).toBeNull();
    expect((await onlineFake.ratings.mine()).shown).toBe(true);
  });

  it('a failed load says so, and Try again loads', async () => {
    signInSaved();
    let fail = true;
    const flaky: Ratings = {
      ...onlineFake.ratings,
      mine: () => (fail ? Promise.reject(new Error('offline')) : onlineFake.ratings.mine()),
    };
    await show(flaky);
    expect(screen.getByTestId('ratings-failed')).toBeOnTheScreen();
    fail = false;
    await setupUser().press(screen.getByRole('button', { name: 'Try again' }));
    await flush();
    expect(screen.getByTestId('ratings-mine')).toBeOnTheScreen();
  });
});

describe('boardStatus', () => {
  const mine = { rating: 1500, matches: MIN_BOARD_MATCHES, shown: true, listed: true };
  it('names why the global board does or does not show the player', () => {
    expect(boardStatus(mine)).toBe('listed');
    expect(boardStatus({ ...mine, shown: false })).toBe('hidden');
    expect(boardStatus({ ...mine, matches: MIN_BOARD_MATCHES - 1, listed: false })).toBe(
      'fewMatches',
    );
    expect(boardStatus({ ...mine, listed: false })).toBe('noUsername');
  });
});
