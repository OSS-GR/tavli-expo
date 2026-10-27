import { act, render, screen, userEvent } from '@testing-library/react-native';

import type { Difficulty } from '@tavli/contracts';

import { defaultSetup, gameLevels, type GameLevels, type MatchMode } from '@/features/match/setup';
import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';

import { NewGameScreen } from './NewGameScreen';

/** Portes only, like the bot before #109 (Plakoto and Fevga have no level). */
const PORTES_ONLY = (levels: readonly Difficulty[]) =>
  gameLevels(levels, { plakoto: [], fevga: [], tavli: [], asodio: [] });

function show(
  mode: MatchMode,
  botLevels: GameLevels = PORTES_ONLY(['easy']),
  initial = defaultSetup(mode),
) {
  const onStart = jest.fn();
  const onBack = jest.fn();
  const ui = (
    <NewGameScreen
      mode={mode}
      initial={initial}
      botLevels={botLevels}
      onBack={onBack}
      onStart={onStart}
    />
  );
  return { ui, onStart, onBack };
}

beforeEach(async () => {
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS });
  });
});

describe('<NewGameScreen /> vs bot', () => {
  it('starts Portes to 3 vs an easy bot by default', async () => {
    const user = userEvent.setup();
    const { ui, onStart } = show('bot');
    await render(ui);

    expect(screen.getByRole('header', { name: 'Play vs bot' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: /^Portes/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: '3' })).toBeChecked();
    expect(screen.getByText('First to 3 points. Mono = 1, diplo = 2.')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Easy' })).toBeChecked();

    await user.press(screen.getByRole('button', { name: 'Start game' }));
    expect(onStart).toHaveBeenCalledWith(defaultSetup('bot'));
  });

  it('locks Medium and Hard while the bot cannot play them', async () => {
    const user = userEvent.setup();
    const { ui, onStart } = show('bot', PORTES_ONLY(['easy']));
    await render(ui);

    expect(screen.getByRole('radio', { name: 'Medium' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Hard' })).toBeDisabled();
    expect(screen.getByText('Medium and Hard are coming soon.')).toBeOnTheScreen();
    await user.press(screen.getByRole('radio', { name: 'Medium' }));
    await user.press(screen.getByRole('button', { name: 'Start game' }));
    expect(onStart.mock.calls[0][0].botLevel).toBe('easy');
  });

  it('lets the player pick Medium once the bot supports it', async () => {
    const user = userEvent.setup();
    const { ui, onStart } = show('bot', PORTES_ONLY(['easy', 'medium']));
    await render(ui);
    expect(screen.getByText('Hard is coming soon.')).toBeOnTheScreen();

    await user.press(screen.getByRole('radio', { name: 'Medium' }));
    expect(screen.getByText('Medium plays like a casual player.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Start game' }));
    expect(onStart.mock.calls[0][0].botLevel).toBe('medium');
  });

  it('changes the match length', async () => {
    const user = userEvent.setup();
    const { ui, onStart } = show('bot');
    await render(ui);

    await user.press(screen.getByRole('radio', { name: '1' }));
    expect(screen.getByText('First to 1 point. Mono = 1, diplo = 2.')).toBeOnTheScreen();
    await user.press(screen.getByRole('radio', { name: '7' }));
    await user.press(screen.getByRole('button', { name: 'Start game' }));
    expect(onStart.mock.calls[0][0].targetPoints).toBe(7);
  });

  it('shows "Coming soon" for the locked games', async () => {
    const user = userEvent.setup();
    const { ui } = show('bot');
    await render(ui);

    for (const name of ['Plakoto', 'Fevga', 'Asodio', 'Tavli']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    await user.press(screen.getByRole('button', { name: 'Fevga' }));
    expect(screen.getByTestId('toast')).toHaveTextContent('Coming soon: Fevga');
  });

  it('goes back', async () => {
    const user = userEvent.setup();
    const { ui, onBack } = show('bot');
    await render(ui);
    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('opens the rules of the game from the info button', async () => {
    const user = userEvent.setup();
    const onRules = jest.fn();
    const onStart = jest.fn();
    await render(
      <NewGameScreen
        mode="bot"
        initial={defaultSetup('bot')}
        botLevels={PORTES_ONLY(['easy'])}
        onBack={jest.fn()}
        onStart={onStart}
        onRules={onRules}
      />,
    );

    // The radio keeps its own name; the info button sits next to it.
    expect(screen.getByRole('radio', { name: /^Portes/ })).toBeChecked();
    await user.press(screen.getByRole('button', { name: 'How to play Portes' }));
    expect(onRules).toHaveBeenCalledWith('portes');
    expect(onStart).not.toHaveBeenCalled();
  });
});

describe('<NewGameScreen /> pass-and-play', () => {
  it('takes two optional names, trimmed and at most 16 characters', async () => {
    const user = userEvent.setup();
    const { ui, onStart } = show('local');
    await render(ui);

    expect(screen.getByRole('header', { name: 'Pass-and-play' })).toBeOnTheScreen();
    expect(screen.queryByText('Bot level')).toBeNull();
    expect(screen.queryByText('Who starts?')).toBeNull();
    const white = screen.getByLabelText('Name of player 1, white checkers');
    expect(white.props.maxLength).toBe(16);
    expect(white.props.placeholder).toBe('Player 1 (white)');
    await user.type(white, '  Maria ');

    await user.press(screen.getByRole('button', { name: 'Start game' }));
    expect(onStart).toHaveBeenCalledWith({
      ...defaultSetup('local'),
      names: { white: 'Maria', black: '' },
    });
  });
});

describe('<NewGameScreen /> board view', () => {
  it('starts from Settings and changes Settings (face-to-face stays locked)', async () => {
    const user = userEvent.setup();
    await act(async () => {
      settingsStore.setState({ boardFlipMode: 'fixed' });
    });
    const { ui } = show('local');
    await render(ui);

    expect(screen.getByRole('radio', { name: 'Fixed' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Face-to-face' })).toBeDisabled();
    expect(screen.getByText('The board stays the same for both players.')).toBeOnTheScreen();

    await user.press(screen.getByRole('radio', { name: 'Flip' }));
    expect(settingsStore.getState().boardFlipMode).toBe('flip');
    expect(screen.getByText('The board turns to the player whose turn it is.')).toBeOnTheScreen();
    await user.press(screen.getByRole('radio', { name: 'Face-to-face' }));
    expect(settingsStore.getState().boardFlipMode).toBe('flip');
  });

  it('is not shown vs the bot (the human always sits at the bottom)', async () => {
    const { ui } = show('bot');
    await render(ui);
    expect(screen.queryByRole('radio', { name: 'Flip' })).toBeNull();
  });
});

describe('<NewGameScreen /> with a saved game', () => {
  it('asks before it ends the saved game', async () => {
    const user = userEvent.setup();
    const onStart = jest.fn();
    await render(
      <NewGameScreen
        mode="bot"
        initial={defaultSetup('bot')}
        botLevels={PORTES_ONLY(['easy'])}
        onBack={jest.fn()}
        onStart={onStart}
        hasSavedGame
      />,
    );

    await user.press(screen.getByRole('button', { name: 'Start game' }));
    expect(screen.getByText('Start a new game?')).toBeOnTheScreen();
    expect(screen.getByText('Your saved game will end.')).toBeOnTheScreen();
    await user.press(screen.getByTestId('dialog-cancel'));
    expect(onStart).not.toHaveBeenCalled();
    expect(screen.queryByText('Start a new game?')).toBeNull();

    await user.press(screen.getByRole('button', { name: 'Start game' }));
    await user.press(screen.getByRole('button', { name: 'Start new' }));
    expect(onStart).toHaveBeenCalledWith(defaultSetup('bot'));
  });
});

describe('<NewGameScreen /> game picker (#109)', () => {
  const EVERY_GAME = gameLevels(['easy', 'medium']);

  it('offers every game vs a bot that plays them all', async () => {
    const user = userEvent.setup();
    const { ui, onStart } = show('bot', EVERY_GAME);
    await render(ui);

    expect(screen.getByRole('radio', { name: /^Portes/ })).toBeChecked();
    for (const name of [/^Plakoto/, /^Fevga/, /^Tavli/]) {
      expect(screen.getByRole('radio', { name })).not.toBeChecked();
    }
    expect(
      screen.getByRole('radio', {
        name: 'Tavli, Τάβλι · all three in turn: Portes, Plakoto, Fevga',
      }),
    ).toBeOnTheScreen();
    // Asodio is on the board since #124.
    expect(screen.getByRole('radio', { name: /^Asodio/ })).not.toBeChecked();
    expect(screen.queryByText('More games are coming soon.')).toBeNull();

    await user.press(screen.getByRole('radio', { name: /^Tavli/ }));
    expect(screen.getByRole('radio', { name: /^Tavli/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^Portes/ })).not.toBeChecked();
    await user.press(screen.getByRole('button', { name: 'Start game' }));
    expect(onStart).toHaveBeenCalledWith({ ...defaultSetup('bot'), game: 'tavli' });
  });

  it('locks a game the bot has no level for, and Tavli with it', async () => {
    const user = userEvent.setup();
    const { ui, onStart } = show('bot', gameLevels(['easy'], { plakoto: [], tavli: [] }));
    await render(ui);

    expect(screen.getByRole('radio', { name: /^Fevga/ })).toBeOnTheScreen();
    expect(screen.queryByRole('radio', { name: /^Plakoto/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Plakoto' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Tavli' })).toBeDisabled();
    expect(screen.getByText('More games are coming soon.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Tavli' }));
    expect(screen.getByTestId('toast')).toHaveTextContent('Coming soon: Tavli');

    await user.press(screen.getByRole('radio', { name: /^Fevga/ }));
    await user.press(screen.getByRole('button', { name: 'Start game' }));
    expect(onStart.mock.calls[0][0].game).toBe('fevga');
  });

  it('shows the bot levels of the chosen game', async () => {
    const user = userEvent.setup();
    const levels = gameLevels(['easy', 'medium'], { plakoto: ['easy'], tavli: ['easy'] });
    const { ui, onStart } = show('bot', levels, { ...defaultSetup('bot'), botLevel: 'medium' });
    await render(ui);

    expect(screen.getByRole('radio', { name: 'Medium' })).toBeChecked();
    await user.press(screen.getByRole('radio', { name: /^Plakoto/ }));
    // Plakoto has no Medium bot: it shows locked and Easy plays.
    expect(screen.getByRole('radio', { name: 'Medium' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Easy' })).toBeChecked();
    await user.press(screen.getByRole('button', { name: 'Start game' }));
    expect(onStart.mock.calls[0][0]).toMatchObject({ game: 'plakoto', botLevel: 'easy' });

    // Back to Portes: Medium comes back, as the player chose it.
    await user.press(screen.getByRole('radio', { name: /^Portes/ }));
    expect(screen.getByRole('radio', { name: 'Medium' })).toBeChecked();
  });

  it('opens every built game in pass-and-play, even with no bot for them', async () => {
    const user = userEvent.setup();
    const { ui, onStart } = show('local', PORTES_ONLY(['easy']));
    await render(ui);

    for (const name of [/^Portes/, /^Plakoto/, /^Fevga/, /^Tavli/, /^Asodio/]) {
      expect(screen.getByRole('radio', { name })).toBeOnTheScreen();
    }
    await user.press(screen.getByRole('radio', { name: /^Plakoto/ }));
    await user.press(screen.getByRole('button', { name: 'Start game' }));
    expect(onStart).toHaveBeenCalledWith({ ...defaultSetup('local'), game: 'plakoto' });
    await user.press(screen.getByRole('radio', { name: /^Asodio/ }));
    await user.press(screen.getByRole('button', { name: 'Start game' }));
    expect(onStart).toHaveBeenLastCalledWith({ ...defaultSetup('local'), game: 'asodio' });
  });

  it('starts from the last game', async () => {
    const { ui } = show('local', EVERY_GAME, { ...defaultSetup('local'), game: 'fevga' });
    await render(ui);
    expect(screen.getByRole('radio', { name: /^Fevga/ })).toBeChecked();
  });

  it('opens the rules of a game from its card, without choosing it', async () => {
    const user = userEvent.setup();
    const onRules = jest.fn();
    await render(
      <NewGameScreen
        mode="local"
        initial={defaultSetup('local')}
        botLevels={EVERY_GAME}
        onBack={jest.fn()}
        onStart={jest.fn()}
        onRules={onRules}
      />,
    );
    await user.press(screen.getByRole('button', { name: 'How to play Tavli' }));
    expect(onRules).toHaveBeenCalledWith('tavli');
    expect(screen.getByRole('radio', { name: /^Portes/ })).toBeChecked();
  });
});
