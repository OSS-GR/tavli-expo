import fs from 'node:fs';
import path from 'node:path';

import {
  INVITE_LINK_ORIGIN,
  inviteAppUrl,
  inviteCodeFromLink,
  inviteCodeFromPath,
  inviteUrl,
} from './link';

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

  it('reads the code from the share link path, in any case (#332)', () => {
    expect(inviteCodeFromPath('/i/abcd2345')).toBe(CODE);
    expect(inviteCodeFromPath('/I/ABCD2345/')).toBe(CODE);
  });

  it.each([
    ['/invite/ABCD234O'],
    ['/invite/ABC'],
    ['/invite'],
    ['/game/ABCD2345'],
    ['/'],
    ['/i/ABCD234O'],
    ['/i/'],
    ['/i'],
    ['/ix/ABCD2345'],
    ['/i/ABCD2345/more'],
  ])('refuses %j', (path) => {
    expect(inviteCodeFromPath(path)).toBeNull();
  });
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

/** The repo root, from `apps/mobile/src/features/invites`. */
const ROOT = path.join(__dirname, '../../../../..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

describe('universal links (#332)', () => {
  const host = new URL(INVITE_LINK_ORIGIN).host;

  it('the app config claims the share link domain', () => {
    const app = JSON.parse(read('apps/mobile/app.json')) as {
      expo: { ios: { bundleIdentifier: string; associatedDomains?: string[] } };
    };
    expect(app.expo.ios.associatedDomains).toEqual([`applinks:${host}`]);
  });

  it("the site's apple-app-site-association opens the share link path in the production app", () => {
    const app = JSON.parse(read('apps/mobile/app.json')) as {
      expo: { ios: { bundleIdentifier: string } };
    };
    const aasa = JSON.parse(read('docs/legal/site/.well-known/apple-app-site-association')) as {
      applinks: { details: { appIDs: string[]; components: { '/': string }[] }[] };
    };
    expect(aasa.applinks.details).toEqual([
      expect.objectContaining({
        appIDs: [`P36P357F6Z.${app.expo.ios.bundleIdentifier}`],
        components: [expect.objectContaining({ '/': '/i/*' })],
      }),
    ]);
    // The path the app writes is the path the site hands to the app.
    expect(new URL(inviteUrl(CODE)).pathname).toBe(`/i/${CODE}`);
  });

  it('the site shows the fallback page for every share link, with no script', () => {
    expect(read('docs/legal/site/_redirects')).toMatch(/^\/i\/\*\s+\/i\/index\.html\s+200$/m);
    expect(read('docs/legal/site/_headers')).toMatch(
      /^\/\.well-known\/apple-app-site-association\n\s+Content-Type: application\/json$/m,
    );
    const page = read('docs/legal/site/i/index.html');
    expect(page).not.toMatch(
      /<script|<iframe|<img|https?:\/\/(?!tavlaki\.com|testflight\.apple\.com|apps\.apple\.com)/i,
    );
    // Both languages, with the app's own words for the code screen.
    expect(page).toContain('<section lang="en">');
    expect(page).toContain('<section lang="el" id="el">');
    expect(page).toContain('Join with a code');
    expect(page).toContain('Μπες με κωδικό');
  });
});
