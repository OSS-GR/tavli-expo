import { friendLinkUrl, friendTokenFromLink } from './friendLink';

const TOKEN = 'ABCDEFGH23456789';

describe('friend links (#406)', () => {
  it('makes the app link in capital letters', () => {
    expect(friendLinkUrl(TOKEN.toLowerCase())).toBe(`tavlaki://add/${TOKEN}`);
  });

  it('refuses text that is not a token: that is a bug', () => {
    expect(() => friendLinkUrl('ABC')).toThrow();
  });

  it('reads the token from a link or a bare token, in any case', () => {
    for (const text of [
      `tavlaki://add/${TOKEN}`,
      ` TAVLAKI://ADD/${TOKEN.toLowerCase()}/ `,
      `tavlaki://add/${TOKEN}?from=qr`,
      TOKEN.toLowerCase(),
    ]) {
      expect(friendTokenFromLink(text)).toBe(TOKEN);
    }
  });

  it('refuses other text', () => {
    for (const text of [
      '',
      'tavlaki://add/ABC',
      `tavlaki://invite/${TOKEN}`,
      `https://example.com/add/${TOKEN}`,
      `tavlaki://add/${TOKEN}/more`,
      'ABCDEFGH2345678I',
    ]) {
      expect(friendTokenFromLink(text)).toBeNull();
    }
  });
});
