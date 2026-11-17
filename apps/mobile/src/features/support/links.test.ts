import fs from 'node:fs';
import path from 'node:path';

import { rateAppUrl, shareAppUrl, supportPageUrl } from './links';

describe('the support links', () => {
  it('opens our support page, in Greek for Greek', () => {
    expect(supportPageUrl('en')).toBe('https://tavlaki.com/support/');
    expect(supportPageUrl('el')).toBe('https://tavlaki.com/el/support/');
    expect(supportPageUrl('fr')).toBe('https://tavlaki.com/support/');
  });

  it('shares the homepage', () => {
    expect(shareAppUrl('en')).toBe('https://tavlaki.com');
    expect(shareAppUrl('el')).toBe('https://tavlaki.com/el/');
  });

  it('rates on the store of the phone', () => {
    expect(rateAppUrl({ platform: 'ios', appId: 'com.tavlaki' })).toBe(
      'https://apps.apple.com/app/id6828172932?action=write-review',
    );
    expect(rateAppUrl({ platform: 'android', appId: 'com.tavlaki' })).toBe(
      'https://play.google.com/store/apps/details?id=com.tavlaki',
    );
    expect(rateAppUrl(null)).toContain('apps.apple.com');
  });
});

const ROOT = path.join(__dirname, '../../../../..');
const SITE = 'docs/legal/site';
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

describe('the Support pages on tavlaki.com (#590)', () => {
  const KOFI = 'https://ko-fi.com/orestisstefanis';
  const pages = [
    ['en', supportPageUrl('en'), 'alt="Support me on Ko-fi"'],
    ['el', supportPageUrl('el'), 'Κέρασέ με έναν καφέ στο Ko-fi'],
  ] as const;
  const fileOf = (url: string) => path.join(SITE, new URL(url).pathname, 'index.html');

  it.each(pages)(
    'the %s page is where the app links, with the Ko-fi button',
    (lang, url, button) => {
      const page = read(fileOf(url));
      expect(page).toContain(`<html lang="${lang}">`);
      const link = page.match(
        new RegExp(`<a class="(?:kofi|btn primary)" href="${KOFI}"[\\s\\S]*?</a>`),
      );
      expect(link?.[0]).toContain(button);
    },
  );

  it("uses Ko-fi's images from the site, never from Ko-fi", () => {
    const files = ['support/index.html', 'el/support/index.html'].map((f) => read(`${SITE}/${f}`));
    const images = files.flatMap((page) =>
      [...page.matchAll(/(?:src|srcset)="([^"]+)"/g)].map(([, src]) => src ?? ''),
    );
    expect(images.filter((src) => src.includes('kofi'))).toEqual([
      '/img/kofi/support_me_on_kofi_beige.png',
      '/img/kofi/kofi_symbol.svg',
    ]);
    for (const src of images) expect(fs.existsSync(path.join(ROOT, SITE, src))).toBe(true);
  });

  it.each(pages)('the %s page runs no script and loads nothing from other sites', (_l, url) => {
    const page = read(fileOf(url));
    expect(page).not.toMatch(
      /<script|<iframe|<form|<link rel="stylesheet"|@import|url\(\s*["']?https?:/i,
    );
    for (const [, src] of page.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)) {
      expect(src).toMatch(/^\/img\//);
    }
    // Links out go only to Ko-fi, TestFlight and the site's own address.
    const outside = [...page.matchAll(/https?:\/\/[^\s"'<>)]+/g)].map(([link]) => new URL(link));
    expect(
      outside.filter(
        (link) =>
          !['tavlaki.com', 'testflight.apple.com'].includes(link.host) && link.href !== KOFI,
      ),
    ).toEqual([]);
  });
});
