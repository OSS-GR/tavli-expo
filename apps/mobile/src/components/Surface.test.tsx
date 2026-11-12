import { screen, userEvent } from '@testing-library/react-native';
import { themes } from '@tavli/ui';
import { Text } from 'react-native';

import { renderWithRoot } from '../../test/render';
import { textScalingProblems } from '../../test/textScaling';
import type { JsonNode } from '../../test/tree';
import { SectionHeader } from './SectionHeader';
import { Surface } from './Surface';

const { colors } = themes['walnut-kafeneio'];

describe('<Surface />', () => {
  it('draws a tray flat on the page with a lit top edge', async () => {
    await renderWithRoot(
      <Surface tier="tray" testID="tray">
        <Text>Waiting for your friend</Text>
      </Surface>,
    );
    expect(screen.getByTestId('tray')).toHaveStyle({
      backgroundColor: colors.surface,
      borderRadius: 16,
      boxShadow: `inset 0px 1px 0px ${colors.backgroundLamp}`,
    });
  });

  it('draws a raised card with a brass hairline and a deep shadow', async () => {
    await renderWithRoot(<Surface tier="raised" testID="raised" />);
    expect(screen.getByTestId('raised')).toHaveStyle({
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.accentLine,
      borderRadius: 20,
      boxShadow: `inset 0px 1px 0px ${colors.border}, 0px 12px 28px rgba(0, 0, 0, 0.45)`,
    });
  });

  it('draws a sunken surface below the page', async () => {
    await renderWithRoot(<Surface tier="sunken" testID="sunken" style={{ padding: 8 }} />);
    expect(screen.getByTestId('sunken')).toHaveStyle({
      backgroundColor: colors.surfaceSunken,
      padding: 8,
    });
  });
});

describe('<SectionHeader />', () => {
  it('reads the title as a header, in its own case', async () => {
    await renderWithRoot(<SectionHeader title="Οι φίλοι σου" count={3} />);
    expect(screen.getByRole('header', { name: 'Οι φίλοι σου' })).toHaveStyle({
      fontFamily: 'Piazzolla-SemiBold',
      fontSize: 17,
      color: colors.textDim,
    });
    expect(screen.getByText('3')).toHaveStyle({ color: colors.accentLight });
    expect(textScalingProblems(screen.toJSON() as JsonNode | JsonNode[] | null)).toEqual([]);
  });

  it('shows an action on the right', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await renderWithRoot(
      <SectionHeader
        title="Your online games"
        action={{ label: 'See all', onPress, testID: 'see-all' }}
      />,
    );
    await user.press(screen.getByRole('button', { name: 'See all' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
