/**
 * Play ranked (#532), on the Jest online fake: the save step for a guest
 * or nobody, the rules sheet once, the search, "Nobody yet" and a match
 * found that opens the game.
 */
import {
  createRecordingAnalytics,
  memoryAppleIdToken,
  NOBODY_YET_MS,
  TERMS_VERSION,
} from '@tavli/contracts';
import { act, screen, within } from '@testing-library/react-native';

import { signInForOnline } from '@/features/online/account';
import { rememberOnlineAccount } from '@/features/online/accountHint';
import { appleSheet, auth, games, onlineData, safety, usernames } from '@/services';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { onlineFake } from '../../../test/onlineFake';
import { renderWithRoot } from '../../../test/render';

import { hasAgreedRankedRules } from './rankedRules';
import { MATCH_START_SECONDS, RankedScreen } from './RankedScreen';

runOnFakeTimers();

/** Lets the server answer (it answers on later microtasks). */
async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 30; i++) await Promise.resolve();
  });
}

async function wait(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await flush();
}

/** Moves the clock one second at a time: each count step sets the next timer. */
async function seconds(n: number): Promise<void> {
  for (let i = 0; i < n; i++) await wait(1000);
}

async function open() {
  const analytics = createRecordingAnalytics();
  analytics.optIn();
  const props = {
    onBack: jest.fn(),
    onGame: jest.fn(),
    onBot: jest.fn(),
  };
  await renderWithRoot(
    <RankedScreen
      account={{
        auth: auth!,
        usernames: usernames!,
        data: onlineData!,
        appleSheet,
        analytics,
        pushes: undefined,
      }}
      matchmaking={onlineFake.matchmaking}
      ratings={onlineFake.ratings}
      games={games!}
      safety={safety!}
      analytics={analytics}
      {...props}
    />,
  );
  await flush();
  return { analytics, ...props };
}

/** A saved account (Apple) with a username, signed in on this phone. */
async function saved(name = 'Maria'): Promise<string> {
  const nonce = await auth!.keyNonce();
  const user = await auth!.signInWithKey({
    provider: 'apple',
    idToken: memoryAppleIdToken('apple-1', nonce),
    nonce,
  });
  rememberOnlineAccount();
  await usernames!.setMine({ name, acceptTerms: TERMS_VERSION, ageChecked: true });
  return user.id;
}

/** Another saved player who looks for `game` now. */
async function otherLooks(game: 'portes' | 'plakoto' = 'portes', id = 'nikos'): Promise<void> {
  const server = onlineFake.server();
  server.markSaved(id);
  await server.usernamesFor(id, true).setMine({
    name: 'nikos_k',
    acceptTerms: TERMS_VERSION,
    ageChecked: true,
  });
  await server.matchmakingFor(id).seek({ game });
}

function tracked(analytics: ReturnType<typeof createRecordingAnalytics>) {
  return analytics.sent.flatMap((s) =>
    s.type === 'track' ? [{ event: s.event, ...s.props }] : [],
  );
}

describe('<RankedScreen /> without a saved account', () => {
  it('a guest sees the save step and never the search', async () => {
    await signInForOnline(auth!);
    rememberOnlineAccount();
    const seek = jest.spyOn(onlineFake.matchmaking, 'seek');
    await open();
    expect(await screen.findByTestId('ranked-gate')).toBeOnTheScreen();
    expect(screen.getByText('Save your account to play ranked')).toBeOnTheScreen();
    expect(screen.getByTestId('ranked-apple')).toBeOnTheScreen();
    expect(screen.getByTestId('ranked-email-button')).toBeOnTheScreen();
    expect(screen.queryByTestId('ranked-setup')).toBeNull();
    expect(screen.queryByTestId('ranked-find')).toBeNull();
    expect(seek).not.toHaveBeenCalled();
  });

  it('Not now goes back', async () => {
    const { onBack } = await open();
    await setupUser().press(await screen.findByTestId('ranked-not-now'));
    expect(onBack).toHaveBeenCalled();
  });

  it('nobody signed in: Continue with Apple signs in, then the setup shows', async () => {
    const user = setupUser();
    await open();
    await user.press(await screen.findByTestId('ranked-apple'));
    await flush();
    // A new account picks a username first; Not now skips it.
    const step = await screen.findByTestId('ranked-username-step');
    await user.press(within(step).getByText('Not now'));
    await flush();
    expect(await screen.findByTestId('ranked-setup')).toBeOnTheScreen();
    expect(onlineFake.authStore.guests).toBe(0);
  });
});

describe('<RankedScreen /> with a saved account', () => {
  it('shows the setup: the game, the clock card, the rating, no hints', async () => {
    await saved();
    await open();
    expect(await screen.findByTestId('ranked-setup')).toBeOnTheScreen();
    expect(screen.getByText('Sit with a new player')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Portes' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Tavli' })).toBeOnTheScreen();
    expect(screen.queryByRole('radio', { name: 'Asodio' })).toBeNull();
    expect(screen.getByText('2 minutes a turn')).toBeOnTheScreen();
    expect(screen.getByText('2:00')).toBeOnTheScreen();
    expect(screen.getByText('Your rating 1500 · no hints')).toBeOnTheScreen();
    expect(screen.getByText('Match to 3 points · federation rules')).toBeOnTheScreen();
  });

  it('shows the rules sheet once, before the first search', async () => {
    const user = setupUser();
    await saved();
    const { analytics } = await open();
    await user.press(await screen.findByTestId('ranked-find'));
    expect(await screen.findByTestId('ranked-rules')).toBeOnTheScreen();
    expect(screen.getByText('Before your first game')).toBeOnTheScreen();
    expect(await onlineFake.matchmaking.mySeek()).toEqual({ kind: 'none' });

    await user.press(screen.getByTestId('ranked-agree'));
    await flush();
    expect(hasAgreedRankedRules()).toBe(true);
    expect(await screen.findByTestId('ranked-searching')).toBeOnTheScreen();
    expect(screen.getByText('Looking for a player…')).toBeOnTheScreen();
    expect(screen.getByTestId('ranked-range')).toHaveTextContent(/Ratings 1450 – 1550/);

    // Cancel, then a second search: no rules sheet.
    await user.press(screen.getByTestId('ranked-cancel'));
    await flush();
    expect(await screen.findByTestId('ranked-setup')).toBeOnTheScreen();
    await user.press(screen.getByTestId('ranked-find'));
    await flush();
    expect(screen.queryByTestId('ranked-rules')).toBeNull();
    expect(await screen.findByTestId('ranked-searching')).toBeOnTheScreen();

    expect(tracked(analytics)).toEqual([
      { event: 'ranked_search_started', game: 'portes' },
      { event: 'ranked_search_ended', game: 'portes', how: 'cancelled', waitSec: 0 },
      { event: 'ranked_search_started', game: 'portes' },
    ]);
  });

  it('counts the wait, then after a minute offers Keep looking, another game and the bot', async () => {
    const user = setupUser();
    await saved();
    const { onBot, analytics } = await open();
    await user.press(await screen.findByTestId('ranked-find'));
    await user.press(await screen.findByTestId('ranked-agree'));
    await flush();
    await wait(18_000);
    expect(screen.getByTestId('ranked-wait')).toHaveTextContent(/Waiting 0:18/);

    // Somebody looks for Plakoto: "Try another game" says so.
    await otherLooks('plakoto');
    await wait(NOBODY_YET_MS - 18_000);
    expect(await screen.findByTestId('ranked-nobody')).toBeOnTheScreen();
    expect(screen.getByText('Few players are free for Portes right now.')).toBeOnTheScreen();
    expect(await screen.findByText('Plakoto has 1 player looking')).toBeOnTheScreen();

    // Keep looking closes it; the search goes on.
    await user.press(screen.getByTestId('ranked-keep-looking'));
    expect(screen.getByTestId('ranked-searching')).toBeOnTheScreen();

    // Back to the setup, a new search, a minute, then the bot.
    await user.press(screen.getByTestId('ranked-cancel'));
    await flush();
    await user.press(await screen.findByTestId('ranked-find'));
    await flush();
    await wait(NOBODY_YET_MS);
    await user.press(await screen.findByTestId('ranked-bot'));
    await flush();
    expect(onBot).toHaveBeenCalled();
    expect(await onlineFake.matchmaking.mySeek()).toEqual({ kind: 'none' });
    expect(tracked(analytics).at(-1)).toEqual({
      event: 'ranked_search_ended',
      game: 'portes',
      how: 'bot',
      waitSec: 60,
    });
  });

  it('Try another game looks for the busier game, and a player sits down at once', async () => {
    const user = setupUser();
    await saved();
    const { onGame, analytics } = await open();
    await user.press(await screen.findByTestId('ranked-find'));
    await user.press(await screen.findByTestId('ranked-agree'));
    await flush();
    await otherLooks('plakoto');
    await wait(NOBODY_YET_MS);
    await screen.findByText('Plakoto has 1 player looking');
    await user.press(screen.getByTestId('ranked-other-game'));
    await flush();
    expect(await screen.findByTestId('ranked-matched')).toBeOnTheScreen();
    expect(screen.getByTestId('ranked-opponent-name')).toHaveTextContent('nikos_k');
    const seek = await onlineFake.matchmaking.mySeek();
    expect(seek.kind).toBe('matched');
    await seconds(MATCH_START_SECONDS);
    expect(onGame).toHaveBeenCalledWith(seek.kind === 'matched' ? seek.gameId : '');
    const ended = tracked(analytics).filter((e) => e.event === 'ranked_search_ended');
    expect(ended).toMatchObject([
      { game: 'portes', how: 'otherGame' },
      { game: 'plakoto', how: 'matched' },
    ]);
  });

  it('a match found shows both ratings, the stakes and the count, then opens the game', async () => {
    const user = setupUser();
    await saved();
    await otherLooks('portes');
    const { onGame, analytics } = await open();
    await user.press(await screen.findByTestId('ranked-find'));
    await user.press(await screen.findByTestId('ranked-agree'));
    await flush();
    expect(await screen.findByTestId('ranked-matched')).toBeOnTheScreen();
    expect(screen.getByText('A player sat down')).toBeOnTheScreen();
    expect(screen.getByTestId('ranked-opponent-rating')).toHaveTextContent('1500');
    expect(screen.getByTestId('ranked-my-rating')).toHaveTextContent('1500');
    expect(await screen.findByTestId('ranked-stakes')).toHaveTextContent(/Win \+\d+ · lose −\d+/);
    expect(screen.getByTestId('ranked-start')).toHaveTextContent('Starting in 3…');
    await wait(1000);
    expect(screen.getByTestId('ranked-start')).toHaveTextContent('Starting in 2…');
    expect(onGame).not.toHaveBeenCalled();
    await seconds(2);
    expect(onGame).toHaveBeenCalledTimes(1);
    const sent = tracked(analytics);
    expect(sent.at(-1)).toMatchObject({ event: 'ranked_search_ended', how: 'matched' });
    // Never an id, a name or a rating in analytics.
    expect(JSON.stringify(sent)).not.toMatch(/nikos|Maria|1500|user-/);
  });

  it('Report or block holds the count while its sheet is open', async () => {
    const user = setupUser();
    await saved();
    await otherLooks('portes');
    const { onGame } = await open();
    await user.press(await screen.findByTestId('ranked-find'));
    await user.press(await screen.findByTestId('ranked-agree'));
    await flush();
    await screen.findByTestId('ranked-matched');
    await user.press(screen.getByTestId('ranked-report'));
    await flush();
    await seconds(5);
    expect(onGame).not.toHaveBeenCalled();
  });

  it('a seek matched before the screen opened shows the setup, not that match', async () => {
    await saved();
    await otherLooks('portes');
    await onlineFake.matchmaking.seek({ game: 'portes' });
    expect((await onlineFake.matchmaking.mySeek()).kind).toBe('matched');
    const { onGame } = await open();
    expect(await screen.findByTestId('ranked-setup')).toBeOnTheScreen();
    await seconds(5);
    expect(onGame).not.toHaveBeenCalled();
  });

  it('Back while searching cancels the search', async () => {
    const user = setupUser();
    await saved();
    const { onBack } = await open();
    await user.press(await screen.findByTestId('ranked-find'));
    await user.press(await screen.findByTestId('ranked-agree'));
    await flush();
    await screen.findByTestId('ranked-searching');
    await user.press(screen.getByTestId('ranked-back'));
    await flush();
    expect(onBack).toHaveBeenCalled();
    expect(await onlineFake.matchmaking.mySeek()).toEqual({ kind: 'none' });
  });
});
