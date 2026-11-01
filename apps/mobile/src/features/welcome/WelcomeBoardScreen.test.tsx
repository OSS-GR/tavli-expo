/**
 * The board step of the welcome flow (#350) on its own: the three pickers
 * from Settings, the defaults picked, the live preview that follows each
 * pick, the buttons, and Greek. The flow around it is in
 * `welcomeFlow.test.tsx`.
 */
import { getTheme } from '@tavli/themes';
import { act, fireEvent, screen, userEvent, within } from '@testing-library/react-native';

import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';
import i18n from '@/i18n';

import { renderWithRoot } from '../../../test/render';
import { findAllNodes, type JsonNode } from '../../../test/tree';

import { WelcomeBoardScreen } from './WelcomeBoardScreen';

const PREVIEW = 'welcome-board-preview-board';

/** Gives the preview its size (Jest has no layout). It is hidden from screen readers. */
async function layoutPreview() {
  await act(async () => {
    fireEvent(screen.getByTestId(PREVIEW, { includeHiddenElements: true }), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 200 } },
    });
  });
}

/** The preview canvas as JSON, to see that a pick redraws it. */
function previewCanvas(): JsonNode | undefined {
  const [canvas] = findAllNodes(
    screen.toJSON() as JsonNode,
    (n) => n.props['testID'] === `${PREVIEW}-canvas`,
  );
  return canvas;
}

/** The point fills the preview draws. */
function pointFills(): string[] {
  const fills = findAllNodes(
    previewCanvas() ?? null,
    (n) => n.type === 'Path' && typeof n.props['color'] === 'string' && !n.props['style'],
  ).map((n) => n.props['color'] as string);
  return [...new Set(fills)].sort();
}

function renderScreen() {
  const onBack = jest.fn();
  const onContinue = jest.fn();
  return renderWithRoot(<WelcomeBoardScreen onBack={onBack} onContinue={onContinue} />).then(
    () => ({ onBack, onContinue }),
  );
}

beforeEach(async () => {
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS });
    await i18n.changeLanguage('en');
  });
});

afterAll(async () => {
  await i18n.changeLanguage('en');
});

describe('WelcomeBoardScreen', () => {
  it('shows the three choices with the defaults picked', async () => {
    await renderScreen();

    expect(screen.getByRole('header', { name: 'Set up your board' })).toBeOnTheScreen();
    expect(screen.getByText('Step 3 of 3')).toBeOnTheScreen();
    expect(screen.getByText(/You can change it later in Settings/)).toBeOnTheScreen();

    const themes = within(screen.getByTestId('welcome-board-theme')).getAllByRole('radio');
    expect(themes).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'Walnut Kafeneio' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Bottom right' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Bottom left' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Tall' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Classic' })).not.toBeChecked();
    // Each group has a name for screen readers.
    const groups = ['welcome-board-theme', 'welcome-board-home', 'welcome-board-layout'].map(
      (id) =>
        screen.getByTestId(id).props as { accessibilityRole: string; accessibilityLabel: string },
    );
    expect(groups).toEqual([
      expect.objectContaining({ accessibilityRole: 'radiogroup', accessibilityLabel: 'Board' }),
      expect.objectContaining({ accessibilityRole: 'radiogroup', accessibilityLabel: 'Your home' }),
      expect.objectContaining({
        accessibilityRole: 'radiogroup',
        accessibilityLabel: 'Board layout',
      }),
    ]);
  });

  it('saves each pick at once, and the preview follows it', async () => {
    const user = userEvent.setup();
    await renderScreen();
    await layoutPreview();
    const walnut = getTheme('walnut-kafeneio');
    const olive = getTheme('olive-inlay');
    const fillsOf = (t: typeof walnut) => [t.points.dark.fill, t.points.light.fill].sort();
    expect(pointFills()).toEqual(fillsOf(walnut));

    await user.press(screen.getByRole('radio', { name: 'Olive Inlay' }));
    expect(settingsStore.getState().boardTheme).toBe('olive-inlay');
    expect(screen.getByRole('radio', { name: 'Olive Inlay' })).toBeChecked();
    expect(pointFills()).toEqual(fillsOf(olive));

    const beforeSide = JSON.stringify(previewCanvas());
    await user.press(screen.getByRole('radio', { name: 'Bottom left' }));
    expect(settingsStore.getState().homeBoardSide).toBe('left');
    expect(screen.getByRole('radio', { name: 'Bottom left' })).toBeChecked();
    expect(JSON.stringify(previewCanvas())).not.toBe(beforeSide);

    const beforeLayout = JSON.stringify(previewCanvas());
    await user.press(screen.getByRole('radio', { name: 'Classic' }));
    expect(settingsStore.getState().boardLayout).toBe('classic');
    expect(screen.getByRole('radio', { name: 'Classic' })).toBeChecked();
    expect(JSON.stringify(previewCanvas())).not.toBe(beforeLayout);
  });

  it('hides the preview from screen readers', async () => {
    await renderScreen();
    expect(screen.queryByTestId('welcome-board-preview')).toBeNull();
    const preview = screen.getByTestId('welcome-board-preview', { includeHiddenElements: true });
    expect(preview.props.importantForAccessibility).toBe('no-hide-descendants');
    // It turns nothing on and off, but keeps its native parent all the same (#173).
    expect(preview.props.collapsable).toBe(false);
  });

  it('Continue and Back call the route', async () => {
    const user = userEvent.setup();
    const { onBack, onContinue } = await renderScreen();
    await user.press(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    // Continue keeps the defaults: the screen saves nothing by itself.
    expect(settingsStore.getState()).toMatchObject(DEFAULT_SETTINGS);
  });

  it('speaks Greek', async () => {
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    await renderScreen();
    expect(screen.getByRole('header', { name: 'Στήστε το ταμπλό σας' })).toBeOnTheScreen();
    expect(screen.getByText('Βήμα 3 από 3')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: getTheme('walnut-kafeneio').name.el })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Κάτω δεξιά' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Ψηλό' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Συνέχεια' })).toBeOnTheScreen();
  });
});
