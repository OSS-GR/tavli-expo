// The island side of a phone on its side (#611): the wide board takes the
// margin away from the island. `expo-screen-orientation` is the fake in
// `test/screenOrientationMock.ts`.
import { act, renderHook } from '@testing-library/react-native';
import { Orientation } from 'expo-screen-orientation';

import { setOrientation } from '../../../test/screenOrientationMock';

import { OPEN_SIDE_MARGIN, islandSideOf, sideMargins, useIslandSide } from './islandSide';

const IPHONE = { left: 62, right: 62 };

describe('islandSideOf', () => {
  it('puts the island on the right in landscape left, on the left in landscape right', () => {
    expect(islandSideOf(Orientation.LANDSCAPE_LEFT)).toBe('right');
    expect(islandSideOf(Orientation.LANDSCAPE_RIGHT)).toBe('left');
    expect(islandSideOf(Orientation.PORTRAIT_UP)).toBeNull();
    expect(islandSideOf(Orientation.UNKNOWN)).toBeNull();
  });
});

describe('sideMargins', () => {
  it('keeps the inset on the island side and trims the other side', () => {
    expect(sideMargins(IPHONE, 'left', 4)).toEqual({ left: 62, right: OPEN_SIDE_MARGIN });
    expect(sideMargins(IPHONE, 'right', 4)).toEqual({ left: OPEN_SIDE_MARGIN, right: 62 });
  });

  it('keeps both insets when the side is unknown', () => {
    expect(sideMargins(IPHONE, null, 4)).toEqual(IPHONE);
  });

  it('keeps both insets when they differ: they already name the camera side', () => {
    const duo = { left: 0, right: 84 };
    expect(sideMargins(duo, 'left', 4)).toEqual({ left: 4, right: 84 });
    expect(sideMargins(duo, 'right', 4)).toEqual({ left: 4, right: 84 });
  });

  it('never goes under the least margin, and never adds to a small inset', () => {
    expect(sideMargins({ left: 0, right: 0 }, 'left', 4)).toEqual({ left: 4, right: 4 });
    expect(sideMargins({ left: 10, right: 10 }, 'left', 4)).toEqual({ left: 10, right: 10 });
  });
});

describe('useIslandSide', () => {
  it('follows the phone as it turns', async () => {
    const { result } = await renderHook(() => useIslandSide());
    expect(result.current).toBeNull();
    await act(async () => {
      setOrientation(Orientation.LANDSCAPE_LEFT);
    });
    expect(result.current).toBe('right');
    await act(async () => {
      setOrientation(Orientation.LANDSCAPE_RIGHT);
    });
    expect(result.current).toBe('left');
  });
});
