import { screen, userEvent } from '@testing-library/react-native';
import { themes } from '@tavli/ui';

import { renderWithRoot } from '../../test/render';
import { PORTRAIT_SE, resetWindow, setWindow } from '../../test/window';
import { ActionButton, ICON_ONLY_LABEL_SCALE } from './ActionButton';

const { colors } = themes['walnut-kafeneio'];

describe('<ActionButton />', () => {
  it('draws the main button with the brass gradient', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await renderWithRoot(<ActionButton label="Start game" onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Start game' });
    expect(button).toHaveStyle({
      backgroundImage: `linear-gradient(160deg, ${colors.accentLight} 0%, ${colors.accent} 70%)`,
      minHeight: 52,
    });
    expect(screen.getByText('Start game')).toHaveStyle({ color: colors.onAccent });
    await user.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('draws the second button raised with a brass hairline', async () => {
    await renderWithRoot(<ActionButton kind="secondary" label="Copy code" onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Copy code' })).toHaveStyle({
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.accentLine,
    });
    expect(screen.getByText('Copy code')).toHaveStyle({ color: colors.text });
  });

  it('draws a text button as brass text with no frame', async () => {
    await renderWithRoot(<ActionButton kind="text" label="See all" onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'See all' })).toHaveStyle({
      backgroundColor: 'transparent',
    });
    expect(screen.getByText('See all')).toHaveStyle({ color: colors.accentLight });
  });

  it('draws a destructive button with the red wash', async () => {
    await renderWithRoot(
      <ActionButton kind="destructive" label="Remove friend" onPress={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Remove friend' })).toHaveStyle({
      backgroundColor: colors.problemWash,
      borderColor: colors.problemLine,
    });
    expect(screen.getByText('Remove friend')).toHaveStyle({ color: colors.problem });
  });

  it('draws a destructive text button as coral text', async () => {
    await renderWithRoot(
      <ActionButton kind="destructiveText" label="Cancel the invite" onPress={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Cancel the invite' })).toHaveStyle({
      backgroundColor: 'transparent',
    });
    expect(screen.getByText('Cancel the invite')).toHaveStyle({ color: colors.problem });
  });

  it('draws a disabled main button flat, never dashed, and ignores presses', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await renderWithRoot(<ActionButton label="Confirm" disabled onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Confirm' });
    expect(button).toBeDisabled();
    expect(button).toHaveStyle({ backgroundColor: colors.accentMuted });
    expect(button).not.toHaveStyle({ borderStyle: 'dashed' });
    expect(screen.getByText('Confirm')).toHaveStyle({ color: colors.onAccentMuted });
    await user.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('draws a disabled second button sunken', async () => {
    await renderWithRoot(
      <ActionButton kind="secondary" label="Undo" disabled onPress={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveStyle({
      backgroundColor: colors.surfaceSunken,
    });
    expect(screen.getByText('Undo')).toHaveStyle({ color: colors.textFaint });
  });

  it('fades a disabled text button', async () => {
    await renderWithRoot(<ActionButton kind="text" label="See all" disabled onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'See all' })).toHaveStyle({ opacity: 0.45 });
  });

  it('shows a spinner while busy, says so and ignores presses', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await renderWithRoot(
      <ActionButton testID="send" label="Make an invite" busy onPress={onPress} />,
    );
    const button = screen.getByRole('button', { name: 'Make an invite' });
    expect(button).toBeBusy();
    expect(button).toBeDisabled();
    expect(screen.getByTestId('send-busy')).toBeOnTheScreen();
    // Busy keeps the normal look: it is not a disabled button.
    expect(button).toHaveStyle({ backgroundColor: colors.accent });
    await user.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  describe('iconOnly (#499)', () => {
    afterEach(async () => {
      await resetWindow();
    });

    it('draws a 52 pt square with only the icon; screen readers hear the label', async () => {
      // Jest's own window has font scale 2: set the normal size.
      await setWindow(PORTRAIT_SE);
      await renderWithRoot(
        <ActionButton
          testID="hint"
          kind="secondary"
          icon="lightbulb"
          iconOnly
          label="Hint"
          onPress={jest.fn()}
        />,
      );
      const button = screen.getByRole('button', { name: 'Hint' });
      expect(button).toHaveStyle({ width: 52, minHeight: 52 });
      expect(screen.queryByText('Hint')).toBeNull();
    });

    it('shows the label too with a large font', async () => {
      await setWindow({ ...PORTRAIT_SE, fontScale: ICON_ONLY_LABEL_SCALE });
      await renderWithRoot(
        <ActionButton
          kind="secondary"
          icon="lightbulb"
          iconOnly
          label="Hint"
          onPress={jest.fn()}
        />,
      );
      expect(screen.getByText('Hint')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Hint' })).not.toHaveStyle({ width: 52 });
    });
  });

  it('draws a small button 36 pt tall with a 44 pt hit area', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await renderWithRoot(
      <ActionButton
        testID="invite"
        kind="secondary"
        size="small"
        icon="link"
        label="Invite"
        onPress={onPress}
      />,
    );
    const button = screen.getByRole('button', { name: 'Invite' });
    expect(button).toHaveStyle({ minHeight: 36, borderRadius: 10 });
    expect(button.props.hitSlop).toEqual({ top: 4, bottom: 4, left: 0, right: 0 });
    expect(screen.getByText('Invite')).toHaveStyle({ fontSize: 15 });
    await user.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
