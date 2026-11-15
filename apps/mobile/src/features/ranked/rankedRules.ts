/**
 * The Play ranked rules sheet (#532) shows once: before the first search.
 * "I agree" leaves a note on this phone (`1` under `RANKED_RULES_KEY` in
 * the `Storage` port). It never leaves the phone and holds no id.
 */
import { storage } from '@/services';

export const RANKED_RULES_KEY = 'rankedRules';

/** The player agreed to the ranked rules on this phone. */
export function hasAgreedRankedRules(): boolean {
  try {
    return storage.getString(RANKED_RULES_KEY) === '1';
  } catch {
    return false;
  }
}

/** Notes "I agree". */
export function agreeRankedRules(): void {
  try {
    storage.setString(RANKED_RULES_KEY, '1');
  } catch {
    // Only a note: the sheet shows once more next time.
  }
}

/** Tests start with the sheet not seen. */
export function forgetRankedRulesForTest(): void {
  storage.remove(RANKED_RULES_KEY);
}
