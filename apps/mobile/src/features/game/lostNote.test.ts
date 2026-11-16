import i18n from '@/i18n';

import { lostLine, lostReason } from './lostNote';

const t = i18n.t.bind(i18n);

describe('lostNote (#579)', () => {
  it('names one die of a plain roll', () => {
    expect(lostLine(t, { dice: [5], reason: 'higherDie' })).toBe("The 5 can't be played");
    expect(lostReason(t, { dice: [5], reason: 'higherDie' }, [6, 5])).toBe(
      'Only one die moves, so it must be the 6.',
    );
    expect(lostReason(t, { dice: [2], reason: 'blocked' }, [6, 2])).toBe(
      'No checker can move 2 now.',
    );
  });

  it('counts the dice of a double', () => {
    expect(lostLine(t, { dice: [3], reason: 'double' })).toBe("One 3 can't be played");
    expect(lostLine(t, { dice: [3, 3], reason: 'double' })).toBe("Two 3s can't be played");
    expect(lostLine(t, { dice: [3, 3, 3], reason: 'double' })).toBe("Three 3s can't be played");
    expect(lostReason(t, { dice: [3, 3], reason: 'double' }, [3, 3])).toBe('No more moves of 3.');
  });

  it('speaks Greek', async () => {
    await i18n.changeLanguage('el');
    try {
      expect(lostLine(t, { dice: [3, 3], reason: 'double' })).toBe('Δύο 3 δεν παίζονται');
      expect(lostReason(t, { dice: [5], reason: 'higherDie' }, [6, 5])).toBe(
        'Παίζεται μόνο ένα ζάρι, άρα παίζεις το 6.',
      );
    } finally {
      await i18n.changeLanguage('en');
    }
  });
});
