import { guestName, usernameName } from '@tavli/contracts';

import i18n from '@/i18n';

import { playerNameText } from './playerName';

describe('playerNameText (#400, #405)', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('shows a username as typed, in every language', async () => {
    expect(playerNameText(usernameName('Νίκος_7'), i18n.t)).toBe('Νίκος_7');
    await i18n.changeLanguage('el');
    expect(playerNameText(usernameName('Alex'), i18n.t)).toBe('Alex');
  });

  it('shows a guest name in the app language, and nothing with no name', async () => {
    expect(playerNameText(guestName('4821'), i18n.t)).toBe('Guest 4821');
    await i18n.changeLanguage('el');
    expect(playerNameText(guestName('4821'), i18n.t)).toBe('Επισκέπτης 4821');
    expect(playerNameText(null, i18n.t)).toBeNull();
  });
});
