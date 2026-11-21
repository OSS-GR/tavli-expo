import { moveListAsked, moveListShown } from './screenReader';

describe('moveListAsked', () => {
  it('on a phone it is the same as the list showing', () => {
    for (const mode of ['auto', 'on', 'off'] as const) {
      for (const screenReader of [false, true]) {
        expect(moveListAsked(mode, screenReader, false)).toBe(moveListShown(mode, screenReader));
      }
    }
  });

  it('in a browser only the setting counts: its screen reader answer is always "on"', () => {
    expect(moveListAsked('auto', true, true)).toBe(false);
    expect(moveListAsked('off', true, true)).toBe(false);
    expect(moveListAsked('on', true, true)).toBe(true);
    // The list itself still shows for `auto` there.
    expect(moveListShown('auto', true)).toBe(true);
  });
});
