import { screen, userEvent } from '@testing-library/react-native';
import { themes } from '@tavli/ui';

import { renderWithRoot } from '../../../test/render';
import { SegmentedControl } from './SegmentedControl';

const { colors } = themes['walnut-kafeneio'];

describe('<SegmentedControl />', () => {
  it('draws the picked segment as a brass pill', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await renderWithRoot(
      <SegmentedControl
        testID="length"
        label="Match length"
        options={[
          { value: '1', label: '1' },
          { value: '3', label: '3' },
          { value: '5', label: '5', disabled: true, accessibilityHint: 'Coming soon' },
        ]}
        value="3"
        onChange={onChange}
      />,
    );
    expect(screen.getByTestId('length')).toHaveStyle({
      backgroundColor: colors.backgroundDeep,
    });
    const picked = screen.getByRole('radio', { name: '3' });
    expect(picked).toBeChecked();
    expect(picked).toHaveStyle({ backgroundColor: colors.accent, minHeight: 44 });
    expect(screen.getByText('3')).toHaveStyle({ color: colors.onAccent });
    expect(screen.getByRole('radio', { name: '5' })).toBeDisabled();
    await user.press(screen.getByRole('radio', { name: '1' }));
    expect(onChange).toHaveBeenCalledWith('1');
  });
});
