import { act, render, screen, userEvent } from '@testing-library/react-native';

import { defaultSetup, type MatchMode } from '@/features/match/setup';
import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';

import { NewGameScreen } from './NewGameScreen';

function show(mode: MatchMode, botLevels: readonly ('easy' | 'medium' | 'hard')[] = ['easy']) {
  const onStart = jest.fn();
  const onBack = jest.fn();
  const ui = (
    <NewGameScreen
      mode={mode}
      initial={defaultSetup(mode)}
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
    const { ui, onStart } = show('bot', ['easy']);
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
    const { ui, onStart } = show('bot', ['easy', 'medium']);
    await render(ui);

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
        botLevels={['easy']}
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
        botLevels={['easy']}
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
