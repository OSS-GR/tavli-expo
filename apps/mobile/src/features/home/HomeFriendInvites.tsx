/**
 * "Invites from friends" on Home (#486): the open friend invites sent to
 * the signed-in player (`Friends.listFriendInvites`, #406). A tap opens
 * the invite (`/invite/<code>`), where the player accepts or declines.
 *
 * - Home renders it only on a phone that has an online account
 *   (`hasOnlineAccount()`), so a phone that never played online makes no
 *   server call. It never makes an account: with nobody signed in it
 *   shows nothing.
 * - It loads each time Home comes into view (`focused`). Only the newest
 *   load may set the list.
 * - It shows nothing while it loads, with no invite, for a guest (friends
 *   need a saved account: `NOT_SAVED`) and after a sign-out. A load that
 *   fails for another reason keeps the list it had: the invite screen
 *   loads each invite again.
 */
import type { AuthProvider, Friends, InviteView } from '@tavli/contracts';
import { isFriendsErrorData } from '@tavli/contracts';
import { displayCaps } from '@tavli/ui';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { CheckerAvatar } from '@/components/CheckerAvatar';
import { playerNameText } from '@/features/online/playerName';

export interface HomeFriendInvitesProps {
  auth: AuthProvider;
  friends: Friends;
  /** Home is in view: each new view loads the list again. */
  focused: boolean;
  /** Opens the invite. */
  onOpen: (code: string) => void;
}

/** The open friend invites to the signed-in player, or none. */
async function loadInvites(auth: AuthProvider, friends: Friends): Promise<readonly InviteView[]> {
  const user = await auth.ready();
  if (user === null || user.isGuest) return [];
  try {
    const list = await friends.listFriendInvites();
    return list.filter((invite) => invite.status === 'open');
  } catch (error) {
    // Not a saved account, or the session is gone: nothing to show.
    if (
      isFriendsErrorData(error) &&
      (error.code === 'NOT_SAVED' || error.code === 'NOT_SIGNED_IN')
    ) {
      return [];
    }
    throw error;
  }
}

export function HomeFriendInvites({ auth, friends, focused, onOpen }: HomeFriendInvitesProps) {
  const { t } = useTranslation();
  const [list, setList] = useState<readonly InviteView[]>([]);
  // Only the newest load may set the list.
  const loads = useRef(0);

  useEffect(() => {
    if (!focused) return;
    loads.current += 1;
    const n = loads.current;
    loadInvites(auth, friends).then(
      (next) => {
        if (n === loads.current) setList(next);
      },
      // A failed load keeps what shows.
      () => {},
    );
    return () => {
      // Home went away or out of view: an answer still on its way is old.
      if (n === loads.current) loads.current += 1;
    };
  }, [auth, friends, focused]);

  if (list.length === 0) return null;
  const title = t('friends.invites.title');
  return (
    <View testID="home-friend-invites" style={styles.section}>
      <Text style={styles.header} accessibilityRole="header" accessibilityLabel={title}>
        {displayCaps(title)}
      </Text>
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
  header: {
    ...theme.type.section,
    color: theme.colors.textDim,
    paddingTop: theme.space.sm,
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
