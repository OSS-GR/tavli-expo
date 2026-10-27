/**
 * Large system fonts (#134): Home, New game, the game screen and the end
 * screens follow the font size with no cut text. Jest cannot measure text,
 * so `textScalingProblems` checks the layout rules that keep text whole
 * (see `test/textScaling.ts`), in English and in Greek.
 */
import { createMatch, createSeededRng, recordGameResult, type Match } from '@tavli/engine';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { ContinueCard } from '@/features/home/ContinueCard';
import { HomeScreen } from '@/features/home/HomeScreen';
import { LearnCard } from '@/features/home/LearnCard';
import { createGameStore, type GameStore } from '@/features/game/gameStore';
import { GameScreen } from '@/features/game/GameScreen';
import { MatchEndScreen } from '@/features/match/MatchEndScreen';
import { defaultSetup } from '@/features/match/setup';
import { NewGameScreen } from '@/features/new-game/NewGameScreen';
import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';
import i18n from '@/i18n';

import { renderWithRoot } from '../../../test/render';
import { textScalingProblems } from '../../../test/textScaling';
import type { JsonNode } from '../../../test/tree';

const problems = () => textScalingProblems(screen.toJSON() as JsonNode | JsonNode[] | null);

const LANGUAGES = ['en', 'el'] as const;

beforeEach(async () => {
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS, moveList: 'on' });
  });
});

afterAll(async () => {
  await i18n.changeLanguage('en');
});

describe.each(LANGUAGES)('large system fonts (%s)', (language) => {
  beforeEach(async () => {
    await act(async () => {
      await i18n.changeLanguage(language);
    });
  });

  it('Home: no text in a fixed-height box, none cut to a line count', async () => {
    await renderWithRoot(
      <HomeScreen
        onNewGame={jest.fn()}
        onSettings={jest.fn()}
        onHowToPlay={jest.fn()}
        botLevels={['easy', 'medium']}
        continueCard={
          <ContinueCard
            summary={{ game: 'Portes · vs Bot (Easy)', status: 'You 1 – 0 Bot · first to 3' }}
            onPress={jest.fn()}
          />
        }
        learnCard={<LearnCard onStart={jest.fn()} onDismiss={jest.fn()} />}
      />,
    );
    expect(problems()).toEqual([]);
  });

  it.each(['bot', 'local'] as const)('New game (%s)', async (mode) => {
    await renderWithRoot(
      <NewGameScreen
        mode={mode}
        initial={defaultSetup(mode)}
        botLevels={{ portes: ['easy'], plakoto: [], fevga: [], tavli: [], asodio: [] }}
        onBack={jest.fn()}
        onStart={jest.fn()}
      />,
    );
    expect(problems()).toEqual([]);
  });

  async function showGame(store: GameStore) {
    await renderWithRoot(<GameScreen store={store} onOpenMenu={jest.fn()} onHome={jest.fn()} />);
    await act(async () => {
      fireEvent(screen.getByTestId('game-board'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 375, height: 520 } },
      });
    });
  }

  it('the game screen: opening, a turn with the move list, the game-end sheet', async () => {
    const store = createGameStore({
      players: { white: 'Maria Papadopoulou', black: 'Bob' },
      rng: createSeededRng(1),
    });
    await showGame(store);
    // The opening card.
    expect(screen.getByTestId('opening-card')).toBeOnTheScreen();
    expect(problems()).toEqual([]);

    // A turn: strips, move list, Undo · dice · Confirm.
    await act(async () => {
      store.getState().dispatch({ type: 'rollOpening', player: 'white', die: 5 });
      store.getState().dispatch({ type: 'rollOpening', player: 'black', die: 3 });
    });
    await waitFor(() => expect(screen.getByTestId('move-list')).toBeOnTheScreen(), {
      timeout: 3000,
    });
    expect(problems()).toEqual([]);

    // The game-end sheet.
    await act(async () => {
      store.getState().dispatch({ type: 'resign', player: 'black' });
    });
    expect(screen.getByTestId('game-end-card')).toBeOnTheScreen();
    expect(problems()).toEqual([]);
  });

  it('match end', async () => {
    let match: Match = createMatch({ targetPoints: 1, players: { white: 'a', black: 'b' } });
    match = recordGameResult(
      match,
      { winner: 'white', points: 2, reason: 'borneOff' },
      { starter: 'white' },
    );
    await renderWithRoot(
      <MatchEndScreen
        setup={defaultSetup('bot')}
        match={match}
        onRematch={jest.fn()}
        onChangeSettings={jest.fn()}
        onHome={jest.fn()}
      />,
    );
    expect(problems()).toEqual([]);
  });
});

describe('textScalingProblems', () => {
  it('finds cut text, fixed heights and text that does not scale', async () => {
    const { Text, View } = jest.requireActual<typeof import('react-native')>('react-native');
    await renderWithRoot(
      <View>
        <Text numberOfLines={1}>cut</Text>
        <View style={{ height: 40 }}>
          <Text>boxed</Text>
        </View>
        <Text allowFontScaling={false}>small</Text>
        {/* A decorative glyph may keep its size. */}
        <View style={{ height: 40 }}>
          <Text allowFontScaling={false} importantForAccessibility="no">
            ⚙
          </Text>
        </View>
        <View style={{ minHeight: 40 }}>
          <Text>fine</Text>
        </View>
      </View>,
    );
    expect(problems()).toEqual([
      '"cut" has numberOfLines',
      '"boxed" sits in a box with height 40',
      '"small" does not scale',
    ]);
  });
});
