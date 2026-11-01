import { screen, userEvent } from '@testing-library/react-native';
import { themes } from '@tavli/ui';

import { renderWithRoot } from '../../test/render';
import { ActionButton } from './ActionButton';

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
    await user.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('draws the second button on the surface with a border', async () => {
    await renderWithRoot(<ActionButton kind="secondary" label="Home" onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Home' })).toHaveStyle({
      backgroundColor: colors.surface,
      borderColor: colors.border,
    });
  });

  it('draws a disabled button dashed and ignores presses', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await renderWithRoot(<ActionButton label="Undo" disabled onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Undo' });
    expect(button).toBeDisabled();
    expect(button).toHaveStyle({ borderStyle: 'dashed', backgroundColor: 'transparent' });
    await user.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});
