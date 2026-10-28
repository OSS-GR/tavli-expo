import { act, render, screen, userEvent, within } from '@testing-library/react-native';

import { createBot } from '@tavli/bot';
import type { Difficulty } from '@tavli/contracts';

import { botLevelsByGame } from '@/features/bot/levels';
import { defaultSetup, gameLevels, type GameLevels, type MatchMode } from '@/features/match/setup';
import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';
import i18n from '@/i18n';

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
    expect(onRules).toHaveBeenCalledWith('portes', 'portes');
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

  it('offers Hard for Portes but not for Tavli, like the bot today (#147)', async () => {
    const user = userEvent.setup();
    const levels = gameLevels(['easy', 'medium'], { portes: ['easy', 'medium', 'hard'] });
    const { ui, onStart } = show('bot', levels);
    await render(ui);

    expect(screen.getByRole('radio', { name: 'Hard' })).toBeEnabled();
    expect(screen.queryByText('Hard is coming soon.')).toBeNull();
    await user.press(screen.getByRole('radio', { name: 'Hard' }));
    expect(screen.getByText('Hard plays like a strong player.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Start game' }));
    expect(onStart.mock.calls[0][0]).toMatchObject({ game: 'portes', botLevel: 'hard' });

    // Tavli needs Hard in all three games: it shows locked, and Easy plays.
    await user.press(screen.getByRole('radio', { name: /^Tavli/ }));
    expect(screen.getByRole('radio', { name: 'Hard' })).toBeDisabled();
    expect(screen.getByText('Hard is coming soon.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Start game' }));
    expect(onStart.mock.calls[1][0]).toMatchObject({ game: 'tavli', botLevel: 'easy' });
  });

  it('offers Hard for Tavli and Asodio with the real bot: every game has it (#156, #164)', async () => {
    const user = userEvent.setup();
    const { ui, onStart } = show('bot', botLevelsByGame(createBot()));
    await render(ui);

    await user.press(screen.getByRole('radio', { name: /^Tavli/ }));
    expect(screen.getByRole('radio', { name: 'Hard' })).toBeEnabled();
    await user.press(screen.getByRole('radio', { name: 'Hard' }));
    await user.press(screen.getByRole('button', { name: 'Start game' }));
    expect(onStart.mock.calls[0][0]).toMatchObject({ game: 'tavli', botLevel: 'hard' });

    // Asodio has Hard too (#164).
    await user.press(screen.getByRole('radio', { name: /^Asodio/ }));
    expect(screen.getByRole('radio', { name: 'Hard' })).toBeEnabled();
    expect(screen.queryByText('Hard is coming soon.')).toBeNull();
    await user.press(screen.getByRole('radio', { name: 'Hard' }));
    await user.press(screen.getByRole('button', { name: 'Start game' }));
    expect(onStart.mock.calls[1][0]).toMatchObject({ game: 'asodio', botLevel: 'hard' });
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
    expect(onRules).toHaveBeenCalledWith('tavli', 'tavli');
    expect(screen.getByRole('radio', { name: /^Portes/ })).toBeChecked();
  });
});

describe('<NewGameScreen /> house rules (#207)', () => {
  it('starts with the federation rule and says what it does', async () => {
    const user = userEvent.setup();
    const { ui, onStart } = show('bot');
    await render(ui);

    expect(screen.getByRole('header', { name: 'House rules' })).toBeOnTheScreen();
    expect(screen.getByText('Opening roll')).toBeOnTheScreen();
    expect(screen.getByTestId('new-game-opening-roll')).toHaveProp(
      'accessibilityLabel',
      'Opening roll',
    );
    expect(screen.getByRole('radio', { name: 'Opening roll: Standard' })).toBeChecked();
    expect(
      screen.getByText(
        'Each player rolls one die. The higher die starts and plays both dice. The federation rule.',
      ),
    ).toBeOnTheScreen();
    // The old "Who starts?" box is gone: the hint says it now.
    expect(screen.queryByText('Who starts?')).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Start game' }));
    expect(onStart.mock.calls[0][0].openingRoll).toBe('useOpeningDice');
  });

  it('vs bot: picks "roll again" or "choose", with their hints', async () => {
    const user = userEvent.setup();
    const { ui, onStart } = show('bot');
    await render(ui);

    await user.press(screen.getByRole('radio', { name: 'Opening roll: Roll again' }));
    expect(screen.getByRole('radio', { name: 'Opening roll: Roll again' })).toBeChecked();
    expect(
      screen.getByText(
        'Each player rolls one die. The higher die starts and rolls both dice again, so a double is possible.',
      ),
    ).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Start game' }));
    expect(onStart).toHaveBeenLastCalledWith({ ...defaultSetup('bot'), openingRoll: 'rerollBoth' });

    await user.press(screen.getByRole('radio', { name: 'Opening roll: Choose' }));
    expect(
      screen.getByText('You choose who starts: you or the bot. That player rolls both dice.'),
    ).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Start game' }));
    expect(onStart.mock.calls[1][0].openingRoll).toBe('chosenStarterRolls');
  });

  it('pass-and-play: the players choose who starts', async () => {
    const user = userEvent.setup();
    const { ui, onStart } = show('local');
    await render(ui);
    await user.press(screen.getByRole('radio', { name: 'Opening roll: Choose' }));
    expect(
      screen.getByText('You choose who starts. That player rolls both dice.'),
    ).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Start game' }));
    expect(onStart).toHaveBeenCalledWith({
      ...defaultSetup('local'),
      openingRoll: 'chosenStarterRolls',
    });
  });

  it('starts from the last choice', async () => {
    const { ui } = show('local', PORTES_ONLY(['easy']), {
      ...defaultSetup('local'),
      openingRoll: 'rerollBoth',
    });
    await render(ui);
    expect(screen.getByRole('radio', { name: 'Opening roll: Roll again' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Opening roll: Standard' })).not.toBeChecked();
  });

  it('Greek: the section, the choices and a hint', async () => {
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    try {
      const { ui } = show('bot');
      await render(ui);
      expect(screen.getByRole('header', { name: 'Κανόνες καφενείου' })).toBeOnTheScreen();
      expect(screen.getByText('Πρώτη ζαριά')).toBeOnTheScreen();
      for (const name of ['Κανονικά', 'Ξαναρίχνει', 'Διαλέγουμε']) {
        expect(screen.getByRole('radio', { name: `Πρώτη ζαριά: ${name}` })).toBeOnTheScreen();
      }
      expect(screen.getByText(/Κανόνας της ομοσπονδίας\.$/)).toBeOnTheScreen();
    } finally {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    }
  });
});

describe('<NewGameScreen /> rules version (#241)', () => {
  const EVERY_GAME = gameLevels(['easy', 'medium']);
  const versions = () => screen.getByTestId('new-game-rules-version');
  /** A version radio: screen readers hear its group first (#243). */
  const option = (name: string, group = 'Rules version') =>
    within(versions()).getByRole('radio', { name: `${group}: ${name}` });
  const hint = () => screen.getByTestId('new-game-rules-version-hint');

  it('shows the choice only for Plakoto and Asodio', async () => {
    const user = userEvent.setup();
    const { ui } = show('bot', EVERY_GAME);
    await render(ui);
    expect(screen.queryByTestId('new-game-rules-version')).toBeNull();
    for (const game of ['Fevga', 'Tavli', 'Portes']) {
      await user.press(screen.getByRole('radio', { name: new RegExp(`^${game}`) }));
      expect(screen.queryByTestId('new-game-rules-version')).toBeNull();
    }
    await user.press(screen.getByRole('radio', { name: /^Plakoto/ }));
    expect(versions()).toHaveProp('accessibilityLabel', 'Rules version');
    expect(screen.getByText('Rules version')).toBeOnTheScreen();
    expect(
      within(versions())
        .getAllByRole('radio')
        .map((r) => r.props.accessibilityLabel),
    ).toEqual(['Rules version: Standard', 'Rules version: Federation']);
    await user.press(screen.getByRole('radio', { name: /^Asodio/ }));
    expect(
      within(versions())
        .getAllByRole('radio')
        .map((r) => r.props.accessibilityLabel),
    ).toEqual(['Rules version: Standard', 'Rules version: Greek', 'Rules version: American']);
  });

  it('keeps the default presets unless a version is picked', async () => {
    const user = userEvent.setup();
    const { ui, onStart } = show('local', EVERY_GAME);
    await render(ui);
    await user.press(screen.getByRole('radio', { name: /^Plakoto/ }));
    expect(option('Standard')).toBeChecked();
    expect(hint()).toHaveTextContent(
      'If your mother is pinned, you choose: resign (2 points) or play on.',
    );
    await user.press(screen.getByRole('button', { name: 'Start game' }));
    expect(onStart).toHaveBeenLastCalledWith({ ...defaultSetup('local'), game: 'plakoto' });
  });

  it('picks Federation for Plakoto and a version for Asodio, each with its hint', async () => {
    const user = userEvent.setup();
    const { ui, onStart } = show('bot', EVERY_GAME);
    await render(ui);

    await user.press(screen.getByRole('radio', { name: /^Plakoto/ }));
    await user.press(option('Federation'));
    expect(option('Federation')).toBeChecked();
    expect(option('Standard')).not.toBeChecked();
    expect(hint()).toHaveTextContent(
      'Federation rules: pin the mother and win 2 points once your own point 24 is empty. Both mothers pinned: a draw.',
    );

    // Asodio keeps its own choice.
    await user.press(screen.getByRole('radio', { name: /^Asodio/ }));
    expect(option('Standard')).toBeChecked();
    expect(hint()).toHaveTextContent(/^Kafeneio rules: all 15 enter first/);
    await user.press(option('Greek'));
    expect(hint()).toHaveTextContent(/^Acey-Deucey, Greek rules: you hit, not pin\./);
    await user.press(option('American'));
    expect(hint()).toHaveTextContent(/1 point per checker left\.$/);
    await user.press(option('Greek'));

    // Back to Plakoto: Federation is still picked.
    await user.press(screen.getByRole('radio', { name: /^Plakoto/ }));
    expect(option('Federation')).toBeChecked();

    await user.press(screen.getByRole('button', { name: 'Start game' }));
    expect(onStart).toHaveBeenLastCalledWith({
      ...defaultSetup('bot'),
      game: 'plakoto',
      rulesVersions: { plakoto: 'plakoto.federation', asodio: 'asodio.aceyDeuceyGreek' },
    });
  });

  it('starts from the last choice', async () => {
    const { ui } = show('local', EVERY_GAME, {
      ...defaultSetup('local'),
      game: 'asodio',
      rulesVersions: { plakoto: 'plakoto', asodio: 'asodio.aceyDeuceyAmerican' },
    });
    await render(ui);
    expect(option('American')).toBeChecked();
  });

  it('opens the rules of a game in its chosen version', async () => {
    const user = userEvent.setup();
    const onRules = jest.fn();
    await render(
      <NewGameScreen
        mode="local"
        initial={{
          ...defaultSetup('local'),
          rulesVersions: { plakoto: 'plakoto.federation', asodio: 'asodio.kafeneio' },
        }}
        botLevels={EVERY_GAME}
        onBack={jest.fn()}
        onStart={jest.fn()}
        onRules={onRules}
      />,
    );
    await user.press(screen.getByRole('button', { name: 'How to play Plakoto' }));
    expect(onRules).toHaveBeenLastCalledWith('plakoto', 'plakoto.federation');
    await user.press(screen.getByRole('button', { name: 'How to play Asodio' }));
    expect(onRules).toHaveBeenLastCalledWith('asodio', 'asodio.kafeneio');
  });

  it('Greek: the label, the choices and a hint', async () => {
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    try {
      const user = userEvent.setup();
      const { ui } = show('local', EVERY_GAME);
      await render(ui);
      await user.press(screen.getByRole('radio', { name: /^Πλακωτό/ }));
      expect(screen.getByText('Παραλλαγή')).toBeOnTheScreen();
      expect(versions()).toHaveProp('accessibilityLabel', 'Παραλλαγή');
      for (const name of ['Κανονική', 'Ομοσπονδίας']) {
        expect(option(name, 'Παραλλαγή')).toBeOnTheScreen();
      }
      await user.press(screen.getByRole('radio', { name: /^Ασόδιο/ }));
      for (const name of ['Κανονική', 'Ελληνική', 'Αμερικάνικη']) {
        expect(option(name, 'Παραλλαγή')).toBeOnTheScreen();
      }
      await user.press(option('Ελληνική', 'Παραλλαγή'));
      expect(hint()).toHaveTextContent(/^Ελληνικοί κανόνες: χτυπάς, δεν πλακώνεις\./);
    } finally {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    }
  });
});

describe('<NewGameScreen /> house rule names for screen readers (#243)', () => {
  const EVERY_GAME = gameLevels(['easy', 'medium']);
  const names = (testID: string) =>
    within(screen.getByTestId(testID))
      .getAllByRole('radio')
      .map((radio) => radio.props.accessibilityLabel as string);

  const LANGUAGES = [
    {
      language: 'en',
      opening: ['Opening roll: Standard', 'Opening roll: Roll again', 'Opening roll: Choose'],
      plakoto: ['Rules version: Standard', 'Rules version: Federation'],
      asodio: ['Rules version: Standard', 'Rules version: Greek', 'Rules version: American'],
    },
    {
      language: 'el',
      opening: ['Πρώτη ζαριά: Κανονικά', 'Πρώτη ζαριά: Ξαναρίχνει', 'Πρώτη ζαριά: Διαλέγουμε'],
      plakoto: ['Παραλλαγή: Κανονική', 'Παραλλαγή: Ομοσπονδίας'],
      asodio: ['Παραλλαγή: Κανονική', 'Παραλλαγή: Ελληνική', 'Παραλλαγή: Αμερικάνικη'],
    },
  ] as const;

  describe.each(LANGUAGES)('$language', ({ language, opening, plakoto, asodio }) => {
    beforeEach(async () => {
      await act(async () => {
        await i18n.changeLanguage(language);
      });
    });
    afterEach(async () => {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    });

    it.each([
      ['bot', 'plakoto'],
      ['local', 'plakoto'],
      ['bot', 'asodio'],
      ['local', 'asodio'],
    ] as const)('%s, %s: every house rule radio names its group', async (mode, game) => {
      const { ui } = show(mode, EVERY_GAME, { ...defaultSetup(mode), game });
      await render(ui);
      expect(names('new-game-opening-roll')).toEqual(opening);
      expect(names('new-game-rules-version')).toEqual(game === 'plakoto' ? plakoto : asodio);
      // No two radios on New game share a name (game, length, level, board view too).
      const all = screen
        .getAllByRole('radio')
        .map((radio) => radio.props.accessibilityLabel as string);
      expect(new Set(all).size).toBe(all.length);
    });
  });

  it('keeps the visible text short and the selected state', async () => {
    const user = userEvent.setup();
    const { ui, onStart } = show('bot', EVERY_GAME, { ...defaultSetup('bot'), game: 'plakoto' });
    await render(ui);
    // Both groups still show a plain "Standard".
    expect(screen.getAllByText('Standard')).toHaveLength(2);
    expect(screen.queryByText(/^Opening roll: /)).toBeNull();
    expect(screen.queryByText(/^Rules version: /)).toBeNull();

    const openingStandard = () => screen.getByRole('radio', { name: 'Opening roll: Standard' });
    const versionStandard = () => screen.getByRole('radio', { name: 'Rules version: Standard' });
    expect(openingStandard()).toBeChecked();
    expect(versionStandard()).toBeChecked();

    await user.press(screen.getByRole('radio', { name: 'Rules version: Federation' }));
    expect(screen.getByRole('radio', { name: 'Rules version: Federation' })).toBeChecked();
    expect(versionStandard()).not.toBeChecked();
    expect(openingStandard()).toBeChecked();

    await user.press(screen.getByRole('radio', { name: 'Opening roll: Choose' }));
    expect(screen.getByRole('radio', { name: 'Opening roll: Choose' })).toBeChecked();
    expect(openingStandard()).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Rules version: Federation' })).toBeChecked();

    await user.press(screen.getByRole('button', { name: 'Start game' }));
    expect(onStart).toHaveBeenLastCalledWith({
      ...defaultSetup('bot'),
      game: 'plakoto',
      openingRoll: 'chosenStarterRolls',
      rulesVersions: { ...defaultSetup('bot').rulesVersions, plakoto: 'plakoto.federation' },
    });
  });
});
