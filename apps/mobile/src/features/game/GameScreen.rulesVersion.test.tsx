/**
 * The rules version house rule (#241) on the game screen: a match started
 * from New game plays the chosen engine preset. The screen only sends
 * engine actions; the engine asks for the double (#205). On fake timers:
 * the cards close on timers.
 */
import { createMemoryStorage } from '@tavli/contracts';
import { createSeededRng, legalNextMoves, type MatchAction } from '@tavli/engine';
import { act, screen } from '@testing-library/react-native';

import { createSessionRegistry } from '@/features/match/sessions';
import { defaultSetup, type MatchSetup, type RulesVersions } from '@/features/match/setup';
import i18n from '@/i18n';

import type { GameStore } from './gameStore';
import { GameScreen, OPENING_RESULT_MS } from './GameScreen';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { renderWithRoot as render } from '../../../test/render';

const hidden = { includeHiddenElements: true };

function start(game: MatchSetup['game'], rulesVersions: Partial<RulesVersions>): GameStore {
  const sessions = createSessionRegistry({
    createRng: () => createSeededRng(3),
    storage: createMemoryStorage(),
  });
  const setup: MatchSetup = {
    ...defaultSetup('local'),
    game,
    rulesVersions: { ...defaultSetup('local').rulesVersions, ...rulesVersions },
  };
  return sessions.start(setup).store;
}

async function send(store: GameStore, action: MatchAction) {
  await act(async () => {
    expect(store.getState().dispatch(action)).toBe(true);
  });
}

async function wait(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

/** The opening roll gives White 2 and Black 1: White starts with 2-1 from the empty board. */
async function whiteOpensWithAceDeuce(store: GameStore) {
  await send(store, { type: 'rollOpening', player: 'white', die: 2 });
  await send(store, { type: 'rollOpening', player: 'black', die: 1 });
  await wait(OPENING_RESULT_MS + 10);
  expect(store.getState().flow.game.state.dice).toEqual([2, 1]);
  // Both dice enter a checker; the screen sends the engine's legal moves.
  for (let i = 0; i < 2; i++) {
    const move = legalNextMoves(store.getState().flow.game)[0]!.moves[0]!;
    await send(store, { type: 'move', player: 'white', move });
  }
  await send(store, { type: 'confirm', player: 'white' });
}

runOnFakeTimers();

beforeEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

describe('<GameScreen /> rules version (#241)', () => {
  it('Acey-Deucey Greek: a 1-2 from the start shows the choose-a-double card', async () => {
    const store = start('asodio', { asodio: 'asodio.aceyDeuceyGreek' });
    expect(store.getState().flow.game.state.rules.presetId).toBe('asodio.aceyDeuceyGreek');
    await render(<GameScreen store={store} />);
    await whiteOpensWithAceDeuce(store);

    expect(store.getState().flow.game.phase).toBe('awaiting-answer');
    // The engine's player names label the seats here (no seats prop).
    expect(screen.getByRole('header', { name: 'player-1, you rolled 1-2' })).toBeOnTheScreen();
    expect(screen.getByText('Choose a double:')).toBeOnTheScreen();
    await setupUser().press(screen.getByTestId('choose-double-4'));
    const { state } = store.getState().flow.game;
    expect(state.toMove).toBe('white');
    expect(state.dice).toEqual([4, 4]);
    expect(screen.queryByTestId('choose-double-4', hidden)).toBeNull();
  });

  it('the default Asodio (kafeneio): the same 1-2 asks for nothing, the turn passes', async () => {
    const store = start('asodio', {});
    expect(store.getState().flow.game.state.rules.presetId).toBe('asodio.kafeneio');
    await render(<GameScreen store={store} />);
    await whiteOpensWithAceDeuce(store);

    expect(store.getState().flow.game.phase).toBe('awaiting-roll');
    expect(store.getState().flow.game.state.toMove).toBe('black');
    expect(screen.queryByTestId('choose-double-4', hidden)).toBeNull();
  });

  it('a Federation Plakoto game plays the plakoto.federation rules', async () => {
    const store = start('plakoto', { plakoto: 'plakoto.federation' });
    const { match, game } = store.getState().flow;
    expect(match.rules.presetId).toBe('plakoto.federation');
    expect(game.state.rules.presetId).toBe('plakoto.federation');
    expect(game.state.rules.mother.motherRule).toBe('federation');
    expect(game.state.variant).toBe('plakoto');
    await render(<GameScreen store={store} />);
    expect(screen.getByTestId('opening-card')).toBeOnTheScreen();
  });
});
