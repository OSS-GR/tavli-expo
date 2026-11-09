import { describe, expect, it } from 'vitest';

import {
  APPLE_SHEET_UNFINISHED,
  appleSheetUnfinished,
  createMemoryAppleSheet,
  isAppleSheetUnfinished,
} from './apple-sheet';

describe('the unfinished Apple sheet (#442)', () => {
  it('names its error by code', () => {
    const error = appleSheetUnfinished();
    expect(error).toBeInstanceOf(Error);
    expect((error as Error & { code: string }).code).toBe(APPLE_SHEET_UNFINISHED);
    expect(isAppleSheetUnfinished(error)).toBe(true);
    expect(isAppleSheetUnfinished(new Error('offline'))).toBe(false);
    expect(isAppleSheetUnfinished(null)).toBe(false);
    expect(isAppleSheetUnfinished('APPLE_SHEET_UNFINISHED')).toBe(false);
  });

  it('the in-memory sheet acts it out, then answers again', async () => {
    const sheet = createMemoryAppleSheet();
    sheet.next = 'unfinished';
    const error = await sheet.signIn('n1').then(
      () => null,
      (e: unknown) => e,
    );
    expect(isAppleSheetUnfinished(error)).toBe(true);
    expect(sheet.shown).toEqual(['n1']);
    sheet.next = 'proof';
    expect(await sheet.signIn('n2')).not.toBeNull();
  });
});
