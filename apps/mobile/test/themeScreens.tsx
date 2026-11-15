/**
 * Home and the game screen in one app theme (#528). Each theme has its own
 * test file (`src/theme/themeScreens.<id>.test.tsx`) that calls
 * `themeScreenTests(id)`.
 *
 * Unistyles' Jest mock styles a screen with the first theme it knows, when
 * the screen's module loads, and `useUnistyles()` returns that theme too.
 * So this puts the theme first, and only then loads the screens. That is
 * why it needs a file per theme: a module loads once per file.
 */
import { createSeededRng } from '@tavli/engine';
import { themes, type ThemeId } from '@tavli/ui';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { runOnFakeTimers } from './clock';
import { renderWithRoot } from './render';
import { findAllNodes, type JsonNode } from './tree';

type Registry = { themes: Record<string, unknown> };

/** Every color in the `style` props of the rendered tree. */
function styleColors(): Set<string> {
  const tree = screen.toJSON() as JsonNode | JsonNode[] | null;
  const colors = new Set<string>();
  for (const node of findAllNodes(tree, (n) => n.props['style'] !== undefined)) {
    const style = StyleSheet.flatten(node.props['style'] as never) as Record<string, unknown>;
    for (const value of Object.values(style ?? {})) {
      if (typeof value === 'string' && value.startsWith('#')) colors.add(value.toUpperCase());
    }
  }
  return colors;
}

/** The screen shows this theme's colors, and no other theme's background. */
function expectThemeColors(id: ThemeId): void {
  const colors = styleColors();
  expect(colors).toContain(themes[id].colors.text);
  for (const other of Object.values(themes)) {
    if (other.id !== id) expect(colors).not.toContain(other.colors.background);
  }
}

export function themeScreenTests(id: ThemeId): void {
  const registry = (globalThis as { __UNISTYLES_MOCK_REGISTRY__?: Registry })
    .__UNISTYLES_MOCK_REGISTRY__;
  if (registry === undefined) throw new Error('The Unistyles Jest mock is not loaded');
  registry.themes = { [id]: themes[id], ...themes };

  // Loaded only now, with the theme first.
  const { HomeScreen } = jest.requireActual<typeof import('@/features/home/HomeScreen')>(
    '@/features/home/HomeScreen',
  );
  const { GameScreen } = jest.requireActual<typeof import('@/features/game/GameScreen')>(
    '@/features/game/GameScreen',
  );
  const { createGameStore } = jest.requireActual<typeof import('@/features/game/gameStore')>(
    '@/features/game/gameStore',
  );

  // The game screen closes cards on timers (see test/clock.ts).
  runOnFakeTimers();

  describe(`${id} app colors`, () => {
    it('draws Home', async () => {
      await renderWithRoot(
        <HomeScreen
          onNewGame={jest.fn()}
          onSettings={jest.fn()}
          onHowToPlay={jest.fn()}
          botLevels={['easy', 'medium']}
        />,
      );
      expect(screen.getByTestId('home-vs-bot')).toBeOnTheScreen();
      expectThemeColors(id);
    });

    it('draws the game screen', async () => {
      const store = createGameStore({
        players: { white: 'Maria', black: 'Bob' },
        rng: createSeededRng(1),
      });
      await renderWithRoot(<GameScreen store={store} onOpenMenu={jest.fn()} onHome={jest.fn()} />);
      await act(async () => {
        fireEvent(screen.getByTestId('game-board', { includeHiddenElements: true }), 'layout', {
          nativeEvent: { layout: { x: 0, y: 0, width: 375, height: 520 } },
        });
      });
      expect(screen.getByTestId('opening-card')).toBeOnTheScreen();
      expect(screen.getByTestId('roll-button')).toBeOnTheScreen();
      expectThemeColors(id);
    });
  });
}
