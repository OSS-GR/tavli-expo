/**
 * "Grab a chair" (#509): when a match opens, the table scene plays over the
 * board, on a cover that fades out, before the opening card. Once per match, never on a rematch; a tap
 * skips it; Reduce motion skips it. On fake timers: the intro waits on a timer.
 */
import { createSeededRng, getPreset } from '@tavli/engine';
import { act, screen } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

import { resetIntrosForTest } from '@/features/intro/introRuns';
import { TABLE_SCENE_MS } from '@/features/intro/tableMotion';

import { createGameStore, type GameStore } from './gameStore';
import { GameScreen, TABLE_INTRO_LEAD_MS, TABLE_INTRO_MS } from './GameScreen';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { renderWithRoot as render } from '../../../test/render';

const hidden = { includeHiddenElements: true };

function newStore(): GameStore {
  const portes = getPreset('portes');
  return createGameStore({
    players: { white: 'Ann', black: 'Bob' },
    targetPoints: 3,
    // A rematch opens with a roll too, so it could show the intro.
    rules: { ...portes, match: { ...portes.match, rematchStarter: 'openingRoll' } },
    rng: createSeededRng(5),
  });
}

async function wait(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

const intro = () => screen.queryByTestId('table-intro', hidden);
const openingCard = () => screen.queryByTestId('opening-card', hidden);

runOnFakeTimers();

beforeEach(() => {
  resetIntrosForTest({ matches: true });
});

describe('<GameScreen /> table intro (#509)', () => {
  it('plays the scene first, then shows the opening card', async () => {
    await render(<GameScreen store={newStore()} />);
    expect(intro()).toBeOnTheScreen();
    expect(screen.getByTestId('table-intro-scene', hidden)).toBeTruthy();
    expect(openingCard()).toBeNull();

    // The cover hides the board while the screen slides in and the scene plays.
    await wait(TABLE_INTRO_LEAD_MS + TABLE_SCENE_MS);
    expect(screen.getByTestId('table-intro-cover', hidden)).toBeTruthy();
    expect(openingCard()).toBeNull();

    await wait(TABLE_INTRO_MS - TABLE_INTRO_LEAD_MS - TABLE_SCENE_MS - 1);
    expect(intro()).toBeOnTheScreen();
    await wait(1);
    expect(intro()).toBeNull();
    expect(openingCard()).toBeOnTheScreen();
  });

  it('skips to the opening card on a tap', async () => {
    const user = setupUser();
    await render(<GameScreen store={newStore()} />);
    await user.press(screen.getByTestId('table-intro'));
    expect(intro()).toBeNull();
    expect(openingCard()).toBeOnTheScreen();
  });

  it('plays once per match: the same match on a new screen goes to the card', async () => {
    const store = newStore();
    const first = await render(<GameScreen store={store} />);
    await wait(TABLE_INTRO_MS);
    await first.unmount();
    await render(<GameScreen store={store} />);
    expect(intro()).toBeNull();
    expect(openingCard()).toBeOnTheScreen();
  });

  it('plays none on a rematch, which the app shows on a new screen', async () => {
    const store = newStore();
    const first = await render(<GameScreen store={store} />);
    await wait(TABLE_INTRO_MS);
    // A rematch needs a finished match.
    await act(async () => {
      store.getState().dispatch({ type: 'resignMatch', player: 'black' });
    });
    await first.unmount();
    // Like the match-end route: rematch, then a new game screen.
    await act(async () => {
      store.getState().rematch();
    });
    await render(<GameScreen store={store} />);
    expect(intro()).toBeNull();
    expect(openingCard()).toBeOnTheScreen();
  });

  it('plays none with Reduce motion', async () => {
    const reduce = jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(true);
    try {
      await render(<GameScreen store={newStore()} />);
      expect(intro()).toBeNull();
      expect(openingCard()).toBeOnTheScreen();
    } finally {
      reduce.mockRestore();
    }
  });

  it('plays none in a test unless the test turns it on', async () => {
    resetIntrosForTest();
    await render(<GameScreen store={newStore()} />);
    expect(intro()).toBeNull();
    expect(openingCard()).toBeOnTheScreen();
  });
});
