/**
 * Add a friend (#406). Four ways, and none reads the contacts:
 *
 * - **Your friend link** (`tavlaki://add/<token>`) and its QR code. A
 *   friend scans the code with the phone's own camera, which opens the
 *   app: the app has no scanner and never asks for the camera. Share
 *   opens the share sheet; Text message opens the Messages app with the
 *   link, where the system lets you pick a contact. New link makes a new
 *   token (asks first): the old link stops working.
 * - **Username:** an exact search (`findPlayer`), then Ask
 *   (`requestByUsername`). "No such player" and a block read the same.
 * - **A pasted friend link:** some apps do not open `tavlaki://` links,
 *   so a friend can paste one here.
 * - **Recent players** of your online games, with Ask.
 *
 * Friends need a saved account (`NotReady` shows the other states).
 * One call at a time; a failed call says why, also to screen readers. A
 * call that finds the player signed out or a guest shows that instead.
 *
 * Navigation stays in the route (`app/friends/add.tsx`).
 */
import type {
  AuthProvider,
  FoundPlayer,
  FriendStatus,
  Friends,
  RecentPlayer,
} from '@tavli/contracts';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { CheckerAvatar } from '@/components/CheckerAvatar';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icons';
import { FieldProblem } from '@/components/Problem';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { CardFrame, RowDivider } from '@/components/SectionCard';
import { SectionHeader } from '@/components/SectionHeader';
import { Sheet } from '@/components/Sheet';
import { Surface, surfaceStyle } from '@/components/Surface';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { useAnnouncement } from '@/features/game/useAnnouncement';
import { playerNameText } from '@/features/online/playerName';

import { friendLinkUrl, friendTokenFromLink } from './friendLink';
import { friendsProblem, useFriendsData, type FriendsProblem } from './friendsData';
import { Footnote, friendsStyles, NotReady, RefreshFailed, useProblemText } from './FriendsParts';
import { QrCode } from './QrCode';

export interface AddFriendScreenProps {
  /** Counts the times the screen shows (the route): each new one loads again. */
  visit?: number;
  auth: AuthProvider;
  friends: Friends;
  onBack: () => void;
  /** Opens the screen of a pasted friend link. */
  onLink: (token: string) => void;
  /** Opens Settings → Account (a guest saves the account there). */
  onAccount: () => void;
}

interface AddData {
  readonly token: string;
  readonly recent: readonly RecentPlayer[];
}

/** The QR code's width in points. */
const QR_SIZE = 176;
/** Keeps the room of the QR code while the link is checked. */
const QR_SPACE = { minHeight: QR_SIZE, justifyContent: 'center' } as const;

/** Names each problem and each sent request for this app run (`useAnnouncement`). */
let eventCount = 0;

/** The Messages app with a text ready; the person picks who gets it. */
export function smsUrl(body: string): string {
  // iOS reads the body after `&`, Android after `?`.
  const separator = Platform.OS === 'ios' ? '&' : '?';
  return `sms:${separator}body=${encodeURIComponent(body)}`;
}

export function AddFriendScreen({
  auth,
  friends,
  onBack,
  onLink,
  onAccount,
  visit = 0,
}: AddFriendScreenProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const titleRef = useFocusOnShow();
  const load = useCallback(async (): Promise<AddData> => {
    const [token, recent] = await Promise.all([friends.myFriendLink(), friends.recentPlayers()]);
    return { token, recent };
  }, [friends]);
  const { state, current, reload, retry, replace, sessionLost } = useFriendsData(auth, load, visit);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ kind: FriendsProblem; n: number } | null>(null);
  const [sent, setSent] = useState<{ name: string; status: FriendStatus; n: number } | null>(null);
  const [resetting, setResetting] = useState(false);
  const [username, setUsername] = useState('');
  // The username the result is for, and the result (`null`: nobody).
  // `n` names the search for screen readers (`FieldProblem`).
  const [found, setFound] = useState<{
    username: string;
    player: FoundPlayer | null;
    n: number;
  } | null>(null);
  const [pasted, setPasted] = useState('');
  // A pasted text that is no friend link, named for screen readers; `null`: none.
  const [pasteBad, setPasteBad] = useState<number | null>(null);
  // The paste row is open (#503): it shows the field.
  const [pasting, setPasting] = useState(false);
  // The username field has focus: a brass edge.
  const [focused, setFocused] = useState(false);

  const problemText = useProblemText(problem?.kind ?? null);
  useAnnouncement(problemText, problem === null ? undefined : `add-friend-problem:${problem.n}`);
  const sentText =
    sent === null
      ? null
      : sent.status === 'friends'
        ? t('friends.add.nowFriends', { name: sent.name })
        : t('friends.add.sent', { name: sent.name });
  useAnnouncement(sentText, sent === null ? undefined : `add-friend-sent:${sent.n}`);

  const nameOf = (name: FoundPlayer['name']) => playerNameText(name, t) ?? t('friends.unnamed');

  const run = <T,>(call: () => Promise<T>, done: (value: T) => void) => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    setSent(null);
    call().then(
      (value) => {
        setBusy(false);
        done(value);
      },
      (error: unknown) => {
        setBusy(false);
        // Signed out or a guest: the screen says so, as after a load.
        if (sessionLost(error)) return;
        eventCount += 1;
        setProblem({ kind: friendsProblem(error), n: eventCount });
      },
    );
  };

  const asked = (name: string) => (status: FriendStatus) => {
    eventCount += 1;
    setSent({ name, status, n: eventCount });
    reload();
  };

  const search = () => {
    const typed = username.trim();
    if (typed === '') return;
    run(
      () => friends.findPlayer(typed),
      (player) => {
        eventCount += 1;
        setFound({ username: typed, player, n: eventCount });
      },
    );
  };

  const openPasted = () => {
    const token = friendTokenFromLink(pasted);
    if (token === null) {
      eventCount += 1;
      setPasteBad(eventCount);
      return;
    }
    setPasteBad(null);
    onLink(token);
  };

  const token = state.kind === 'ready' ? state.data.token : null;
  const link = token === null ? null : friendLinkUrl(token);
  const message = link === null ? '' : t('friends.add.shareMessage', { link });

  return (
    <Screen testID="add-friend-screen">
      <ScreenHeader
        title={t('friends.add.title')}
        titleRef={titleRef}
        onBack={onBack}
        backLabel={t('common.back')}
        testID="add-friend-back"
      />
      <ScrollView
        style={friendsStyles.body}
        contentContainerStyle={friendsStyles.content}
        keyboardShouldPersistTaps="handled">
        {state.kind !== 'ready' || link === null ? (
          <NotReady
            state={state.kind === 'ready' ? { kind: 'loading' } : state}
            onRetry={retry}
            onAccount={onAccount}
            testID="add-friend"
          />
        ) : (
          <>
            {state.refreshFailed === true ? (
              <RefreshFailed onRetry={reload} testID="add-friend" />
            ) : null}
            {problemText !== null ? (
              <Text testID="add-friend-problem" style={friendsStyles.line}>
                {problemText}
              </Text>
            ) : null}
            {sentText !== null ? (
              <Text testID="add-friend-sent" style={friendsStyles.line}>
                {sentText}
              </Text>
            ) : null}
            <Surface tier="raised" style={styles.linkCard}>
              <View style={styles.linkHead}>
                <Text accessibilityRole="header" style={styles.cardTitle}>
                  {t('friends.add.linkTitle')}
                </Text>
                <Text style={styles.cardIntro}>{t('friends.add.linkIntro')}</Text>
              </View>
              {/* Until this visit's load answers (or New link sets the
                  link), it may be one reset on another phone: no QR code
                  and no sharing. */}
              {current ? (
                <View style={friendsStyles.center}>
                  <View style={styles.qrTile}>
                    <QrCode
                      testID="add-friend-qr"
                      value={link}
                      size={QR_SIZE}
                      label={t('friends.add.qrLabel')}
                    />
                  </View>
                  <Text style={styles.small}>{t('friends.add.qrHint')}</Text>
                  <Text testID="add-friend-link" style={styles.small} selectable>
                    {link}
                  </Text>
                </View>
              ) : (
                <View testID="add-friend-checking" style={[friendsStyles.center, QR_SPACE]}>
                  {state.refreshFailed === true ? null : <ActivityIndicator />}
                  <Text style={styles.small}>{t('friends.add.checking')}</Text>
                </View>
              )}
              <View style={styles.shareRow}>
                <ActionButton
                  testID="add-friend-share"
                  icon="share"
                  grow
                  compact
                  disabled={!current}
                  label={t('friends.add.share')}
                  onPress={() => {
                    Share.share({ message }).catch((error: unknown) =>
                      console.warn('share failed', error),
                    );
                  }}
                />
                <ActionButton
                  testID="add-friend-sms"
                  kind="secondary"
                  icon="messageCircle"
                  grow
                  compact
                  disabled={!current}
                  label={t('friends.add.textMessage')}
                  onPress={() => {
                    Linking.openURL(smsUrl(message)).catch(() => undefined);
                  }}
                />
              </View>
              <ActionButton
                testID="add-friend-reset"
                kind="text"
                icon="rotateCcw"
                disabled={busy}
                label={t('friends.add.reset')}
                onPress={() => setResetting(true)}
              />
            </Surface>
            <View style={styles.section}>
              <SectionHeader title={t('friends.add.usernameTitle')} />
              <View style={styles.searchRow}>
                <View style={[styles.field, focused && styles.fieldFocused]}>
                  <Icon name="search" size={18} color={theme.colors.textDim} />
                  <TextInput
                    testID="add-friend-username"
                    style={styles.input}
                    value={username}
                    onChangeText={(next) => {
                      setUsername(next);
                      setFound(null);
                    }}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    onSubmitEditing={search}
                    placeholder={t('friends.add.usernamePlaceholder')}
                    placeholderTextColor={theme.colors.textFaint}
                    accessibilityLabel={t('friends.add.usernameLabel')}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="off"
                    spellCheck={false}
                    returnKeyType="search"
                  />
                </View>
                <IconButton
                  testID="add-friend-search"
                  icon="search"
                  label={t('friends.add.search')}
                  disabled={busy || username.trim() === ''}
                  onPress={search}
                />
              </View>
              <FieldProblem
                testID="add-friend-not-found"
                text={found !== null && found.player === null ? t('friends.add.notFound') : null}
                eventKey={`add-friend-not-found:${found?.n ?? 0}`}
              />
              {found !== null && found.player !== null ? (
                <CardFrame>
                  <PlayerRow
                    testID="add-friend-found"
                    playerKey={found.username}
                    name={nameOf(found.player.name)}
                    status={found.player.status}
                    busy={busy}
                    primary
                    onAsk={() =>
                      run(
                        () => friends.requestByUsername(found.username),
                        (status) => {
                          setFound(null);
                          setUsername('');
                          asked(nameOf(found.player?.name ?? null))(status);
                        },
                      )
                    }
                  />
                </CardFrame>
              ) : null}
            </View>
            <CardFrame testID="add-friend-paste-card">
              <Pressable
                testID="add-friend-paste-row"
                accessibilityRole="button"
                accessibilityLabel={t('friends.add.pasteTitle')}
                accessibilityHint={t('friends.add.pasteHint')}
                accessibilityState={{ expanded: pasting }}
                onPress={() => setPasting((open) => !open)}
                style={({ pressed }) => [styles.pasteRow, pressed && styles.pressed]}>
                <Icon name="clipboard" size={22} color={theme.colors.accent} />
                <View style={styles.texts}>
                  <Text style={friendsStyles.name}>{t('friends.add.pasteTitle')}</Text>
                  <Text style={styles.hint}>{t('friends.add.pasteHint')}</Text>
                </View>
                <Icon
                  name={pasting ? 'chevronDown' : 'chevronRight'}
                  size={18}
                  color={theme.colors.textDim}
                />
              </Pressable>
              {pasting ? (
                <View style={styles.pasteBody}>
                  <View style={styles.field}>
                    <TextInput
                      testID="add-friend-paste"
                      style={styles.input}
                      value={pasted}
                      onChangeText={(next) => {
                        setPasted(next);
                        setPasteBad(null);
                      }}
                      onSubmitEditing={openPasted}
                      placeholder="tavlaki://add/…"
                      placeholderTextColor={theme.colors.textFaint}
                      accessibilityLabel={t('friends.add.pasteLabel')}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </View>
                  <FieldProblem
                    testID="add-friend-paste-bad"
                    text={pasteBad === null ? null : t('friends.add.pasteBad')}
                    eventKey={`add-friend-paste-bad:${pasteBad ?? 0}`}
                  />
                  <ActionButton
                    testID="add-friend-open-link"
                    kind="secondary"
                    disabled={pasted.trim() === ''}
                    label={t('friends.add.openLink')}
                    onPress={openPasted}
                  />
                </View>
              ) : null}
            </CardFrame>
            <View style={styles.section}>
              <SectionHeader title={t('friends.add.recentTitle')} />
              <CardFrame testID="add-friend-recent">
                {state.data.recent.length === 0 ? (
                  <View style={friendsStyles.row}>
                    <Text testID="add-friend-recent-empty" style={friendsStyles.line}>
                      {t('friends.add.recentEmpty')}
                    </Text>
                  </View>
                ) : (
                  state.data.recent.map((player, i) => (
                    <View key={player.playerId}>
                      {i > 0 ? <RowDivider /> : null}
                      <PlayerRow
                        testID={`recent-${player.playerId}`}
                        playerKey={player.playerId}
                        name={nameOf(player.name)}
                        status={player.status}
                        busy={busy}
                        onAsk={() =>
                          run(
                            () => friends.sendRequest(player.playerId),
                            asked(nameOf(player.name)),
                          )
                        }
                      />
                    </View>
                  ))
                )}
              </CardFrame>
            </View>
            <Footnote icon="lock" text={t('friends.add.noContacts')} />
          </>
        )}
      </ScrollView>
      <Sheet
        visible={resetting}
        onClose={() => setResetting(false)}
        closeLabel={t('common.cancel')}
        look="dialog">
        {resetting ? (
          <ConfirmDialog
            testID="add-friend-reset-dialog"
            title={t('friends.add.resetTitle')}
            lines={[t('friends.add.resetBody')]}
            confirmLabel={t('friends.add.resetConfirm')}
            cancelLabel={t('common.cancel')}
            onConfirm={() => {
              setResetting(false);
              run(
                () => friends.resetFriendLink(),
                (next) => replace((data) => ({ ...data, token: next })),
              );
            }}
            onCancel={() => setResetting(false)}
          />
        ) : null}
      </Sheet>
    </Screen>
  );
}

/** The square search button next to the username field. */
function IconButton({
  testID,
  icon,
  label,
  disabled,
  onPress,
}: {
  testID: string;
  icon: IconName;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        disabled && styles.iconButtonDisabled,
        pressed && styles.pressed,
      ]}>
      <Icon
        name={icon}
        size={22}
        color={disabled ? theme.colors.onAccentMuted : theme.colors.onAccent}
      />
    </Pressable>
  );
}

interface PlayerRowProps {
  testID: string;
  /** Picks the avatar's wood. */
  playerKey: string;
  name: string;
  status: FriendStatus;
  busy: boolean;
  /** Add is the main action here (a search result). */
  primary?: boolean;
  onAsk: () => void;
}

/** A found or recent player: Add when you are not friends yet, else a chip with where you stand. */
function PlayerRow({
  testID,
  playerKey,
  name,
  status,
  busy,
  primary = false,
  onAsk,
}: PlayerRowProps) {
  const { t } = useTranslation();
  return (
    <View testID={testID} style={styles.playerRow}>
      <CheckerAvatar playerKey={playerKey} name={name} />
      <Text style={[friendsStyles.name, styles.texts]}>{name}</Text>
      {status === 'none' ? (
        <ActionButton
          testID={`${testID}-ask`}
          kind={primary ? 'primary' : 'secondary'}
          size="small"
          icon="userPlus"
          disabled={busy}
          label={t('friends.add.ask')}
          accessibilityLabel={t('friends.add.askLabel', { name })}
          onPress={onAsk}
        />
      ) : (
        <View style={styles.chip} accessible accessibilityLabel={t(`friends.status.${status}`)}>
          <Text testID={`${testID}-status`} style={styles.chipText}>
            {t(`friends.chip.${status}`)}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  linkCard: {
    gap: theme.space.lg,
    padding: theme.space.xl,
  },
  linkHead: {
    gap: theme.space.xs,
  },
  cardTitle: {
    ...theme.type.title3,
    color: theme.colors.text,
  },
  cardIntro: {
    ...theme.type.callout,
    color: theme.colors.textDim,
  },
  qrTile: {
    padding: theme.space.md,
    borderRadius: theme.radii.tray,
    borderWidth: 1,
    borderColor: theme.colors.accentLine,
    // The code's own light, not a theme color (see `QrCode`).
    backgroundColor: '#FFFFFF',
  },
  small: {
    ...theme.type.footnote,
    textAlign: 'center',
    color: theme.colors.textDim,
  },
  hint: {
    ...theme.type.footnote,
    color: theme.colors.textDim,
  },
  shareRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.md,
  },
  section: {
    gap: theme.space.sm,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: theme.space.md,
  },
  field: {
    ...surfaceStyle(theme, 'sunken'),
    flex: 1,
    minHeight: theme.touch.button,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.md,
  },
  fieldFocused: {
    borderColor: theme.colors.accent,
  },
  input: {
    ...theme.type.body,
    flex: 1,
    paddingVertical: theme.space.sm,
    color: theme.colors.text,
  },
  iconButton: {
    width: theme.touch.button,
    minHeight: theme.touch.button,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.accent,
  },
  iconButtonDisabled: {
    backgroundColor: theme.colors.accentMuted,
  },
  pressed: {
    opacity: 0.7,
  },
  texts: {
    flex: 1,
    gap: theme.space.xxs,
  },
  pasteRow: {
    minHeight: theme.touch.row,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
  },
  pasteBody: {
    gap: theme.space.md,
    paddingHorizontal: theme.space.lg,
    paddingBottom: theme.space.lg,
  },
  playerRow: {
    minHeight: theme.touch.row,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.md,
  },
  chip: {
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.xxs,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.backgroundDeep,
  },
  chipText: {
    ...theme.type.footnote,
    fontWeight: '600',
    color: theme.colors.textDim,
  },
}));
