import { signInIcon, signInLine } from './signInLine';

describe('signInLine (#561)', () => {
  it('names the way the account signs in', () => {
    expect(signInLine(['email'])).toBe('email');
    expect(signInLine(['apple'])).toBe('apple');
    expect(signInLine(['email', 'apple'])).toBe('both');
  });

  it('says only "signed in" with no keys or keys that did not load', () => {
    expect(signInLine([])).toBe('none');
    expect(signInLine(null)).toBe('none');
  });

  it('shows the envelope only for email alone', () => {
    expect(signInIcon('email')).toBe('mail');
    expect(signInIcon('apple')).toBe('keyRound');
    expect(signInIcon('both')).toBe('keyRound');
  });
});
