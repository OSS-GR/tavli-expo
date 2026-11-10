import { screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { renderWithRoot } from '../../test/render';
import { ProblemDialog } from './Problem';
import { Sheet } from './Sheet';

const problem = { title: 'That did not work', text: 'Try again later.' };

/** The fill and border of a sheet box, if it has one. */
function boxOf(testID: string) {
  const style = StyleSheet.flatten(screen.getByTestId(testID).props.style as never) as {
    backgroundColor?: string;
    borderWidth?: number;
    overflow?: string;
  };
  return {
    backgroundColor: style.backgroundColor,
    borderWidth: style.borderWidth,
    overflow: style.overflow,
  };
}

describe('<ProblemDialog /> (#480)', () => {
  it('shows the problem card alone, with no sheet box around it', async () => {
    await renderWithRoot(<ProblemDialog problem={problem} okLabel="OK" onOk={jest.fn()} />);
    expect(screen.getByRole('header', { name: 'That did not work' })).toBeOnTheScreen();
    expect(boxOf('problem-sheet')).toEqual({
      backgroundColor: undefined,
      borderWidth: undefined,
      overflow: 'visible',
    });
  });
});

describe('<Sheet /> looks', () => {
  it('a dialog has its own box; bare has none', async () => {
    const { rerender } = await renderWithRoot(
      <Sheet visible onClose={jest.fn()} closeLabel="Close" look="dialog" testID="sheet">
        <Text>Inside</Text>
      </Sheet>,
    );
    expect(boxOf('sheet').backgroundColor).toBeDefined();
    expect(boxOf('sheet').borderWidth).toBe(1);
    await rerender(
      <Sheet visible onClose={jest.fn()} closeLabel="Close" look="bare" testID="sheet">
        <Text>Inside</Text>
      </Sheet>,
    );
    expect(boxOf('sheet')).toEqual({
      backgroundColor: undefined,
      borderWidth: undefined,
      overflow: 'visible',
    });
  });
});
