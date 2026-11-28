/**
 * The grab handle of the raised sheet (#652): a drag down past
 * `DRAG_CLOSE_DISTANCE` closes the sheet, a shorter one springs it back.
 */
import { act, screen } from '@testing-library/react-native';
import { DeviceEventEmitter, StyleSheet, Text } from 'react-native';

import { touch } from '../../test/gestureHandlerMock';
import { renderWithRoot } from '../../test/render';
import { LANDSCAPE_SE, resetWindow, setWindow } from '../../test/window';
import { DRAG_CLOSE_DISTANCE, SIDE_PANEL_WIDTH, Sheet } from './Sheet';

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

describe('<Sheet side /> (#716)', () => {
  afterEach(resetWindow);

  const panel = () =>
    renderWithRoot(
      <Sheet
        visible
        onClose={() => undefined}
        closeLabel="Close"
        look="raised"
        side
        testID="the-sheet">
        <Text>Inside</Text>
      </Sheet>,
    );
  const sheetStyle = () =>
    StyleSheet.flatten(screen.getByTestId('the-sheet').props.style as never) as {
      width?: number | string;
      height?: number | string;
    };

  it('is a panel at the right, with no grab handle, when the window is wider than tall', async () => {
    await panel();
    await setWindow(LANDSCAPE_SE);
    expect(sheetStyle()).toMatchObject({ width: SIDE_PANEL_WIDTH, height: '100%' });
    expect(screen.queryByTestId('sheet-handle', { includeHiddenElements: true })).toBeNull();
  });

  it('stays a bottom sheet with its handle in a tall window', async () => {
    await panel();
    expect(sheetStyle().width).toBe('100%');
    expect(screen.getByTestId('sheet-handle', { includeHiddenElements: true })).toBeTruthy();
  });
});

describe('<Sheet /> for the chat (#720)', () => {
  afterEach(resetWindow);

  const chat = () =>
    renderWithRoot(
      <Sheet
        visible
        onClose={() => undefined}
        closeLabel="Close"
        look="raised"
        side
        sideHint="Tap here to go back"
        maxHeight={0.55}
        testID="the-sheet">
        <Text>Inside</Text>
      </Sheet>,
    );
  const maxHeight = () =>
    (
      StyleSheet.flatten(screen.getByTestId('the-sheet').props.style as never) as {
        maxHeight?: number | string;
      }
    ).maxHeight;

  it('takes at most its share of the height in a tall window, with no side line', async () => {
    await chat();
    expect(maxHeight()).toBe('55%');
    expect(screen.queryByText('Tap here to go back', { includeHiddenElements: true })).toBeNull();
  });

  it('is as tall as the window as a side panel, with the line beside it', async () => {
    await chat();
    await setWindow(LANDSCAPE_SE);
    expect(maxHeight()).toBe('100%');
    expect(screen.getByText('Tap here to go back', { includeHiddenElements: true })).toBeTruthy();
  });
});

describe('<Sheet /> while the keyboard shows (#729)', () => {
  afterEach(async () => {
    await act(async () => {
      DeviceEventEmitter.emit('keyboardDidHide', {});
    });
    await resetWindow();
  });

  const keyboard = (shown: boolean) =>
    act(async () => {
      DeviceEventEmitter.emit(shown ? 'keyboardDidShow' : 'keyboardDidHide', {});
    });
  const chat = () =>
    renderWithRoot(
      <Sheet
        visible
        onClose={() => undefined}
        closeLabel="Close"
        look="raised"
        side
        maxHeight={0.55}
        header={<Text>Head</Text>}
        footer={<Text>Foot</Text>}
        testID="the-sheet">
        <Text>Inside</Text>
      </Sheet>,
    );
  const maxHeight = () =>
    (
      StyleSheet.flatten(screen.getByTestId('the-sheet').props.style as never) as {
        maxHeight?: number | string;
      }
    ).maxHeight;

  it('takes all the room over the keyboard in a tall window, and its limit again after', async () => {
    await chat();
    expect(maxHeight()).toBe('55%');
    await keyboard(true);
    expect(maxHeight()).toBe('100%');
    // The header stays in a tall window.
    expect(screen.getByText('Head')).toBeTruthy();
    await keyboard(false);
    expect(maxHeight()).toBe('55%');
  });

  it('hides the header of a side panel while the keyboard shows', async () => {
    await chat();
    await setWindow(LANDSCAPE_SE);
    expect(screen.getByText('Head')).toBeTruthy();
    await keyboard(true);
    expect(screen.queryByText('Head')).toBeNull();
    expect(screen.getByText('Foot')).toBeTruthy();
    await keyboard(false);
    expect(screen.getByText('Head')).toBeTruthy();
  });
});
