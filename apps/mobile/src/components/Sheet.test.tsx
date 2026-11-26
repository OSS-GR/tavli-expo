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

  it('a parent that keeps the sheet open after the drag gets it back in place', async () => {
    // The game screen holds its sheet while a call is on its way.
    const onClose = jest.fn();
    await shown('raised', onClose);
    await touch('sheet-handle-pan', [
      { x: 20, y: 10 },
      { x: 20, y: 60 },
      { x: 22, y: 10 + DRAG_CLOSE_DISTANCE + 5 },
    ]);
    expect(onClose).toHaveBeenCalledTimes(1);
    // The mock's animated style is read at render: render again to read it.
    await screen.rerender(
      <Sheet visible onClose={onClose} closeLabel="Close" look="raised" testID="the-sheet">
        <Text>Inside</Text>
      </Sheet>,
    );
    expect(offset()).toBe(0);
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

describe('<Sheet /> header and footer (#711)', () => {
  it('keeps the header and the footer out of the scrolling content', async () => {
    await renderWithRoot(
      <Sheet
        visible
        onClose={() => undefined}
        closeLabel="Close"
        look="raised"
        header={<Text>Head</Text>}
        footer={<Text>Foot</Text>}>
        <Text>Inside</Text>
      </Sheet>,
    );
    const scroll = screen.getByTestId('sheet-scroll');
    const inScroll = (text: string) => {
      for (let node = screen.getByText(text).parent; node !== null; node = node.parent) {
        if (node === scroll) return true;
      }
      return false;
    };
    expect(inScroll('Inside')).toBe(true);
    expect(inScroll('Head')).toBe(false);
    expect(inScroll('Foot')).toBe(false);
  });
});
