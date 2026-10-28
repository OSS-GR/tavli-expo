import { inviteAppUrl, inviteCodeFromLink, inviteCodeFromPath, inviteUrl } from './link';

const CODE = 'ABCD2345';

describe('inviteCodeFromLink', () => {
  it.each([
    ['tavlaki://invite/ABCD2345'],
    ['tavlaki://invite/abcd2345'],
    ['tavlaki://invite/AbCd2345/'],
    ['TAVLAKI://INVITE/abcd2345'],
    ['tavlaki://invite/ABCD2345?from=share'],
    ['https://tavlaki.com/i/ABCD2345'],
    ['https://tavlaki.com/i/abcd2345'],
    ['https://www.tavlaki.com/i/abcd2345/'],
    ['HTTPS://Tavlaki.com/i/ABCD2345#top'],
    ['  https://tavlaki.com/i/ABCD2345  '],
  ])('reads the code from %s', (link) => {
    expect(inviteCodeFromLink(link)).toBe(CODE);
  });

  it.each([
    // Not in the alphabet: 0, 1, I, L, O.
    ['tavlaki://invite/ABCD2340'],
    ['tavlaki://invite/ABCD2341'],
    ['https://tavlaki.com/i/ABCDI345'],
    ['https://tavlaki.com/i/abcdl345'],
    ['https://tavlaki.com/i/ABCDO345'],
    // Wrong length.
    ['tavlaki://invite/ABCD234'],
    ['tavlaki://invite/ABCD23456'],
    ['https://tavlaki.com/i/'],
    // Other characters.
    ['tavlaki://invite/ABCD-345'],
    ['tavlaki://invite/ABCD%20345'],
    ['https://tavlaki.com/i/ABCD2345/more'],
    // Other links.
    ['tavlaki://game/ABCD2345'],
    ['tavlaki://i/ABCD2345'],
    ['https://tavlaki.com/invite/ABCD2345'],
    ['http://tavlaki.com/i/ABCD2345'],
    ['https://tavlaki.com.evil.example/i/ABCD2345'],
    ['https://evil.example/i/ABCD2345'],
    ['https://eviltavlaki.com/i/ABCD2345'],
    ['ABCD2345'],
    [''],
  ])('refuses %j', (link) => {
    expect(inviteCodeFromLink(link)).toBeNull();
  });
});

describe('inviteCodeFromPath', () => {
  it('reads the code from the invite route path, in any case', () => {
    expect(inviteCodeFromPath('/invite/abcd2345')).toBe(CODE);
    expect(inviteCodeFromPath('/invite/ABCD2345/')).toBe(CODE);
  });

  it.each([['/invite/ABCD234O'], ['/invite/ABC'], ['/invite'], ['/game/ABCD2345'], ['/']])(
    'refuses %j',
    (path) => {
      expect(inviteCodeFromPath(path)).toBeNull();
    },
  );
});

describe('invite links', () => {
  it('writes the share link with the code in capital letters', () => {
    expect(inviteUrl('abcd2345')).toBe('https://tavlaki.com/i/ABCD2345');
  });

  it('writes the app link with the code in capital letters', () => {
    expect(inviteAppUrl('abcd2345')).toBe('tavlaki://invite/ABCD2345');
  });

  it('reads back both links it writes', () => {
    expect(inviteCodeFromLink(inviteUrl(CODE))).toBe(CODE);
    expect(inviteCodeFromLink(inviteAppUrl(CODE))).toBe(CODE);
  });

  it('throws for text that is not a code', () => {
    expect(() => inviteUrl('ABCD234O')).toThrow('not an invite code');
    expect(() => inviteAppUrl('short')).toThrow('not an invite code');
  });
});
