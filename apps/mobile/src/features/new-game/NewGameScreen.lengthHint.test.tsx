/**
 * The match length hint follows the scoring of the chosen rules (#245):
 * mono and diplo for Tavli scoring, 1 point per checker left for
 * Acey-Deucey American (`scoring.method: 'perChecker'`).
 */
import { act, render, screen, userEvent, within } from '@testing-library/react-native';

import { defaultSetup, gameLevels, gameScoring } from '@/features/match/setup';
import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';
import i18n from '@/i18n';

import { NewGameScreen } from './NewGameScreen';

const EVERY_GAME = gameLevels(['easy', 'medium']);

function show(initial = defaultSetup('local')) {
  return (
    <NewGameScreen
      mode="local"
      initial={initial}
      botLevels={EVERY_GAME}
      onBack={jest.fn()}
      onStart={jest.fn()}
    />
  );
}

const lengthHint = () => screen.getByTestId('new-game-length-hint');
// Each version radio names its group first ("Rules version: Greek", #243).
const version = (name: string) =>
  within(screen.getByTestId('new-game-rules-version')).getByRole('radio', {
    name: new RegExp(`: ${name}$`),
  });

beforeEach(async () => {
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS });
  });
});

describe('gameScoring', () => {
  it('reads the scoring method of the chosen preset', () => {
    for (const game of ['portes', 'plakoto', 'fevga', 'tavli', 'asodio'] as const) {
      expect(gameScoring(game)).toBe('tavli');
    }
    const versions = defaultSetup('local').rulesVersions;
    expect(gameScoring('plakoto', { ...versions, plakoto: 'plakoto.federation' })).toBe('tavli');
    expect(gameScoring('asodio', { ...versions, asodio: 'asodio.aceyDeuceyGreek' })).toBe('tavli');
    expect(gameScoring('asodio', { ...versions, asodio: 'asodio.aceyDeuceyAmerican' })).toBe(
      'perChecker',
    );
    // The version of another game changes nothing.
    expect(gameScoring('portes', { ...versions, asodio: 'asodio.aceyDeuceyAmerican' })).toBe(
      'tavli',
    );
  });
});

describe('<NewGameScreen /> match length hint (#245)', () => {
  it('says 1 point per checker left only for Acey-Deucey American', async () => {
    const user = userEvent.setup();
    await render(show());
    const tavli = 'First to 3 points. Mono = 1, diplo = 2.';
    expect(lengthHint()).toHaveTextContent(tavli);

    await user.press(screen.getByRole('radio', { name: /^Asodio/ }));
    expect(lengthHint()).toHaveTextContent(tavli);
    await user.press(version('Greek'));
    expect(lengthHint()).toHaveTextContent(tavli);
    await user.press(version('American'));
    expect(lengthHint()).toHaveTextContent('First to 3 points. 1 point per checker left.');
    await user.press(screen.getByRole('radio', { name: '1' }));
    expect(lengthHint()).toHaveTextContent('First to 1 point. 1 point per checker left.');

    // Another game, with Asodio American still picked: mono and diplo again.
    for (const game of ['Portes', 'Plakoto', 'Fevga', 'Tavli']) {
      await user.press(screen.getByRole('radio', { name: new RegExp(`^${game}`) }));
      expect(lengthHint()).toHaveTextContent('First to 1 point. Mono = 1, diplo = 2.');
    }
    await user.press(screen.getByRole('radio', { name: /^Asodio/ }));
    await user.press(version('Standard'));
    expect(lengthHint()).toHaveTextContent('First to 1 point. Mono = 1, diplo = 2.');
  });

  it('starts from a saved American choice with the per-checker hint', async () => {
    await render(
      show({
        ...defaultSetup('local'),
        game: 'asodio',
        targetPoints: 7,
        rulesVersions: { plakoto: 'plakoto', asodio: 'asodio.aceyDeuceyAmerican' },
      }),
    );
    expect(lengthHint()).toHaveTextContent('First to 7 points. 1 point per checker left.');
  });

  it('Greek: the per-checker hint, and mono and diplo for the other versions', async () => {
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    try {
      const user = userEvent.setup();
      await render(show());
      expect(lengthHint()).toHaveTextContent(
        'Νικά όποιος φτάσει τους 3 βαθμούς. Μονό = 1, διπλό = 2.',
      );
      await user.press(screen.getByRole('radio', { name: /^Ασόδιο/ }));
      await user.press(version('Αμερικάνικη'));
      expect(lengthHint()).toHaveTextContent(
        'Νικά όποιος φτάσει τους 3 βαθμούς. 1 βαθμός για κάθε πούλι που μένει.',
      );
      await user.press(screen.getByRole('radio', { name: '1' }));
      expect(lengthHint()).toHaveTextContent(
        'Νικά όποιος φτάσει τον 1 βαθμό. 1 βαθμός για κάθε πούλι που μένει.',
      );
      await user.press(version('Ελληνική'));
      expect(lengthHint()).toHaveTextContent(
        'Νικά όποιος φτάσει τον 1 βαθμό. Μονό = 1, διπλό = 2.',
      );
    } finally {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    }
  });
});
