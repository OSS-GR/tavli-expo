import * as Skia from '@shopify/react-native-skia';
import { act, renderHook } from '@testing-library/react-native';
import { getLayout, getTheme } from '@tavli/themes';

import { THEME_IMAGES } from './themeImages';
import {
  clearBoardImageCache,
  layoutImageKeys,
  UNPACKED_CACHE_SIZE,
  useBoardImages,
} from './useBoardAssets';

const walnut = getTheme('walnut-kafeneio');
const olive = getTheme('olive-inlay');
const tall = (theme: typeof walnut) => getLayout(theme, 'portrait-rotated');
const wide = (theme: typeof walnut) => getLayout(theme, 'landscape');

/** Every image of every bundled theme. */
const ALL_IMAGES = Object.values(THEME_IMAGES).flatMap((images) => Object.keys(images)).length;

/**
 * Each load gives a new fake packed image, and each unpack a new copy, so a
 * test can tell a cached image from a fresh one.
 */
let loads = 0;
let unpacks = 0;
const fakeImage = () => {
  const load = ++loads;
  return { load, makeNonTextureImage: () => ({ load, unpacked: ++unpacks }) } as never;
};
const loadData = jest.spyOn(Skia, 'loadData');

beforeEach(() => {
  clearBoardImageCache();
  loads = 0;
  unpacks = 0;
  loadData.mockReset();
  loadData.mockImplementation(() => Promise.resolve(fakeImage()));
});

afterAll(() => {
  clearBoardImageCache();
  loadData.mockRestore();
});

/** Mounts a board; `first` is what its first render drew. */
async function mountBoard(theme: typeof walnut, layout = tall(theme)) {
  const renders: object[] = [];
  const hook = await renderHook(() => {
    const images = useBoardImages(theme, layout);
    renders.push(images);
    return images;
  });
  await act(async () => {});
  return { hook, first: renders[0] };
}

describe('useBoardImages', () => {
  it('draws plain colors first, then the images', async () => {
    const { hook, first } = await mountBoard(walnut);
    expect(first).toEqual({});
    expect(Object.keys(hook.result.current).sort()).toEqual(
      layoutImageKeys(walnut, tall(walnut)).sort(),
    );
  });

  it('shows the images on the first frame when the board opens again', async () => {
    const opened = await mountBoard(walnut);
    const images = opened.hook.result.current;
    await opened.hook.unmount();

    const again = await mountBoard(walnut);
    expect(again.first).toEqual(images);
  });

  it('loads every theme once, so a new theme or layout shows at once', async () => {
    const { hook } = await mountBoard(walnut);
    await hook.unmount();
    // The first board loads its own images, then every other image, each once.
    expect(loadData).toHaveBeenCalledTimes(ALL_IMAGES);

    for (const [theme, layout] of [
      [olive, tall(olive)],
      [olive, wide(olive)],
      [walnut, wide(walnut)],
    ] as const) {
      const board = await mountBoard(theme, layout);
      expect(Object.keys(board.first!).sort()).toEqual(layoutImageKeys(theme, layout).sort());
      await board.hook.unmount();
    }
    expect(loadData).toHaveBeenCalledTimes(ALL_IMAGES);
  });

  it('switches theme on the same frame, with no other theme in between', async () => {
    await (await mountBoard(walnut)).hook.unmount();
    const renders: object[] = [];
    let theme = walnut;
    const hook = await renderHook(() => {
      const images = useBoardImages(theme, tall(theme));
      renders.push(images);
      return images;
    });
    theme = olive;
    await hook.rerender({});
    const after = renders.at(-1)!;
    expect(Object.keys(after).sort()).toEqual(layoutImageKeys(olive, tall(olive)).sort());
  });

  it('keeps a failed load out of the cache, so the next board tries again', async () => {
    loadData.mockImplementation(() => Promise.resolve(null));
    const failed = await mountBoard(walnut);
    await failed.hook.unmount();
    loadData.mockImplementation(() => Promise.resolve(fakeImage()));

    const again = await mountBoard(walnut);
    expect(again.first).toEqual({});
    expect(Object.keys(again.hook.result.current).sort()).toEqual(
      layoutImageKeys(walnut, tall(walnut)).sort(),
    );
    expect(Object.values(again.hook.result.current).every((i) => i !== null)).toBe(true);
  });

  it('draws unpacked copies, and keeps only the most recent ones', async () => {
    const { hook } = await mountBoard(walnut);
    expect(Object.values(hook.result.current).every((i) => 'unpacked' in (i as object))).toBe(true);
    await hook.unmount();

    // Each wide board draws 4 images: the three themes fill the cache, and
    // Walnut's tall board was used before them, so it is unpacked again.
    expect(layoutImageKeys(walnut, wide(walnut))).toHaveLength(UNPACKED_CACHE_SIZE / 3);
    for (const theme of [walnut, olive, getTheme('kafeneio-night')]) {
      await (await mountBoard(theme, wide(theme))).hook.unmount();
    }
    const before = unpacks;
    await (await mountBoard(olive, wide(olive))).hook.unmount();
    expect(unpacks).toBe(before);
    await (await mountBoard(walnut)).hook.unmount();
    expect(unpacks).toBeGreaterThan(before);
  });
});
