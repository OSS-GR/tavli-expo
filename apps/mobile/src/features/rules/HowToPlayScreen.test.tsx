import { act, render, screen, within } from '@testing-library/react-native';

import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';
import type { LessonProgress } from '@/features/tutorial/progress';

import { HowToPlayScreen } from './HowToPlayScreen';

const fresh: LessonProgress = { status: 'new', learnt: 0 };
const progress = { portes: fresh, plakoto: fresh, fevga: fresh, asodio: fresh };

async function language(value: 'en' | 'el') {
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS, language: value });
  });
}

afterEach(async () => {
  await language('en');
});

describe('How to play hub: plain English (#574)', () => {
  it('gives each game its plain line and says how to say its name', async () => {
    await language('en');
    await render(<HowToPlayScreen progress={progress} onOpen={jest.fn()} />);
    const portes = within(screen.getByTestId('how-to-play-portes'));
    expect(portes.getByText('Classic backgammon')).toBeOnTheScreen();
    expect(portes.getByText(' · say POR-tes')).toBeOnTheScreen();
    expect(
      within(screen.getByTestId('how-to-play-tavli')).getByText(' · say TAV-lee'),
    ).toBeOnTheScreen();
    expect(
      within(screen.getByTestId('how-to-play-asodio')).getByText('All checkers enter first'),
    ).toBeOnTheScreen();
    // Screen readers hear the name and the line, not the spelling.
    expect(screen.getByTestId('how-to-play-plakoto')).toHaveAccessibleName(
      'How to play Plakoto, Pin, do not hit, 4 lessons',
    );
  });

  it('shows no spelling in Greek', async () => {
    await language('el');
    await render(<HowToPlayScreen progress={progress} onOpen={jest.fn()} />);
    expect(
      within(screen.getByTestId('how-to-play-portes')).getByText('Το κλασικό τάβλι'),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/POR-tes|προφέρεται/)).toBeNull();
  });
});
