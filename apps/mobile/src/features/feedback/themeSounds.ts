/**
 * Theme sounds for Metro.
 *
 * Metro can only bundle files named in a literal `require()`. The theme
 * manifest names its sounds as data, so this file maps every sound file of a
 * theme to its `require`. A test checks that every sound file of every
 * bundled theme is in this map.
 */

/** Metro asset ids by theme id, then by sound file path (as in the manifest). */
export const THEME_SOUNDS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  'walnut-kafeneio': {
    'sounds/checker-place-1.m4a': require('@tavli/themes/walnut-kafeneio/sounds/checker-place-1.m4a'),
    'sounds/checker-place-2.m4a': require('@tavli/themes/walnut-kafeneio/sounds/checker-place-2.m4a'),
    'sounds/checker-place-3.m4a': require('@tavli/themes/walnut-kafeneio/sounds/checker-place-3.m4a'),
    'sounds/checker-hit.m4a': require('@tavli/themes/walnut-kafeneio/sounds/checker-hit.m4a'),
    'sounds/bear-off.m4a': require('@tavli/themes/walnut-kafeneio/sounds/bear-off.m4a'),
    'sounds/dice-roll-1.m4a': require('@tavli/themes/walnut-kafeneio/sounds/dice-roll-1.m4a'),
    'sounds/dice-roll-2.m4a': require('@tavli/themes/walnut-kafeneio/sounds/dice-roll-2.m4a'),
    'sounds/dice-land.m4a': require('@tavli/themes/walnut-kafeneio/sounds/dice-land.m4a'),
    'sounds/invalid-move.m4a': require('@tavli/themes/walnut-kafeneio/sounds/invalid-move.m4a'),
    'sounds/turn-start.m4a': require('@tavli/themes/walnut-kafeneio/sounds/turn-start.m4a'),
    'sounds/game-win.m4a': require('@tavli/themes/walnut-kafeneio/sounds/game-win.m4a'),
    'sounds/match-win.m4a': require('@tavli/themes/walnut-kafeneio/sounds/match-win.m4a'),
  },
  'olive-inlay': {
    'sounds/checker-place-1.m4a': require('@tavli/themes/olive-inlay/sounds/checker-place-1.m4a'),
    'sounds/checker-place-2.m4a': require('@tavli/themes/olive-inlay/sounds/checker-place-2.m4a'),
    'sounds/checker-place-3.m4a': require('@tavli/themes/olive-inlay/sounds/checker-place-3.m4a'),
    'sounds/checker-hit.m4a': require('@tavli/themes/olive-inlay/sounds/checker-hit.m4a'),
    'sounds/bear-off.m4a': require('@tavli/themes/olive-inlay/sounds/bear-off.m4a'),
    'sounds/dice-roll-1.m4a': require('@tavli/themes/olive-inlay/sounds/dice-roll-1.m4a'),
    'sounds/dice-roll-2.m4a': require('@tavli/themes/olive-inlay/sounds/dice-roll-2.m4a'),
    'sounds/dice-land.m4a': require('@tavli/themes/olive-inlay/sounds/dice-land.m4a'),
    'sounds/invalid-move.m4a': require('@tavli/themes/olive-inlay/sounds/invalid-move.m4a'),
    'sounds/turn-start.m4a': require('@tavli/themes/olive-inlay/sounds/turn-start.m4a'),
    'sounds/game-win.m4a': require('@tavli/themes/olive-inlay/sounds/game-win.m4a'),
    'sounds/match-win.m4a': require('@tavli/themes/olive-inlay/sounds/match-win.m4a'),
  },
};
