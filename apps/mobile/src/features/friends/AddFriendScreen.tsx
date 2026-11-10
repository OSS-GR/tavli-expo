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
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useUnistyles } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { RowDivider, SectionCard } from '@/components/SectionCard';
import { Sheet } from '@/components/Sheet';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { useAnnouncement } from '@/features/game/useAnnouncement';
import { playerNameText } from '@/features/online/playerName';

import { friendLinkUrl, friendTokenFromLink } from './friendLink';
import { friendsProblem, useFriendsData, type FriendsProblem } from './friendsData';
import { friendsStyles as styles, NotReady, RefreshFailed, useProblemText } from './FriendsParts';
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
const QR_SIZE = 200;
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
  const [found, setFound] = useState<{ username: string; player: FoundPlayer | null } | null>(null);
  const [pasted, setPasted] = useState('');
  const [pasteBad, setPasteBad] = useState(false);

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
      (player) => setFound({ username: typed, player }),
    );
  };

  const openPasted = () => {
    const token = friendTokenFromLink(pasted);
    if (token === null) {
      setPasteBad(true);
      return;
    }
    setPasteBad(false);
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
        style={styles.body}
        contentContainerStyle={styles.content}
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
              <Text testID="add-friend-problem" style={styles.line}>
                {problemText}
              </Text>
            ) : null}
            {sentText !== null ? (
              <Text testID="add-friend-sent" style={styles.line}>
                {sentText}
              </Text>
            ) : null}
            <SectionCard title={t('friends.add.linkTitle')} padded>
              <View style={styles.padded}>
                <Text style={styles.line}>{t('friends.add.linkIntro')}</Text>
                {/* Until this visit's load answers (or New link sets the
                    link), it may be one reset on another phone: no QR code
                    and no sharing. */}
                {current ? (
                  <View style={styles.center}>
                    <QrCode
                      testID="add-friend-qr"
                      value={link}
                      size={QR_SIZE}
                      label={t('friends.add.qrLabel')}
                    />
                    <Text style={styles.hint}>{t('friends.add.qrHint')}</Text>
                    <Text testID="add-friend-link" style={styles.hint} selectable>
                      {link}
                    </Text>
                  </View>
                ) : (
                  <View testID="add-friend-checking" style={[styles.center, QR_SPACE]}>
                    {state.refreshFailed === true ? null : <ActivityIndicator />}
                    <Text style={styles.hint}>{t('friends.add.checking')}</Text>
                  </View>
                )}
                <View style={styles.buttons}>
                  <ActionButton
                    testID="add-friend-share"
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
                    compact
                    disabled={!current}
                    label={t('friends.add.textMessage')}
                    onPress={() => {
                      Linking.openURL(smsUrl(message)).catch(() => undefined);
                    }}
                  />
                  <ActionButton
                    testID="add-friend-reset"
                    kind="text"
                    compact
                    disabled={busy}
                    label={t('friends.add.reset')}
                    onPress={() => setResetting(true)}
                  />
                </View>
              </View>
            </SectionCard>
            <SectionCard title={t('friends.add.usernameTitle')} padded>
              <View style={styles.padded}>
                <TextInput
                  testID="add-friend-username"
                  style={styles.input}
                  value={username}
                  onChangeText={(next) => {
                    setUsername(next);
                    setFound(null);
                  }}
                  onSubmitEditing={search}
                  placeholder={t('friends.add.usernamePlaceholder')}
                  placeholderTextColor={theme.colors.textDim}
                  accessibilityLabel={t('friends.add.usernameLabel')}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  spellCheck={false}
                  returnKeyType="search"
                />
                <ActionButton
                  testID="add-friend-search"
                  kind="secondary"
                  disabled={busy || username.trim() === ''}
                  label={t('friends.add.search')}
                  onPress={search}
                />
                {found !== null && found.player === null ? (
                  <Text testID="add-friend-not-found" style={styles.line}>
                    {t('friends.add.notFound')}
                  </Text>
                ) : null}
                {found !== null && found.player !== null ? (
                  <PlayerRow
                    testID="add-friend-found"
                    name={nameOf(found.player.name)}
                    status={found.player.status}
                    busy={busy}
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
                ) : null}
              </View>
            </SectionCard>
            <SectionCard title={t('friends.add.pasteTitle')} padded>
              <View style={styles.padded}>
                <TextInput
                  testID="add-friend-paste"
                  style={styles.input}
                  value={pasted}
                  onChangeText={(next) => {
                    setPasted(next);
                    setPasteBad(false);
                  }}
                  onSubmitEditing={openPasted}
                  placeholder="tavlaki://add/…"
                  placeholderTextColor={theme.colors.textDim}
                  accessibilityLabel={t('friends.add.pasteLabel')}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  spellCheck={false}
                />
                <ActionButton
                  testID="add-friend-open-link"
                  kind="secondary"
                  disabled={pasted.trim() === ''}
                  label={t('friends.add.openLink')}
                  onPress={openPasted}
                />
                {pasteBad ? (
                  <Text testID="add-friend-paste-bad" style={styles.line}>
                    {t('friends.add.pasteBad')}
                  </Text>
                ) : null}
              </View>
            </SectionCard>
            <SectionCard title={t('friends.add.recentTitle')} testID="add-friend-recent">
              {state.data.recent.length === 0 ? (
                <View style={styles.row}>
                  <Text testID="add-friend-recent-empty" style={styles.line}>
                    {t('friends.add.recentEmpty')}
                  </Text>
                </View>
              ) : (
                state.data.recent.map((player, i) => (
                  <View key={player.playerId}>
                    {i > 0 ? <RowDivider /> : null}
                    <View style={styles.row}>
                      <PlayerRow
                        testID={`recent-${player.playerId}`}
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
                  </View>
                ))
              )}
            </SectionCard>
            <Text style={styles.hint}>{t('friends.add.noContacts')}</Text>
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

interface PlayerRowProps {
  testID: string;
  name: string;
  status: FriendStatus;
  busy: boolean;
  onAsk: () => void;
}

/** A found or recent player: Ask when you are not friends yet, else where you stand. */
function PlayerRow({ testID, name, status, busy, onAsk }: PlayerRowProps) {
  const { t } = useTranslation();
  return (
    <View testID={testID} style={styles.padded}>
      <Text style={styles.name}>{name}</Text>
      {status === 'none' ? (
        <View style={styles.buttons}>
          <ActionButton
            testID={`${testID}-ask`}
            compact
            disabled={busy}
            label={t('friends.add.ask')}
            accessibilityLabel={t('friends.add.askLabel', { name })}
            onPress={onAsk}
          />
        </View>
      ) : (
        <Text testID={`${testID}-status`} style={styles.hint}>
          {t(`friends.status.${status}`)}
        </Text>
      )}
    </View>
  );
}
