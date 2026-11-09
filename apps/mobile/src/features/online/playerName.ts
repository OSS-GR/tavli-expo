/**
 * The other player's name as text (#400): "Guest 4821", or
 * "Επισκέπτης 4821" in Greek. The server sends only the parts
 * (`PlayerName`). `null` when the server has no name (for example after
 * that player deleted their online data): the screen then keeps its old
 * words ("Opponent", "your friend"). Pure: no hooks.
 */
import type { PlayerName } from '@tavli/contracts';
import type { TFunction } from 'i18next';

export function playerNameText(name: PlayerName | null, t: TFunction): string | null {
  if (name === null) return null;
  return t('online.guestName', { number: name.number });
}
