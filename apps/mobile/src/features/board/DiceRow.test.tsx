import { render, screen } from '@testing-library/react-native';
import { getTheme } from '@tavli/themes';
import { View } from 'react-native';

import type { DieView } from '@/features/game/gameStore';

import { DiceRow } from './DiceRow';

import { nativeParent } from '../../../test/nativeParent';

const theme = getTheme('walnut-kafeneio');
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
});
