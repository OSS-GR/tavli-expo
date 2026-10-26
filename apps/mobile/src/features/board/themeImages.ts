/**
 * Theme images for Metro.
 *
 * Metro can only bundle images named in a literal `require()`. The theme
 * manifest names its images as data, so this file maps every manifest
 * image key to its `require`. Metro picks the @2x / @3x file by itself.
 *
 * Add a block here when you add a theme. A test checks that every image of
 * every bundled theme is in this map.
 */

/** Metro asset ids by theme id, then by manifest image key. */
export const THEME_IMAGES: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  'walnut-kafeneio': {
    boardPortrait: require('@tavli/themes/walnut-kafeneio/board-portrait.webp'),
    shadePortrait: require('@tavli/themes/walnut-kafeneio/shade-portrait.webp'),
    boardLandscape: require('@tavli/themes/walnut-kafeneio/board-landscape.webp'),
    shadeLandscape: require('@tavli/themes/walnut-kafeneio/shade-landscape.webp'),
    pointEbony: require('@tavli/themes/walnut-kafeneio/point-ebony.webp'),
    pointBone: require('@tavli/themes/walnut-kafeneio/point-bone.webp'),
  },
};
