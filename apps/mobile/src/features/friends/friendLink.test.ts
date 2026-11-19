import { friendLinkUrl, friendTokenFromLink } from './friendLink';

const TOKEN = 'ABCDEFGH23456789';

describe('friend links (#406)', () => {
  it('makes the tavlaki.com link in capital letters (#629)', () => {
    expect(friendLinkUrl(TOKEN.toLowerCase())).toBe(`https://tavlaki.com/add/${TOKEN}`);
  });

  it('refuses text that is not a token: that is a bug', () => {
    expect(() => friendLinkUrl('ABC')).toThrow();
  });

  it('reads the token from a link or a bare token, in any case', () => {
    for (const text of [
      `https://tavlaki.com/add/${TOKEN}`,
      ` HTTPS://WWW.TAVLAKI.COM/ADD/${TOKEN.toLowerCase()}/ `,
      `https://tavlaki.com/add/${TOKEN}#x`,
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
      `http://tavlaki.com/add/${TOKEN}`,
      `https://tavlaki.com/i/${TOKEN}`,
      `https://tavlaki.com/add/${TOKEN}/more`,
      `tavlaki://add/${TOKEN}/more`,
      'ABCDEFGH2345678I',
    ]) {
      expect(friendTokenFromLink(text)).toBeNull();
    }
  });
});
