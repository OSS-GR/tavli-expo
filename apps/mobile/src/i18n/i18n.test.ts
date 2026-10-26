import el from './el.json';
import en from './en.json';
import { pickDeviceLanguage, resolveLanguage } from './languages';

type Tree = { [key: string]: string | Tree };

/** All leaf keys as dotted paths, sorted. */
function leafKeys(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree)
    .flatMap(([key, value]) =>
      typeof value === 'string' ? [`${prefix}${key}`] : leafKeys(value, `${prefix}${key}.`),
    )
    .sort();
}

function leafValue(tree: Tree, path: string): string {
  const value = path.split('.').reduce<string | Tree | undefined>((node, part) => {
    return typeof node === 'object' ? node[part] : undefined;
  }, tree);
  if (typeof value !== 'string') {
    throw new Error(`No string at ${path}`);
  }
  return value;
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((match) => match[1] ?? '').sort();
}

describe('translations', () => {
  const enKeys = leafKeys(en);
  const elKeys = leafKeys(el);

  it('has exactly the same keys in en and el', () => {
    expect(elKeys).toEqual(enKeys);
  });

  it('has no empty strings', () => {
    for (const key of enKeys) {
      expect(leafValue(en, key).trim()).not.toBe('');
      expect(leafValue(el, key).trim()).not.toBe('');
    }
  });

  it('uses the same {{placeholders}} in both languages', () => {
    for (const key of enKeys) {
      expect({ key, vars: placeholders(leafValue(el, key)) }).toEqual({
        key,
        vars: placeholders(leafValue(en, key)),
      });
    }
  });
});

describe('language choice', () => {
  it('uses the first phone language we ship', () => {
    expect(pickDeviceLanguage(['el', 'en'])).toBe('el');
    expect(pickDeviceLanguage(['de', 'en'])).toBe('en');
    expect(pickDeviceLanguage(['EL-gr'])).toBe('el');
  });

  it('falls back to English', () => {
    expect(pickDeviceLanguage(['de', 'fr'])).toBe('en');
    expect(pickDeviceLanguage([])).toBe('en');
    expect(pickDeviceLanguage([null, undefined])).toBe('en');
  });

  it('lets a picked language win over the phone', () => {
    expect(resolveLanguage('system', ['el'])).toBe('el');
    expect(resolveLanguage('en', ['el'])).toBe('en');
    expect(resolveLanguage('el', ['en'])).toBe('el');
  });
});
