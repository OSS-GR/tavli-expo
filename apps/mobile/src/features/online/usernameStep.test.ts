import { TERMS_VERSION } from '@tavli/contracts';

import { minimumAge, needsUsernameStep, termsUrl } from './usernameStep';

describe('the username step (#405)', () => {
  it('asks 16 in the EU countries that ask more than 13, and with no region', () => {
    for (const region of ['GR', 'DE', 'FR', 'nl', null, undefined, '']) {
      expect(minimumAge(region)).toBe(16);
    }
    for (const region of ['US', 'GB', 'DK', 'SE', 'BE', 'CA']) {
      expect(minimumAge(region)).toBe(13);
    }
  });

  it('opens the terms in the app language', () => {
    expect(termsUrl('el')).toBe('https://tavlaki.com/el/terms');
    expect(termsUrl('en')).toBe('https://tavlaki.com/terms');
  });

  it('shows only for a saved account with no username', () => {
    const base = { nextChangeAt: null, ageChecked: false, termsVersion: null };
    expect(needsUsernameStep({ ...base, saved: true, name: null })).toBe(true);
    expect(needsUsernameStep({ ...base, saved: false, name: null })).toBe(false);
    expect(
      needsUsernameStep({
        ...base,
        saved: true,
        name: 'Alex',
        ageChecked: true,
        termsVersion: TERMS_VERSION,
      }),
    ).toBe(false);
  });
});
