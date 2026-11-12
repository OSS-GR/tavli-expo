import { AVATAR_WOODS, avatarWood, initialsOf } from './avatar';

describe('avatarWood', () => {
  it('gives the same player the same wood every time', () => {
    expect(avatarWood('player-1')).toBe(avatarWood('player-1'));
  });

  it('uses every wood over many players', () => {
    const woods = new Set(Array.from({ length: 200 }, (_, i) => avatarWood(`player-${i}`)));
    expect([...woods].sort()).toEqual([...AVATAR_WOODS].sort());
  });
});

describe('initialsOf', () => {
  it.each([
    ['eleni.k', 'EK'],
    ['nikos_k', 'NK'],
    ['orestis_iphone', 'OI'],
    ['anna', 'A'],
    ['Guest 4821', 'G'],
    ['Επισκέπτης 4821', 'Ε'],
    ['ελένη.κ', 'ΕΚ'],
    ['maria t smith', 'MT'],
    ['4821', ''],
    ['', ''],
  ])('reads %s as %s', (name, initials) => {
    expect(initialsOf(name)).toBe(initials);
  });
});
