/**
 * "Your invites" on Home (#314): the open invites of the saved session,
 * live from the server, newest first. A tap opens the waiting screen
 * again (Share, Cancel). An invite leaves the list once a friend answers
 * it, it is cancelled, or its time is up on the phone clock.
 *
 * It shows nothing while it loads, with no open invite, after a sign-out,
 * and when the list did not load: "Your online games" above it already
 * says when the server cannot be reached. A list that came before a lost
 * connection stays; each row's waiting screen loads the invite again.
 */
import type { AuthProvider, Invites } from '@tavli/contracts';
import { displayCaps } from '@tavli/ui';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import {
  INVITE_TICK_MS,
  inviteRowText,
  openInvites,
  useMyInvites,
} from '@/features/invites/myInvites';
import { usePhoneClock } from '@/features/online/myGames';

export interface HomeInvitesProps {
  auth: AuthProvider;
  invites: Invites;
  /** Home is in view: the clocks tick only then. */
  focused: boolean;
  /** Opens the waiting screen of the invite. */
  onOpen: (code: string) => void;
}

export function HomeInvites({ auth, invites, focused, onOpen }: HomeInvitesProps) {
  const { t } = useTranslation();
  const { state } = useMyInvites(auth, invites);
  const list = state.status === 'loaded' ? state : null;
  const now = usePhoneClock(
    list !== null && list.invites.length > 0 ? INVITE_TICK_MS : null,
    focused,
  );
  if (list === null) return null;
  const shown = openInvites(list.invites, now, list.offset);
  if (shown.length === 0) return null;
  const title = t('home.invites.title');
  return (
    <View testID="home-invites" style={styles.section}>
      <Text style={styles.header} accessibilityRole="header" accessibilityLabel={title}>
        {displayCaps(title)}
      </Text>
      <View style={styles.list}>
        {shown.map((invite) => {
          const text = inviteRowText(invite, t, now, list.offset);
          return (
            <Pressable
              key={invite.code}
              testID={`home-invite-${invite.code}`}
              accessibilityRole="button"
              accessibilityLabel={text.label}
              accessibilityHint={t('home.invites.hint')}
              onPress={() => onOpen(invite.code)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <View style={styles.texts}>
                <Text style={styles.title}>{text.title}</Text>
                <Text style={styles.line}>{text.line}</Text>
                <Text style={styles.code}>{text.code}</Text>
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
    borderColor: theme.colors.border,
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
  code: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  chevron: {
    ...theme.type.title,
    color: theme.colors.textDim,
  },
}));
