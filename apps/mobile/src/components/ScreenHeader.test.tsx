import { screen, userEvent } from '@testing-library/react-native';
import { themes } from '@tavli/ui';
import { Text } from 'react-native';

import { renderWithRoot } from '../../test/render';
import { textScalingProblems } from '../../test/textScaling';
import type { JsonNode } from '../../test/tree';
import { RoundButton } from './RoundButton';
import { Screen, screenBackground } from './Screen';
import { ScreenHeader } from './ScreenHeader';

const problems = () => textScalingProblems(screen.toJSON() as JsonNode | JsonNode[] | null);

describe('<ScreenHeader />', () => {
  it('shows the title as a header and goes back', async () => {
    const user = userEvent.setup();
    const onBack = jest.fn();
    await renderWithRoot(
      <Screen testID="page">
        <ScreenHeader title="Settings" onBack={onBack} backLabel="Back" testID="settings-back" />
      </Screen>,
    );
    expect(screen.getByRole('header', { name: 'Settings' })).toBeOnTheScreen();
    const back = screen.getByRole('button', { name: 'Back' });
    expect(back).toBe(screen.getByTestId('settings-back'));
    expect(back).toHaveStyle({ width: 44, height: 44 });
    await user.press(back);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(problems()).toEqual([]);
  });

  it('has no back button without onBack', async () => {
    await renderWithRoot(<ScreenHeader title="Welcome" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('header', { name: 'Welcome' })).toBeOnTheScreen();
  });

  it('shows the right slot', async () => {
    const user = userEvent.setup();
    const onInfo = jest.fn();
    await renderWithRoot(
      <ScreenHeader
        title="History"
        onBack={jest.fn()}
        backLabel="Back"
        right={<RoundButton icon="book" accessibilityLabel="How to play" onPress={onInfo} />}
      />,
    );
    await user.press(screen.getByRole('button', { name: 'How to play' }));
    expect(onInfo).toHaveBeenCalledTimes(1);
  });
});

describe('<Screen />', () => {
  it('lights the page from the top and fades to the floor', async () => {
    await renderWithRoot(
      <Screen testID="page">
        <Text>Body</Text>
      </Screen>,
    );
    const { colors } = themes['walnut-kafeneio'];
    expect(screen.getByTestId('page')).toHaveStyle(screenBackground(colors));
    expect(screenBackground(colors).backgroundImage).toBe(
      `linear-gradient(180deg, ${colors.backgroundLamp} 0%, ${colors.background} 38%, ${colors.backgroundFloor} 100%)`,
    );
  });
});
