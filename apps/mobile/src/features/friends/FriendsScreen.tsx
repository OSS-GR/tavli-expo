/**
 * Friends (#406), from Settings → Online: friend invites to you, friend
 * requests both ways, and your friends with your record against each.
 *
 * - Friends need a saved account (ADR-0008). A guest reads that and gets
 *   a button to Settings → Account; nobody signed in reads that too. The
 *   screen makes no account.
 * - A friend row has Invite (a game invite with a push, no code),
 *   Remove (asks first) and Report or block (`ReportOrBlockSheet`). A
 *   block ends the friendship on the server, so the list loads again
 *   when the sheet closes.
 * - A request to you has Accept and Decline; one you sent has Cancel.
 * - One call at a time. A call that fails keeps the list and says so,
 *   also to screen readers (`useAnnouncement`).
 * - Focus moves to the title. Large fonts scroll: no text has a line limit.
 *
 * Navigation stays in the route (`app/friends/index.tsx`).
 */
import type {
  AuthProvider,
  Friend,
  FriendRequests,
  Friends,
  InviteView,
  Safety,
} from '@tavli/contracts';
import { useLocales } from 'expo-localization';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { ActionButton } from '@/components/ActionButton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { RowDivider, SectionCard } from '@/components/SectionCard';
import { Sheet } from '@/components/Sheet';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { useAnnouncement } from '@/features/game/useAnnouncement';
import { dateLocale, formatDate } from '@/features/history/format';
import { playerNameText } from '@/features/online/playerName';
import { ReportOrBlockSheet, type SafetyPlayer } from '@/features/safety/ReportOrBlock';

import { friendsProblem, useFriendsData, type FriendsProblem } from './friendsData';
import { friendsStyles as styles, NotReady, RefreshFailed, useProblemText } from './FriendsParts';

export interface FriendsScreenProps {
  /** Counts the times the screen shows (the route): each new one loads again. */
  visit?: number;
  auth: AuthProvider;
  friends: Friends;
  /** Report or block. `undefined`: the rows have no such button. */
  safety?: Safety;
  onBack: () => void;
  /** Opens Add a friend. */
  onAdd: () => void;
  /** Opens the game setup for a friend invite. */
  onInvite: (playerId: string) => void;
  /** Opens a friend invite to you (the invite screen). */
  onOpenInvite: (code: string) => void;
  /** Opens Settings → Account (a guest saves the account there). */
  onAccount: () => void;
}

interface FriendsData {
  readonly friends: readonly Friend[];
  readonly requests: FriendRequests;
  readonly invites: readonly InviteView[];
}

/** Names each problem for this app run, so the same problem twice is read twice. */
let problemCount = 0;

export function FriendsScreen({
  auth,
  friends,
  safety,
  onBack,
  onAdd,
  onInvite,
  onOpenInvite,
  onAccount,
  visit = 0,
}: FriendsScreenProps) {
  const { t, i18n } = useTranslation();
  const locale = dateLocale(i18n.resolvedLanguage ?? i18n.language, useLocales());
  const titleRef = useFocusOnShow();
  const load = useCallback(async (): Promise<FriendsData> => {
    const [list, requests, invites] = await Promise.all([
      friends.listFriends(),
      friends.listRequests(),
      friends.listFriendInvites(),
    ]);
    return { friends: list, requests, invites: invites.filter((i) => i.status === 'open') };
  }, [friends]);
  const { state, reload, retry } = useFriendsData(auth, load, visit);
  // The player whose call is on its way.
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ kind: FriendsProblem; n: number } | null>(null);
  const [removing, setRemoving] = useState<Friend | null>(null);
  const [reporting, setReporting] = useState<SafetyPlayer | null>(null);
  const problemText = useProblemText(problem?.kind ?? null);
  useAnnouncement(problemText, problem === null ? undefined : `friends-problem:${problem.n}`);

  const nameOf = (name: Friend['name']) => playerNameText(name, t) ?? t('friends.unnamed');

  const run = (playerId: string, call: () => Promise<unknown>) => {
    if (busy !== null) return;
    setBusy(playerId);
    setProblem(null);
    call().then(
      () => {
        setBusy(null);
        reload();
      },
      (error: unknown) => {
        setBusy(null);
        problemCount += 1;
        setProblem({ kind: friendsProblem(error), n: problemCount });
        reload();
      },
    );
  };

  return (
    <Screen testID="friends-screen">
      <ScreenHeader
        title={t('friends.title')}
        titleRef={titleRef}
        onBack={onBack}
        backLabel={t('common.back')}
        testID="friends-back"
      />
      <ScrollView style={styles.body} contentContainerStyle={styles.content}>
        {state.kind !== 'ready' ? (
          <NotReady state={state} onRetry={retry} onAccount={onAccount} testID="friends" />
        ) : (
          <>
            <ActionButton testID="friends-add" label={t('friends.addButton')} onPress={onAdd} />
            {state.refreshFailed === true ? (
              <RefreshFailed onRetry={reload} testID="friends" />
            ) : null}
            {problemText !== null ? (
              <Text testID="friends-problem" style={styles.line}>
                {problemText}
              </Text>
            ) : null}
            {state.data.invites.length > 0 ? (
              <SectionCard title={t('friends.invites.title')} testID="friends-invites">
                {state.data.invites.map((invite, i) => (
                  <View key={invite.code}>
                    {i > 0 ? <RowDivider /> : null}
                    <View testID={`friend-invite-${invite.code}`} style={styles.row}>
                      <Text style={styles.name}>
                        {t('friends.invites.from', { name: nameOf(invite.fromName) })}
                      </Text>
                      <Text style={styles.hint}>
                        {t('friends.invites.game', {
                          game: t(`games.${invite.choice}`),
                          count: invite.targetPoints,
                        })}
                      </Text>
                      <View style={styles.buttons}>
                        <ActionButton
                          testID={`friend-invite-${invite.code}-open`}
                          compact
                          label={t('friends.invites.open')}
                          onPress={() => onOpenInvite(invite.code)}
                        />
                      </View>
                    </View>
                  </View>
                ))}
              </SectionCard>
            ) : null}
            {state.data.requests.incoming.length > 0 ? (
              <SectionCard title={t('friends.incoming.title')} testID="friends-incoming">
                {state.data.requests.incoming.map((request, i) => (
                  <RequestRow
                    key={request.playerId}
                    first={i === 0}
                    testID={`friend-incoming-${request.playerId}`}
                    name={nameOf(request.name)}
                    hint={t('friends.incoming.sent', {
                      date: formatDate(request.sentAt, locale),
                    })}
                    busy={busy !== null}
                    buttons={[
                      {
                        key: 'accept',
                        label: t('friends.incoming.accept'),
                        accessibilityLabel: t('friends.incoming.acceptLabel', {
                          name: nameOf(request.name),
                        }),
                        primary: true,
                        onPress: () =>
                          run(request.playerId, () => friends.acceptRequest(request.playerId)),
                      },
                      {
                        key: 'decline',
                        label: t('friends.incoming.decline'),
                        accessibilityLabel: t('friends.incoming.declineLabel', {
                          name: nameOf(request.name),
                        }),
                        onPress: () =>
                          run(request.playerId, () => friends.declineRequest(request.playerId)),
                      },
                    ]}
                  />
                ))}
              </SectionCard>
            ) : null}
            <SectionCard title={t('friends.list.title')} testID="friends-list">
              {state.data.friends.length === 0 ? (
                <View style={styles.row}>
                  <Text testID="friends-empty" style={styles.line}>
                    {t('friends.list.empty')}
                  </Text>
                </View>
              ) : (
                state.data.friends.map((friend, i) => {
                  const name = nameOf(friend.name);
                  return (
                    <View key={friend.playerId}>
                      {i > 0 ? <RowDivider /> : null}
                      <View testID={`friend-${friend.playerId}`} style={styles.row}>
                        <Text style={styles.name}>{name}</Text>
                        <Text style={styles.hint}>
                          {t('friends.list.record', {
                            wins: friend.record.wins,
                            losses: friend.record.losses,
                          })}
                        </Text>
                        <View style={styles.buttons}>
                          <ActionButton
                            testID={`friend-${friend.playerId}-invite`}
                            compact
                            disabled={busy !== null}
                            label={t('friends.list.invite')}
                            accessibilityLabel={t('friends.list.inviteLabel', { name })}
                            onPress={() => onInvite(friend.playerId)}
                          />
                          <ActionButton
                            testID={`friend-${friend.playerId}-remove`}
                            kind="secondary"
                            compact
                            disabled={busy !== null}
                            label={t('friends.list.remove')}
                            accessibilityLabel={t('friends.list.removeLabel', { name })}
                            onPress={() => setRemoving(friend)}
                          />
                          {safety ? (
                            <ActionButton
                              testID={`friend-${friend.playerId}-report`}
                              kind="text"
                              compact
                              disabled={busy !== null}
                              label={t('friends.list.report')}
                              accessibilityLabel={t('safety.actionLabel', { name })}
                              onPress={() =>
                                setReporting({ id: friend.playerId, name: friend.name })
                              }
                            />
                          ) : null}
                        </View>
                      </View>
                    </View>
                  );
                })
              )}
            </SectionCard>
            {state.data.requests.outgoing.length > 0 ? (
              <SectionCard title={t('friends.outgoing.title')} testID="friends-outgoing">
                {state.data.requests.outgoing.map((request, i) => (
                  <RequestRow
                    key={request.playerId}
                    first={i === 0}
                    testID={`friend-outgoing-${request.playerId}`}
                    name={nameOf(request.name)}
                    hint={t('friends.outgoing.sent', {
                      date: formatDate(request.sentAt, locale),
                    })}
                    busy={busy !== null}
                    buttons={[
                      {
                        key: 'cancel',
                        label: t('friends.outgoing.cancel'),
                        accessibilityLabel: t('friends.outgoing.cancelLabel', {
                          name: nameOf(request.name),
                        }),
                        onPress: () =>
                          run(request.playerId, () => friends.cancelRequest(request.playerId)),
                      },
                    ]}
                  />
                ))}
              </SectionCard>
            ) : null}
            <Text style={styles.hint}>{t('friends.note')}</Text>
          </>
        )}
      </ScrollView>
      <Sheet
        visible={removing !== null}
        onClose={() => setRemoving(null)}
        closeLabel={t('common.cancel')}
        look="dialog">
        {removing !== null ? (
          <ConfirmDialog
            testID="friend-remove-dialog"
            title={t('friends.remove.title', { name: nameOf(removing.name) })}
            lines={[t('friends.remove.body')]}
            confirmLabel={t('friends.remove.confirm')}
            cancelLabel={t('common.cancel')}
            onConfirm={() => {
              const friend = removing;
              setRemoving(null);
              run(friend.playerId, () => friends.removeFriend(friend.playerId));
            }}
            onCancel={() => setRemoving(null)}
          />
        ) : null}
      </Sheet>
      {safety ? (
        <ReportOrBlockSheet
          player={reporting}
          safety={safety}
          onClose={() => {
            setReporting(null);
            // A block ends the friendship: load the list again.
            reload();
          }}
        />
      ) : null}
    </Screen>
  );
}

interface RowButton {
  key: string;
  label: string;
  accessibilityLabel: string;
  primary?: boolean;
  onPress: () => void;
}

interface RequestRowProps {
  first: boolean;
  testID: string;
  name: string;
  hint: string;
  busy: boolean;
  buttons: readonly RowButton[];
}

function RequestRow({ first, testID, name, hint, busy, buttons }: RequestRowProps) {
  return (
    <View>
      {first ? null : <RowDivider />}
      <View testID={testID} style={styles.row}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.hint}>{hint}</Text>
        <View style={styles.buttons}>
          {buttons.map((button) => (
            <ActionButton
              key={button.key}
              testID={`${testID}-${button.key}`}
              kind={button.primary ? 'primary' : 'secondary'}
              compact
              disabled={busy}
              label={button.label}
              accessibilityLabel={button.accessibilityLabel}
              onPress={button.onPress}
            />
          ))}
        </View>
      </View>
    </View>
  );
}
