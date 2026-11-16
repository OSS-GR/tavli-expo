/**
 * "Invites from friends" on Home (#486): the open friend invites sent to
 * the signed-in player (`Friends.listFriendInvites`, #406). A tap opens
 * the invite (`/invite/<code>`), where the player accepts or declines.
 *
 * `useFriendInvites` loads them; Home (#517) puts the one that ends first
 * in the hero and the rest here (`HomeFriendInvites`).
 *
 * - Home loads them only on a phone that has an online account
 *   (`hasOnlineAccount()`), so a phone that never played online makes no
 *   server call. It never makes an account: with nobody signed in there
 *   is no invite.
 * - It loads each time Home comes into view (`focused`). Only the newest
 *   load may set the list.
 * - There is no invite while it loads, for a guest (friends need a saved
 *   account: `NOT_SAVED`) and after a sign-out. A load that fails for
 *   another reason keeps the list it had: the invite screen loads each
 *   invite again.
 */
import type { AuthProvider, Friends, InviteView } from '@tavli/contracts';
import { isFriendsErrorData } from '@tavli/contracts';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { CheckerAvatar } from '@/components/CheckerAvatar';
import { SectionHeader } from '@/components/SectionHeader';
import { playerNameText } from '@/features/online/playerName';

/** The invites shown, and the user they belong to. */
interface Loaded {
  readonly user: string | null;
  readonly list: readonly InviteView[];
}

/**
 * The open friend invites to the signed-in player, or none. It reads the
 * session with `loadSession()`: a rejection is no network, so the load
 * fails and the list stays; `null` is a real sign-out (#297).
 */
async function loadInvites(auth: AuthProvider, friends: Friends): Promise<Loaded> {
  const user = await auth.loadSession();
  if (user === null || user.isGuest) return { user: user?.id ?? null, list: NONE };
  try {
    const list = await friends.listFriendInvites();
    return { user: user.id, list: list.filter((invite) => invite.status === 'open') };
  } catch (error) {
    // Not a saved account, or the session is gone: nothing to show.
    if (
      isFriendsErrorData(error) &&
      (error.code === 'NOT_SAVED' || error.code === 'NOT_SIGNED_IN')
    ) {
      return { user: user.id, list: NONE };
    }
    throw error;
  }
}

const NONE: readonly InviteView[] = [];
const EMPTY: Loaded = { user: null, list: NONE };

/**
 * The open friend invites to the signed-in player, loaded each time
 * `focused` turns on. With no `auth` or `friends` there are none. A
 * sign-out or another user clears the list at once: one player's invites
 * never show for another.
 */
export function useFriendInvites(
  auth: AuthProvider | undefined,
  friends: Friends | undefined,
  focused: boolean,
): readonly InviteView[] {
  const enabled = auth !== undefined && friends !== undefined;
  const [loaded, setLoaded] = useState<Loaded>(EMPTY);
  // Turned off (a sign-out): forget the list before the next user loads.
  const [wasEnabled, setWasEnabled] = useState(enabled);
  if (wasEnabled !== enabled) {
    setWasEnabled(enabled);
    if (!enabled) setLoaded(EMPTY);
  }
  // Only the newest load may set the list.
  const loads = useRef(0);

  // Another user signs in: their list is not this one.
  useEffect(() => {
    if (auth === undefined) return;
    return auth.onChange((user) => {
      const id = user?.id ?? null;
      setLoaded((last) => (last.user === id ? last : { user: id, list: NONE }));
    });
  }, [auth]);

  useEffect(() => {
    if (!focused || auth === undefined || friends === undefined) return;
    loads.current += 1;
    const n = loads.current;
    loadInvites(auth, friends).then(
      (next) => {
        if (n === loads.current) setLoaded(next);
      },
      // A failed load (no network) keeps what shows.
      () => {},
    );
    return () => {
      // Home went away or out of view: an answer still on its way is old.
      if (n === loads.current) loads.current += 1;
    };
  }, [auth, friends, focused]);

  return enabled ? loaded.list : NONE;
}

export interface HomeFriendInvitesProps {
  /** The invites to list (the hero's one left out). */
  invites: readonly InviteView[];
  /** Opens the invite. */
  onOpen: (code: string) => void;
}

export function HomeFriendInvites({ invites: list, onOpen }: HomeFriendInvitesProps) {
  const { t } = useTranslation();
  if (list.length === 0) return null;
  const title = t('friends.invites.title');
  return (
    <View testID="home-friend-invites" style={styles.section}>
      <SectionHeader title={title} />
      <View style={styles.list}>
        {list.map((invite) => {
          const name = playerNameText(invite.fromName, t);
          const from = t('friends.invites.from', { name: name ?? t('friends.unnamed') });
          const game = t('friends.invites.game', {
            game: t(`games.${invite.choice}`),
            count: invite.targetPoints,
          });
          return (
            <Pressable
              key={invite.code}
              testID={`home-friend-invite-${invite.code}`}
              accessibilityRole="button"
              accessibilityLabel={`${from}, ${game}`}
              accessibilityHint={t('home.friendInvites.hint')}
              onPress={() => onOpen(invite.code)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <CheckerAvatar playerKey={invite.from} name={name} />
              <View style={styles.texts}>
                <Text style={styles.title}>{from}</Text>
                <Text style={styles.line}>{game}</Text>
              </View>
              <Text style={styles.chevron} importantForAccessibility="no">
                {'›'}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: {
    gap: theme.space.sm,
  },
  list: {
    gap: theme.space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    minHeight: theme.touch.row,
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space.lg,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface,
  },
  pressed: {
    opacity: 0.75,
  },
  texts: {
    flex: 1,
    gap: theme.space.xxs,
  },
  title: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
  line: {
    ...theme.type.body,
    color: theme.colors.textDim,
  },
  chevron: {
    ...theme.type.headline,
    fontSize: 20,
    lineHeight: 26,
    color: theme.colors.textDim,
  },
}));
