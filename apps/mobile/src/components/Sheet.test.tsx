/**
 * The grab handle of the raised sheet (#652): a drag down past
 * `DRAG_CLOSE_DISTANCE` closes the sheet, a shorter one springs it back.
 */
import { screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { touch } from '../../test/gestureHandlerMock';
import { renderWithRoot } from '../../test/render';
import { DRAG_CLOSE_DISTANCE, Sheet } from './Sheet';

function shown(look: 'raised' | 'sheet', onClose: () => void) {
  return renderWithRoot(
    <Sheet visible onClose={onClose} closeLabel="Close" look={look} testID="the-sheet">
      <Text>Inside</Text>
    </Sheet>,
  );
}

/** How far down the sheet is drawn now. */
function offset(): number {
  const style = StyleSheet.flatten(screen.getByTestId('the-sheet').props.style as never) as {
    transform?: { translateY?: number }[];
  };
  return style.transform?.[0]?.translateY ?? 0;
}

describe('<Sheet /> grab handle (#652)', () => {
  it('a drag down past the distance closes the sheet', async () => {
    const onClose = jest.fn();
    await shown('raised', onClose);
    await touch('sheet-handle-pan', [
      { x: 20, y: 10 },
      { x: 20, y: 60 },
      { x: 22, y: 10 + DRAG_CLOSE_DISTANCE + 5 },
    ]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a short drag springs back and keeps the sheet open', async () => {
    const onClose = jest.fn();
    await shown('raised', onClose);
    await touch('sheet-handle-pan', [
      { x: 20, y: 10 },
      { x: 20, y: 10 + DRAG_CLOSE_DISTANCE - 20 },
    ]);
    expect(onClose).not.toHaveBeenCalled();
    expect(offset()).toBe(0);
  });

  it('a drag up does not lift the sheet, and a tap on the handle does nothing', async () => {
    const onClose = jest.fn();
    await shown('raised', onClose);
    await touch('sheet-handle-pan', [
      { x: 20, y: 200 },
      { x: 20, y: 40 },
    ]);
    await touch('sheet-handle-pan', [{ x: 20, y: 10 }]);
    expect(onClose).not.toHaveBeenCalled();
    expect(offset()).toBe(0);
  });

  it('only the raised look has the handle', async () => {
    await shown('sheet', jest.fn());
    expect(screen.queryByTestId('sheet-handle')).toBeNull();
    expect(screen.getByText('Inside')).toBeOnTheScreen();
  });
});
