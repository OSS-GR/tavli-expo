/**
 * The account card at the top of Settings (#501, Figma "08 Settings"):
 * who this phone plays as online, and where the data lives. A tap opens
 * Settings → Account.
 *
 * - A phone that never played online (`hasOnlineAccount()` is false)
 *   makes no server call: "Not signed in", "On this phone only".
 * - Else it reads the session (`auth.ready()`) and the name
 *   (`Usernames.mine`), like Account does: a guest shows "Guest 4821" and
 *   "On this phone only" (a guest has no key, so the account lives on
 *   this phone), a saved account its username and how it signs in
 *   ("Signed in with email", #561, `signInLine`). When the keys do not
 *   load, it says "Signed in".
 * - Before it loads it shows the last account this app run loaded
 *   (`accountMemory.ts`, #567), and it fills that memory, so Account shows
 *   at once too. With none, or when the server does not answer, it shows
 *   "Your account": Account itself says more. It never signs in or out.
 */
import type { AuthKeyProvider, AuthProvider, Usernames } from '@tavli/contracts';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { CheckerAvatar } from '@/components/CheckerAvatar';
import { Icon } from '@/components/Icon';
import { surfaceStyle } from '@/components/Surface';
import { knownAccount, rememberAccount } from '@/features/account/accountMemory';
import { signInIcon, signInLine } from '@/features/account/signInLine';
import { hasOnlineAccount } from '@/features/online/accountHint';

import { SettingsChip } from './SettingsChip';

export type AccountSummary =
  /** No account on this phone: nothing was asked of the server. */
  | { readonly kind: 'offline' }
  /** Loading, or the server did not answer. */
  | { readonly kind: 'unknown' }
  | { readonly kind: 'guest'; readonly id: string; readonly number: string | null }
  | {
      readonly kind: 'saved';
      readonly id: string;
      readonly name: string | null;
      /** The ways to sign in; `null` when they did not load. */
      readonly keys: readonly AuthKeyProvider[] | null;
    };

async function loadSummary(auth: AuthProvider, usernames: Usernames): Promise<AccountSummary> {
  const user = await auth.ready();
  if (user === null) return { kind: 'offline' };
  const mine = await usernames.mine();
  const guestNumber = mine.guestNumber ?? null;
  if (user.isGuest || !mine.saved) {
    // Account shows it at once when it opens (#567).
    rememberAccount({ kind: 'guest', id: user.id, guestNumber });
    return { kind: 'guest', id: user.id, number: guestNumber };
  }
  const keys = await auth.listKeys().then(
    (list) => {
      rememberAccount({ kind: 'saved', id: user.id, username: mine.name, guestNumber, keys: list });
      return list.map((key) => key.provider);
    },
    () => null,
  );
  return { kind: 'saved', id: user.id, name: mine.name, keys };
}

/** What the card shows before it loads: the last loaded account (#567). */
function knownSummary(auth: AuthProvider): AccountSummary {
  const known = knownAccount(auth);
  if (known === null) return { kind: 'unknown' };
  if (known.kind === 'guest') return { kind: 'guest', id: known.id, number: known.guestNumber };
  return {
    kind: 'saved',
    id: known.id,
    name: known.username,
    keys: known.keys.map((key) => key.provider),
  };
}

/** The summary. `visit` changes each time Settings shows again, so a new name shows. */
export function useAccountSummary(
  auth: AuthProvider,
  usernames: Usernames,
  visit: number,
): AccountSummary {
  // Read the note on each render: a sign-out on Account clears it.
  const used = hasOnlineAccount();
  const [summary, setSummary] = useState<AccountSummary>(() => knownSummary(auth));
  useEffect(() => {
    if (!used) return;
    let on = true;
    loadSummary(auth, usernames).then(
      (next) => {
        if (on) setSummary(next);
      },
      () => {
        // Keep what shows: Account says what went wrong.
      },
    );
    return () => {
      on = false;
    };
  }, [auth, usernames, visit, used]);
  return used ? summary : { kind: 'offline' };
}

export interface AccountCardProps {
  auth: AuthProvider;
  usernames: Usernames;
  /** Changes each time Settings shows again. */
  visit: number;
  onPress: () => void;
}

export function AccountCard({ auth, usernames, visit, onPress }: AccountCardProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const summary = useAccountSummary(auth, usernames, visit);

  const name =
    summary.kind === 'offline'
      ? t('settings.accountCard.offline')
      : summary.kind === 'guest' && summary.number !== null
        ? t('online.guestName', { number: summary.number })
        : summary.kind === 'saved' && summary.name !== null
          ? summary.name
          : t('settings.accountCard.unknown');
  const where =
    summary.kind === 'offline' || summary.kind === 'guest'
      ? t('settings.accountCard.phoneOnly')
      : summary.kind === 'saved'
        ? t(`account.signedIn.${signInLine(summary.keys)}`)
        : null;
  // The avatar's wood follows the player id; with no account, a fixed one.
  const playerKey = summary.kind === 'guest' || summary.kind === 'saved' ? summary.id : 'offline';

  return (
    <Pressable
      testID="settings-account-card"
      accessibilityRole="button"
      accessibilityLabel={[name, where].filter(Boolean).join(', ')}
      accessibilityHint={t('settings.accountCard.hint')}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <CheckerAvatar
        testID="settings-account-avatar"
        playerKey={playerKey}
        name={summary.kind === 'guest' || summary.kind === 'saved' ? name : null}
      />
      <View style={styles.texts}>
        <Text style={styles.name}>{name}</Text>
        {where === null ? null : (
          <SettingsChip
            testID="settings-account-where"
            icon={summary.kind === 'saved' ? signInIcon(signInLine(summary.keys)) : 'smartphone'}
            label={where}
          />
        )}
      </View>
      <Icon name="chevronRight" size={18} color={theme.colors.textDim} />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    ...surfaceStyle(theme, 'raised'),
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    minHeight: theme.touch.row,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
  },
  pressed: {
    opacity: 0.8,
  },
  texts: {
    flex: 1,
    alignItems: 'flex-start',
    gap: theme.space.xs,
  },
  name: {
    ...theme.type.title3,
    color: theme.colors.text,
  },
}));
