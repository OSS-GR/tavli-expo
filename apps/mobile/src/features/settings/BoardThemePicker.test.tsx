import { getTheme } from '@tavli/themes';
import { act, fireEvent, render, screen, userEvent, within } from '@testing-library/react-native';

import i18n from '@/i18n';

import { findAllNodes, type JsonNode } from '../../../test/tree';

import { DEFAULT_SETTINGS } from './settings';
import { SettingsScreen } from './SettingsScreen';
import { settingsStore } from './store';

const olive = getTheme('olive-inlay');
const walnut = getTheme('walnut-kafeneio');
const night = getTheme('kafeneio-night');

/** Point fills drawn inside one canvas. */
function pointFills(canvasTestID: string): string[] {
  const [canvas] = findAllNodes(
    screen.toJSON() as JsonNode,
    (n) => n.props['testID'] === canvasTestID,
  );
  const fills = findAllNodes(
    canvas ?? null,
    (n) => n.type === 'Path' && typeof n.props['color'] === 'string' && !n.props['style'],
  ).map((n) => n.props['color'] as string);
  return [...new Set(fills)].sort();
}

async function layout(testID: string) {
  await act(async () => {
    // The preview is hidden from screen readers, so the query must include hidden elements.
    fireEvent(screen.getByTestId(testID, { includeHiddenElements: true }), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 64, height: 104 } },
    });
  });
}

beforeEach(async () => {
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS });
    await i18n.changeLanguage('en');
  });
});

describe('Settings → Board', () => {
  it('lists every board with a preview in its own theme, and saves the choice', async () => {
    const user = userEvent.setup();
    await render(<SettingsScreen />);

    expect(screen.getByRole('header', { name: 'Board' })).toBeOnTheScreen();
    expect(within(screen.getByTestId('settings-board-theme')).getAllByRole('radio')).toHaveLength(
      3,
    );
    const walnutRow = screen.getByRole('radio', { name: 'Walnut Kafeneio' });
    const oliveRow = screen.getByRole('radio', { name: 'Olive Inlay' });
    const nightRow = screen.getByRole('radio', { name: 'Kafeneio Night' });
    expect(walnutRow).toBeChecked();
    expect(oliveRow).not.toBeChecked();
    expect(nightRow).not.toBeChecked();

    // Each preview draws its own theme, whatever the saved choice is.
    const sortedFills = (t: typeof olive) => [t.points.dark.fill, t.points.light.fill].sort();
    for (const theme of [walnut, olive, night]) {
      await layout(`settings-board-theme-${theme.id}-preview`);
      expect(pointFills(`settings-board-theme-${theme.id}-preview-canvas`)).toEqual(
        sortedFills(theme),
      );
    }

    await user.press(oliveRow);
    expect(settingsStore.getState().boardTheme).toBe('olive-inlay');
    expect(screen.getByRole('radio', { name: 'Olive Inlay' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Walnut Kafeneio' })).not.toBeChecked();

    await user.press(nightRow);
    expect(settingsStore.getState().boardTheme).toBe('kafeneio-night');
    expect(screen.getByRole('radio', { name: 'Kafeneio Night' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Olive Inlay' })).not.toBeChecked();
    // The app colors are a separate setting.
    expect(settingsStore.getState().theme).toBe(DEFAULT_SETTINGS.theme);
  });

  it('names the boards in Greek', async () => {
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    await render(<SettingsScreen />);

    expect(screen.getByRole('header', { name: 'Ταμπλό' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: olive.name.el })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: walnut.name.el })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: night.name.el })).toBeOnTheScreen();
  });
});
