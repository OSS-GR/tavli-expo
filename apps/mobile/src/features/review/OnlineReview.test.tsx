/**
 * The review of an online game (#604): it loads the game's record from
 * the server, then shows only your turns. A failed load shows a problem
 * dialog. Scripted Portes games (`test/reviewGame.ts`) on fake timers.
 */
import type { GameRecord, GameTransport } from '@tavli/contracts';
import { screen, within } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { renderWithRoot } from '../../../test/render';
import { oneBadTurn, testAnalyzer } from '../../../test/reviewGame';

import { OnlineReview } from './OnlineReview';

runOnFakeTimers();

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

/** A transport that only answers `gameRecord`, as `answer` says. */
function transportOf(answer: () => Promise<GameRecord>): {
  transport: GameTransport;
  gameRecord: jest.Mock;
} {
  const gameRecord = jest.fn(answer);
  return { transport: { gameRecord } as unknown as GameTransport, gameRecord };
}

describe('<OnlineReview /> (#604)', () => {
  it('loads the record of the game, then shows only your turns', async () => {
    const flow = oneBadTurn();
    const { transport, gameRecord } = transportOf(() =>
      Promise.resolve({ choice: 'portes', side: 'black', log: flow.log }),
    );
    await renderWithRoot(
      <OnlineReview
        gameId="g1"
        gameNumber={1}
        transport={transport}
        onBack={jest.fn()}
        analyzer={testAnalyzer}
      />,
    );
    expect(gameRecord).toHaveBeenCalledWith({ gameId: 'g1', gameNumber: 1 });
    // Black (the bot of the scripted game) plays its worst turns: here they
    // are yours. White's one bad turn (turn 5, 6-5) is not.
    await screen.findByTestId('review-mistake-1');
    expect(screen.queryByText('Turn 5 · roll 6-5')).toBeNull();
    expect(screen.getByText('Turn 2 · roll 6-4')).toBeOnTheScreen();
    expect(screen.getByText('Your biggest mistakes, the biggest first.')).toBeOnTheScreen();
    expect(
      within(screen.getByTestId('review-mistake-1')).getByText(/^You played: /),
    ).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Game 1 · Portes' })).toBeOnTheScreen();
  });

  it('says it is loading, and a failed load shows a problem; OK goes back', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    let fail: (error: unknown) => void = () => {};
    const { transport } = transportOf(
      () =>
        new Promise<GameRecord>((_, reject) => {
          fail = reject;
        }),
    );
    const onBack = jest.fn();
    const user = setupUser();
    await renderWithRoot(
      <OnlineReview gameId="g1" gameNumber={2} transport={transport} onBack={onBack} />,
    );
    expect(screen.getByTestId('review-loading')).toHaveTextContent('Loading the game…');
    fail(new Error('network request failed'));
    expect(await screen.findByText('The review did not load')).toBeOnTheScreen();
    expect(screen.getByText('Tap Review again in a moment.')).toBeOnTheScreen();
    expect(screen.queryByTestId('review-loading')).toBeNull();
    await user.press(screen.getByRole('button', { name: 'OK' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('refuses a record of a game that is not over', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const flow = oneBadTurn();
    // The log without the resign: the game is still in play.
    const { transport } = transportOf(() =>
      Promise.resolve({ choice: 'portes', side: 'white', log: flow.log.slice(0, -1) }),
    );
    await renderWithRoot(
      <OnlineReview gameId="g1" gameNumber={1} transport={transport} onBack={jest.fn()} />,
    );
    expect(await screen.findByText('The review did not load')).toBeOnTheScreen();
  });
});
