/**
 * "Your invites" on Home (#314): the open invites of the saved session,
 * live from the server, newest first. A tap opens the waiting screen
 * again (Share, Cancel). An invite leaves the list once the server list
 * drops it: a friend answers it, it is cancelled, or the server marks it
 * expired. The phone clock only gives the time left ("Expiring now" once
 * it says the time is up), so a wrong phone clock never hides an invite.
 *
 * It shows nothing while it loads, with no open invite and after a
 * sign-out. A list that did not load shows a note with **Try again**. A
 * list that came before a lost connection stays; each row's waiting
 * screen loads the invite again.
 */
import type { AuthProvider, InviteView, Invites } from '@tavli/contracts';
import { displayCaps } from '@tavli/ui';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import {
  INVITE_TICK_MS,
  inviteRowText,
  useMyInvites,
  type MyInvitesList,
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
  const { state, retry } = useMyInvites(auth, invites);
  if (state.status === 'failed') {
    const title = t('home.invites.title');
    const again = t('home.online.retry');
    return (
      <View testID="home-invites" style={styles.section}>
        <Header title={title} />
        <View style={styles.failed}>
          <Text testID="home-invites-failed" style={styles.note}>
            {t('home.invites.failed')}
          </Text>
          <ActionButton
            testID="home-invites-retry"
            kind="secondary"
            label={again}
            accessibilityLabel={`${again}, ${title}`}
            onPress={retry}
          />
        </View>
      </View>
    );
  }
  if (state.status !== 'loaded' || state.invites.length === 0) return null;
  // Mounted again when Home comes back into view, so its clock starts
  // from the phone time then, not from when Home was last in view.
  return (
    <InviteRows
      key={focused ? 'focused' : 'blurred'}
      list={state}
      focused={focused}
      onOpen={onOpen}
    />
  );
}

function Header({ title }: { title: string }) {
  return (
    <Text style={styles.header} accessibilityRole="header" accessibilityLabel={title}>
      {displayCaps(title)}
    </Text>
  );
}

interface InviteRowsProps {
  list: MyInvitesList;
  focused: boolean;
  onOpen: (code: string) => void;
}

function InviteRows({ list, focused, onOpen }: InviteRowsProps) {
  const { t } = useTranslation();
  const ticked = usePhoneClock(INVITE_TICK_MS, focused);
  // A new list may come before the clock ticks again.
  const now = Math.max(ticked, list.receivedAt);
  return (
    <View testID="home-invites" style={styles.section}>
      <Header title={t('home.invites.title')} />
      <View style={styles.list}>
        {list.invites.map((invite) => (
          <InviteRow
            key={invite.code}
            invite={invite}
            now={now}
            offset={list.offset}
            onPress={() => onOpen(invite.code)}
          />
        ))}
      </View>
    </View>
  );
}

interface InviteRowProps {
  invite: InviteView;
  now: number;
  offset: number;
  onPress: () => void;
}

function InviteRow({ invite, now, offset, onPress }: InviteRowProps) {
  const { t } = useTranslation();
  const text = inviteRowText(invite, t, now, offset);
  return (
    <Pressable
      testID={`home-invite-${invite.code}`}
      accessibilityRole="button"
      accessibilityLabel={text.label}
      accessibilityHint={t('home.invites.hint')}
      onPress={onPress}
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
  failed: {
    gap: theme.space.sm,
  },
  note: {
    ...theme.type.body,
    color: theme.colors.textDim,
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
