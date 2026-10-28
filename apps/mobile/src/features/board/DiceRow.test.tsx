import { render, screen } from '@testing-library/react-native';
import { getTheme } from '@tavli/themes';
import { View } from 'react-native';

import type { DieView } from '@/features/game/gameStore';

import { DiceRow } from './DiceRow';

import { nativeParent } from '../../../test/nativeParent';
import { findAllNodes, type JsonNode } from '../../../test/tree';

const theme = getTheme('walnut-kafeneio');
const fours: DieView[] = [4, 4, 4, 4].map((value) => ({ value: value as 4, used: false }));

/** Each die is a Group that moves (`transform`); where it is now. */
function drawnDice() {
  const tree = screen.toJSON() as JsonNode | JsonNode[] | null;
  return findAllNodes(tree, (n) => n.type === 'Group' && n.props.transform !== undefined).map(
    (n) => {
      const steps = (n.props.transform as { value: Record<string, number>[] }).value;
      return { x: steps[0]!.translateX!, y: steps[1]!.translateY! };
    },
  );
}
const dice: DieView[] = [
  { value: 5, used: false },
  { value: 2, used: true },
];

/** The dice in a view that hides its content from screen readers, like a covered game screen. */
function Covered({ hidden }: { hidden: boolean }) {
  return (
    <View
      testID="cover"
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      accessibilityElementsHidden={hidden}>
      <View>
        <DiceRow testID="dice" theme={theme} dice={dice} rollKey="1:3" />
      </View>
    </View>
  );
}

describe('DiceRow', () => {
  it('says the values and how many dice are left', async () => {
    await render(<Covered hidden={false} />);
    expect(screen.getByTestId('dice')).toHaveAccessibleName('Dice 5-2, 1 left to play');
  });

  // On iOS a Skia canvas that moves to another native parent loses its drawing (#173).
  it('keeps its canvas in the same native view when a view around it hides its content', async () => {
    await render(<Covered hidden={false} />);
    const canvas = screen.getByTestId('dice');
    const parent = nativeParent(canvas);
    expect(parent?.type).toBe('View');
    expect(parent?.props.collapsable).toBe(false);

    await screen.rerender(<Covered hidden />);
    const hidden = screen.getByTestId('dice', { includeHiddenElements: true });
    expect(hidden === canvas).toBe(true);
    expect(nativeParent(hidden) === parent).toBe(true);
  });

  describe('a double (#177)', () => {
    it('at rest shows the four dice at once', async () => {
      await render(
        <DiceRow testID="dice" theme={theme} dice={fours} rollKey={null} split={false} />,
      );
      expect(drawnDice()).toHaveLength(4);
    });

    it('shows the two rolled dice, then splits into four in the same canvas', async () => {
      const onLanded = jest.fn();
      const row = (split: boolean) => (
        <DiceRow
          testID="dice"
          theme={theme}
          dice={fours}
          rollKey="1:4"
          split={split}
          onLanded={onLanded}
        />
      );
      await render(row(false));
      const pair = drawnDice();
      expect(pair).toHaveLength(2);
      // Side by side, like any roll.
      expect(pair[0]!.y).toBe(pair[1]!.y);
      // The second rolled die is the last to land.
      expect(onLanded).toHaveBeenCalledTimes(1);
      const canvas = screen.getByTestId('dice');
      const parent = nativeParent(canvas);

      await screen.rerender(row(true));
      // The mock runs the slide at once: the four dice are in the 2 x 2 grid.
      const grid = drawnDice();
      expect(grid).toHaveLength(4);
      expect(grid[0]!.y).toBe(grid[1]!.y);
      expect(grid[2]!.y).toBeGreaterThan(grid[0]!.y);
      expect(grid[2]!.x).toBe(grid[0]!.x);
      // No new roll: the dice did not land again.
      expect(onLanded).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('dice') === canvas).toBe(true);
      expect(nativeParent(screen.getByTestId('dice')) === parent).toBe(true);
      expect(screen.getByTestId('dice')).toHaveAccessibleName('Dice 4-4-4-4, 4 left to play');
    });
  });
});
