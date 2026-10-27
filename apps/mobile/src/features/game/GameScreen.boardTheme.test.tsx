import { createSeededRng } from '@tavli/engine';
import { getTheme } from '@tavli/themes';
import { act, fireEvent, screen } from '@testing-library/react-native';

import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';

import { createGameStore } from './gameStore';
import { GameScreen } from './GameScreen';

import { renderWithRoot } from '../../../test/render';
import { findAllNodes, type JsonNode } from '../../../test/tree';

const SIZE = { width: 375, height: 500 };

/** The colors the board canvas fills its points and checkers with. */
function boardColors(): Set<string> {
  const [canvas] = findAllNodes(
    screen.toJSON() as JsonNode,
    (n) => n.props['testID'] === 'game-board-canvas',
  );
  return new Set(
    findAllNodes(canvas ?? null, (n) => typeof n.props['color'] === 'string').map(
      (n) => n.props['color'] as string,
    ),
  );
}

beforeEach(async () => {
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS });
  });
});

describe('<GameScreen /> board theme', () => {
  it('draws the board picked in Settings → Board', async () => {
    await act(async () => {
      settingsStore.getState().setSetting('boardTheme', 'olive-inlay');
    });
    const store = createGameStore({
      players: { white: 'Ann', black: 'Bob' },
      rng: createSeededRng(5),
    });
    await renderWithRoot(<GameScreen store={store} />);
    await act(async () => {
      fireEvent(screen.getByTestId('game-board'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, ...SIZE } },
      });
    });

    const olive = getTheme('olive-inlay');
    const walnut = getTheme('walnut-kafeneio');
    const colors = boardColors();
    for (const c of [olive.points.dark.fill, olive.points.light.fill, olive.checkers.light.fill]) {
      expect(colors.has(c)).toBe(true);
    }
    for (const c of [walnut.points.dark.fill, walnut.points.light.fill]) {
      expect(colors.has(c)).toBe(false);
    }
  });
});
