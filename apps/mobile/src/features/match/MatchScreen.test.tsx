import { createGameFlow, createSeededRng, portes, type PlayerId } from '@tavli/engine';
import { act, screen, userEvent, waitFor, within } from '@testing-library/react-native';

import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';

import { MatchScreen } from './MatchScreen';
import { createSessionRegistry, type MatchSession } from './sessions';
import { defaultSetup, type MatchSetup } from './setup';

import { renderWithRoot } from '../../../test/render';

const FAST = { beforeRollMs: 20, moveMs: 5, thinkMs: () => 5 };
const WAIT = { timeout: 4000 };

function session(setup: MatchSetup, seed = 11): MatchSession {
  return createSessionRegistry({ createRng: () => createSeededRng(seed) }).start(setup);
}

/** Skips the opening roll: `starter` is to roll on the Portes start. */
function startWith(s: MatchSession, starter: PlayerId) {
  const state = portes.initialState({ startingPlayer: starter });
  s.store.setState({
    flow: { ...s.store.getState().flow, game: createGameFlow({ state, starter }) },
  });
}

function show(s: MatchSession, timing = FAST) {
  const props = {
    onExit: jest.fn(),
    onSettings: jest.fn(),
    onRules: jest.fn(),
    onChangeSettings: jest.fn(),
  };
  const view = renderWithRoot(<MatchScreen session={s} botTiming={timing} {...props} />);
  return { props, view };
}

const button = (name: string | RegExp) => screen.getByRole('button', { name });
const game = (s: MatchSession) => s.store.getState().flow.game;

beforeEach(async () => {
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS });
  });
});

describe('<MatchScreen /> vs bot', () => {
  it('rolls both opening dice with one tap', async () => {
    const user = userEvent.setup();
    const s = session(defaultSetup('bot'));
    await show(s).view;

    expect(within(screen.getByTestId('strip-bottom')).getByText('You')).toBeOnTheScreen();
    expect(within(screen.getByTestId('strip-top')).getByText('Bot · Easy')).toBeOnTheScreen();
    await user.press(button('Roll to start, or tap the board'));
    const opening = game(s).opening;
    expect(opening?.ties.length || (opening?.white !== null && opening?.black !== null)).toBe(true);
  });

  it('plays the bot turn through the flow and locks your controls meanwhile', async () => {
    const s = session(defaultSetup('bot'));
    startWith(s, 'black');
    await show(s, { beforeRollMs: 150, moveMs: 5, thinkMs: () => 5 }).view;

    // The bot's turn: a locked box, no Roll button, the bot strip is active.
    expect(screen.getByTestId('bot-turn')).toHaveTextContent("Bot's turn…");
    expect(screen.queryByTestId('roll-button')).toBeNull();
    expect(screen.getByText('PLAYING')).toBeOnTheScreen();

    await waitFor(() => expect(screen.getByTestId('roll-button')).toBeOnTheScreen(), WAIT);
    const { lastTurn, state } = game(s);
    expect(lastTurn?.player).toBe('black');
    expect(lastTurn?.moves.length).toBeGreaterThan(0);
    expect(state.toMove).toBe('white');
    expect(screen.getByText('YOUR TURN')).toBeOnTheScreen();
  });

  it('waits while the menu is open and goes on after Resume', async () => {
    const user = userEvent.setup();
    const s = session(defaultSetup('bot'));
    startWith(s, 'black');
    // The bot waits 600 ms before it rolls. Opening the menu takes much less,
    // even on a cold cache, and the menu stays open longer than that.
    await show(s, { beforeRollMs: 600, moveMs: 5, thinkMs: () => 5 }).view;

    await user.press(button('Game menu'));
    expect(screen.getByTestId('game-menu')).toBeOnTheScreen();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 900));
    });
    expect(game(s).phase).toBe('awaiting-roll');
    expect(game(s).state.toMove).toBe('black');

    await user.press(button('Resume'));
    await waitFor(() => expect(game(s).state.toMove).toBe('white'), WAIT);
  });

  it('resigns the game after the confirm dialog (diplo at the start)', async () => {
    const user = userEvent.setup();
    const s = session(defaultSetup('bot'));
    startWith(s, 'white');
    const { props, view } = show(s);
    await view;

    await user.press(button('Game menu'));
    const menu = screen.getByTestId('game-menu');
    expect(within(menu).getByText('Portes · vs Bot (Easy) · You 0 – 0 Bot')).toBeOnTheScreen();
    await user.press(button('Resign game, Bot wins this game'));

    const dialog = screen.getByTestId('resign-game-dialog');
    expect(
      within(dialog).getByText(
        'Bot wins 2 points (diplo), because you have not borne off any checker yet.',
      ),
    ).toBeOnTheScreen();
    expect(within(dialog).getByText('Match after resign: You 0 – 2 Bot (to 3)')).toBeOnTheScreen();

    // Keep playing closes the dialog and changes nothing.
    await user.press(button('Keep playing'));
    expect(screen.queryByTestId('resign-game-dialog')).toBeNull();
    expect(game(s).phase).toBe('awaiting-roll');

    await user.press(button('Game menu'));
    await user.press(button('Resign game, Bot wins this game'));
    await user.press(button('Resign'));
    expect(game(s).result).toEqual({ winner: 'black', points: 2, reason: 'resigned' });
    const card = screen.getByTestId('game-end-card');
    expect(within(card).getByText('Bot wins the game!')).toBeOnTheScreen();
    expect(within(card).getByText('You resigned.')).toBeOnTheScreen();
    expect(within(card).getByText('You 0 – 2 Bot')).toBeOnTheScreen();

    await user.press(within(card).getByRole('button', { name: 'Home' }));
    expect(props.onExit).toHaveBeenCalled();
  });

  it('resigns the match', async () => {
    const user = userEvent.setup();
    const s = session(defaultSetup('bot'));
    startWith(s, 'white');
    const { props, view } = show(s);
    await view;

    await user.press(button('Game menu'));
    await user.press(button('Resign match, Bot wins the match'));
    expect(screen.getByText('Bot wins the match. The match ends now.')).toBeOnTheScreen();
    await user.press(button('Resign'));

    expect(s.store.getState().flow.match.winner).toBe('black');
    const card = screen.getByTestId('match-end-card');
    expect(within(card).getByText('Bot wins the match!')).toBeOnTheScreen();
    await user.press(within(card).getByRole('button', { name: 'Change settings' }));
    expect(props.onChangeSettings).toHaveBeenCalled();
  });

  it('opens rules, settings and home from the menu', async () => {
    const user = userEvent.setup();
    const s = session(defaultSetup('bot'));
    startWith(s, 'white');
    const { props, view } = show(s);
    await view;

    await user.press(button('Game menu'));
    await user.press(button('How to play Portes'));
    expect(props.onRules).toHaveBeenCalled();
    expect(screen.queryByTestId('game-menu')).toBeNull();

    await user.press(button('Game menu'));
    await user.press(button('Settings'));
    expect(props.onSettings).toHaveBeenCalled();

    await user.press(button('Game menu'));
    await user.press(button(/^Exit to home/));
    expect(props.onExit).toHaveBeenCalled();
  });
});

describe('<MatchScreen /> pass-and-play', () => {
  it('uses the typed names, and Player 2 for an empty one', async () => {
    const s = session({ ...defaultSetup('local'), names: { white: 'Maria', black: '' } });
    await show(s).view;
    expect(button('Maria: roll, or tap the board')).toBeOnTheScreen();
    expect(within(screen.getByTestId('strip-top')).getByText('Player 2')).toBeOnTheScreen();
  });

  it('lets the player to move resign; no game resign during the opening roll', async () => {
    const user = userEvent.setup();
    const s = session({ ...defaultSetup('local'), names: { white: 'Maria', black: 'Nikos' } });
    await show(s).view;

    await user.press(button('Game menu'));
    expect(button('Resign game')).toBeDisabled();
    await user.press(button('Resume'));

    await act(async () => startWith(s, 'black'));
    await user.press(button('Game menu'));
    await user.press(button('Resign game, Maria wins this game'));
    expect(
      screen.getByText(
        'Maria wins 2 points (diplo), because Nikos has not borne off any checker yet.',
      ),
    ).toBeOnTheScreen();
  });
});
