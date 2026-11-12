/**
 * The record with a friend in words (#503): "You lead 5–3", "They lead
 * 1–0", "Even at 2–2". The leader's score comes first. With no finished
 * match there is no line (`null`).
 */
import type { FriendRecord } from '@tavli/contracts';
import type { TFunction } from 'i18next';

export function recordText(record: FriendRecord, t: TFunction): string | null {
  const { wins, losses } = record;
  if (wins === 0 && losses === 0) return null;
  if (wins > losses) return t('friends.list.lead', { wins, losses });
  if (losses > wins) return t('friends.list.behind', { wins, losses });
  return t('friends.list.even', { wins, losses });
}
