import { guestName } from '@tavli/contracts';

import i18n from '@/i18n';

import { onlineSeats } from './seats';

describe('onlineSeats', () => {
  const en = i18n.getFixedT('en');
  const el = i18n.getFixedT('el');

  it('names the other player by their guest name (#400)', () => {
    const seats = onlineSeats('white', en, guestName('4821'));
    expect(seats.white).toMatchObject({ name: 'You', you: true });
    expect(seats.black).toMatchObject({
      name: 'Guest 4821',
      label: 'Guest 4821',
      turnLabel: 'Waiting for Guest 4821',
      you: false,
    });
    expect(onlineSeats('black', el, guestName('4821')).white).toMatchObject({
      name: 'Επισκέπτης 4821',
      turnLabel: 'Περιμένουμε: Επισκέπτης 4821',
    });
  });

  it('says "Opponent" when the server has no name', () => {
    expect(onlineSeats('black', en, null).white).toMatchObject({
      name: 'Opponent',
      label: 'Opponent',
      turnLabel: 'Waiting for Opponent',
      you: false,
    });
  });
});
