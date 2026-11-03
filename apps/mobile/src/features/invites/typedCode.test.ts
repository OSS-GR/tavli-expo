import i18n from '@/i18n';

import { inviteAppUrl, inviteUrl } from './link';
import { readTypedCode } from './typedCode';

const code = (text: string) => readTypedCode(text);

describe('readTypedCode (#333)', () => {
  it('reads a code in any case, with spaces and dashes', () => {
    expect(code('ABCD2345')).toEqual({ kind: 'code', code: 'ABCD2345' });
    expect(code('abcd2345')).toEqual({ kind: 'code', code: 'ABCD2345' });
    expect(code('  aBcD 2345 \n')).toEqual({ kind: 'code', code: 'ABCD2345' });
    expect(code('ABCD-2345')).toEqual({ kind: 'code', code: 'ABCD2345' });
    expect(code('ABCD–2345')).toEqual({ kind: 'code', code: 'ABCD2345' });
  });

  it('reads Greek capitals that look like Latin ones', () => {
    // Α Β Ε Ζ Η Κ Μ Ν Ρ Τ Υ Χ in Greek, from a Greek keyboard.
    expect(code('ΑΒΕΖ2345')).toEqual({ kind: 'code', code: 'ABEZ2345' });
    expect(code('ΗΚΜΝΡΤΥΧ')).toEqual({ kind: 'code', code: 'HKMNPTYX' });
    expect(code('αβεζ2345')).toEqual({ kind: 'code', code: 'ABEZ2345' });
  });

  it('reads the code of a pasted link, also inside the share message', () => {
    expect(code('tavlaki://invite/abcd2345')).toEqual({ kind: 'code', code: 'ABCD2345' });
    expect(code('https://tavlaki.com/i/ABCD2345')).toEqual({ kind: 'code', code: 'ABCD2345' });
    expect(
      code(
        'Play tavli with me on Tavlaki. Open this link to join: tavlaki://invite/ABCD2345\n' +
          'Or open Tavlaki, tap Join with a code and enter ABCD2345.',
      ),
    ).toEqual({ kind: 'code', code: 'ABCD2345' });
    expect(code('(https://tavlaki.com/i/ABCD2345).')).toEqual({ kind: 'code', code: 'ABCD2345' });
  });

  it.each(['en', 'el'])('reads the whole share message in %s, with either link', (language) => {
    const t = i18n.getFixedT(language);
    for (const link of [inviteAppUrl('ABCD2345'), inviteUrl('ABCD2345')]) {
      const message = t('friend.wait.shareMessage', { link, code: 'ABCD2345' });
      expect(message).toContain('ABCD2345');
      expect(code(message)).toEqual({ kind: 'code', code: 'ABCD2345' });
    }
  });

  it('says why the text is not a code', () => {
    expect(code('')).toEqual({ kind: 'empty' });
    expect(code('   ')).toEqual({ kind: 'empty' });
    expect(code('ABCD234')).toEqual({ kind: 'problem', problem: 'short' });
    expect(code('ABCD23456')).toEqual({ kind: 'problem', problem: 'long' });
    // Look-alikes are never in a code: 0, O, 1, I, L.
    for (const bad of ['ABCD2340', 'ABCD234O', 'ABCD2341', 'ABCD234I', 'abcd234l']) {
      expect(code(bad)).toEqual({ kind: 'problem', problem: 'characters' });
    }
    // A bad character says more than the length.
    expect(code('AB0')).toEqual({ kind: 'problem', problem: 'characters' });
    expect(code('ABCD234ſ')).toEqual({ kind: 'problem', problem: 'characters' });
    expect(code('ΓΔΘΛ2345')).toEqual({ kind: 'problem', problem: 'characters' });
    expect(code('ABCD23😀5')).toEqual({ kind: 'problem', problem: 'characters' });
    expect(code('tavlaki://invite/ABCD234O')).toEqual({ kind: 'problem', problem: 'link' });
    expect(code('https://tavlaki.com/i/')).toEqual({ kind: 'problem', problem: 'link' });
  });
});
