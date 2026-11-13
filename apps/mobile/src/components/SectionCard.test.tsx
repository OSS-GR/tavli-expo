import { screen, userEvent } from '@testing-library/react-native';
import { themes } from '@tavli/ui';
import { StyleSheet, Text } from 'react-native';

import { renderWithRoot } from '../../test/render';
import { textScalingProblems } from '../../test/textScaling';
import { findAllNodes, type JsonNode } from '../../test/tree';
import { SectionCard, SectionRow } from './SectionCard';
import { OptionList } from './settings/OptionList';
import { ToggleRow } from './settings/ToggleRow';

const problems = () => textScalingProblems(screen.toJSON() as JsonNode | JsonNode[] | null);

describe('<SectionCard />', () => {
  it('shows the title as a section header over a tray', async () => {
    await renderWithRoot(
      <SectionCard title="Sound and feel" testID="card">
        <SectionRow label="Sound" />
      </SectionCard>,
    );
    expect(screen.getByRole('header', { name: 'Sound and feel' })).toBeOnTheScreen();
    expect(screen.getByText('Sound and feel')).toBeOnTheScreen();
    expect(screen.getByTestId('card')).toHaveStyle({ borderRadius: 16 });
  });

  it('puts a line between rows, and none for a hidden row', async () => {
    const { rerender } = await renderWithRoot(
      <SectionCard>
        <SectionRow label="One" testID="row-1" />
        {null}
        <SectionRow label="Two" testID="row-2" />
        {false}
        <SectionRow label="Three" testID="row-3" />
      </SectionCard>,
    );
    const lines = () =>
      findAllNodes(
        screen.toJSON() as JsonNode | JsonNode[] | null,
        (node) =>
          (StyleSheet.flatten(node.props['style'] as never) as { height?: number } | undefined)
            ?.height === 1,
      ).length;
    expect(lines()).toBe(2);
    await rerender(
      <SectionCard>
        <SectionRow label="One" />
      </SectionCard>,
    );
    expect(lines()).toBe(0);
  });

  it('pads one block instead of rows', async () => {
    await renderWithRoot(
      <SectionCard title="Match length" padded>
        <Text>Picker</Text>
        <Text>First to 3 points.</Text>
      </SectionCard>,
    );
    expect(screen.getByText('Picker')).toBeOnTheScreen();
    expect(screen.getByText('First to 3 points.')).toBeOnTheScreen();
  });
});

describe('<SectionRow />', () => {
  it('is one button with the label and the value when it opens more', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await renderWithRoot(
      <SectionCard>
        <SectionRow
          icon="globe"
          label="Language"
          hint="The app's language"
          value="English"
          onPress={onPress}
          testID="language"
        />
      </SectionCard>,
    );
    const row = screen.getByRole('button', { name: 'Language, English' });
    expect(row.props.accessibilityHint).toBe("The app's language");
    expect(row).toHaveStyle({ minHeight: 56 });
    await user.press(row);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(problems()).toEqual([]);
  });

  it('can be a link, or a disabled button (#360)', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await renderWithRoot(
      <SectionCard>
        <SectionRow label="Privacy policy" accessibilityRole="link" onPress={jest.fn()} />
        <SectionRow label="Clear history" disabled onPress={onPress} />
      </SectionCard>,
    );
    expect(screen.getByRole('link', { name: 'Privacy policy' })).toBeEnabled();
    const clear = screen.getByRole('button', { name: 'Clear history' });
    expect(clear).toBeDisabled();
    await user.press(clear);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows a risky action in coral, and dims it when disabled (#515)', async () => {
    const { colors } = themes['walnut-kafeneio'];
    await renderWithRoot(
      <SectionCard>
        <SectionRow label="Resign this game" icon="flag" tone="danger" onPress={jest.fn()} />
        <SectionRow
          label="Resign the match"
          icon="flag"
          tone="danger"
          disabled
          onPress={jest.fn()}
        />
      </SectionCard>,
    );
    expect(screen.getByText('Resign this game')).toHaveStyle({ color: colors.problem });
    expect(screen.getByText('Resign the match')).toHaveStyle({ color: colors.textDisabled });
  });

  it('is not a button without onPress', async () => {
    await renderWithRoot(<SectionRow label="Version" value="1.0" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('1.0')).toBeOnTheScreen();
  });
});

describe('rows in a SectionCard', () => {
  it('draws a ToggleRow as a card row', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    await renderWithRoot(
      <SectionCard title="Game">
        <ToggleRow
          testID="hints"
          icon="graduation"
          label="Show hints"
          value={false}
          onValueChange={onChange}
        />
      </SectionCard>,
    );
    const row = screen.getByRole('switch', { name: 'Show hints' });
    expect(row).toHaveStyle({ paddingHorizontal: 16 });
    expect(row).not.toHaveStyle({ borderBottomWidth: expect.any(Number) as number });
    await user.press(row);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('flips a ToggleRow once on a tap on its switch: the switch takes no touches', async () => {
    await renderWithRoot(
      <ToggleRow testID="hints" label="Show hints" value={false} onValueChange={jest.fn()} />,
    );
    // The native switch would flip the value, and the row's tap would flip it back.
    const box = screen.getByTestId('hints-switch', { includeHiddenElements: true });
    expect(box).toHaveProp('pointerEvents', 'none');
  });

  it('keeps the line under a ToggleRow outside a card', async () => {
    await renderWithRoot(<ToggleRow label="Sound" value onValueChange={jest.fn()} />);
    expect(screen.getByRole('switch', { name: 'Sound' })).not.toHaveStyle({
      paddingHorizontal: 16,
    });
  });

  it('marks the picked option with a check, in a card or alone', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    const options = [
      { value: 'en', label: 'English' },
      { value: 'el', label: 'Ελληνικά', hint: 'Greek' },
    ] as const;
    await renderWithRoot(
      <OptionList
        testID="lang"
        label="Language"
        options={options}
        value="en"
        onChange={onChange}
      />,
    );
    expect(screen.getByTestId('lang')).toHaveProp('accessibilityRole', 'radiogroup');
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Ελληνικά' })).not.toBeChecked();
    await user.press(screen.getByRole('radio', { name: 'Ελληνικά' }));
    expect(onChange).toHaveBeenCalledWith('el');
    expect(problems()).toEqual([]);
  });
});
