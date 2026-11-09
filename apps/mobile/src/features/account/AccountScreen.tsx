/**
 * Settings → Account (#402, ADR-0008): who this phone plays as online,
 * what is kept where, and the account's actions. The state and the calls
 * are in `useAccount.ts`.
 *
 * - Offline (this phone never played online): no server call. On an
 *   iPhone, Continue with Apple signs in to an account (one made on
 *   another phone, or a new one). A guest is never made here.
 * - Guest: "You play as Guest 4821", Save my account (Apple), Delete my
 *   guest account. A guest has no Sign out: with no key it could never
 *   come back.
 * - Saved: the username (to Settings → Username), the ways to sign in
 *   (never remove the last), Sign out and Delete my account.
 * - Each problem and note is read to screen readers (`useAnnouncement`).
 *   The dialogs hide the screen behind them (`Sheet`) and move focus to
 *   their title. No text has a line limit, so large fonts wrap and scroll.
 *
 * Navigation stays in the route (`app/account.tsx`).
 */
import type { AuthKeyProvider } from '@tavli/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionCard, SectionRow } from '@/components/SectionCard';
import { Sheet } from '@/components/Sheet';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { useAnnouncement } from '@/features/game/useAnnouncement';
import { AppleSignInButton } from '@/services';

import { addableKeys, useAccount, type Account, type AccountDeps } from './useAccount';

export interface AccountScreenProps {
  deps: AccountDeps;
  onBack: () => void;
  /** Opens Settings → Username. */
  onUsername: () => void;
  /** Changes each time the screen shows again, so a new username shows. */
  visit?: number;
}

type Dialog = 'signOut' | 'deleteGuest' | 'deleteSaved';

export function AccountScreen({ deps, onBack, onUsername, visit = 0 }: AccountScreenProps) {
  const { t } = useTranslation();
  const titleRef = useFocusOnShow();
  const account = useAccount(deps, visit);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const { state, busy, problem, note, said } = account;

  const problemText = problem === null ? null : t(`account.problem.${problem}`);
  const noteText = note === null ? null : t(`account.note.${note}`);
  useAnnouncement(problemText, problemText === null ? undefined : `account:${said}`);
  useAnnouncement(noteText, noteText === null ? undefined : `account:${said}`);
  useAnnouncement(busy === null ? null : t(`account.busy.${busy}`));

  const confirm = () => {
    const was = dialog;
    setDialog(null);
    if (was === 'signOut') account.signOut();
    else account.deleteAccount();
  };

  return (
    <Screen testID="account-screen">
      <ScreenHeader
        title={t('account.title')}
        titleRef={titleRef}
        onBack={onBack}
        backLabel={t('common.back')}
        testID="account-back"
      />
      <ScrollView style={styles.body} contentContainerStyle={styles.content}>
        {noteText !== null ? (
          <Text testID="account-note" style={styles.line}>
            {noteText}
          </Text>
        ) : null}
        {state.kind === 'loading' ? (
          <>
            <ActivityIndicator />
            <Text style={styles.line}>{t('account.loading')}</Text>
          </>
        ) : state.kind === 'failed' ? (
          <>
            <Text testID="account-failed" style={styles.line}>
              {t('account.failed')}
            </Text>
            <ActionButton
              testID="account-retry"
              kind="secondary"
              label={t('account.retry')}
              onPress={account.reload}
            />
          </>
        ) : state.kind === 'offline' ? (
          <Offline account={account} />
        ) : state.kind === 'guest' ? (
          <Guest
            account={account}
            guestNumber={state.guestNumber}
            onDelete={() => setDialog('deleteGuest')}
          />
        ) : (
          <Saved
            account={account}
            username={state.username}
            keys={state.keys.map((key) => key.provider)}
            onUsername={onUsername}
            onSignOut={() => setDialog('signOut')}
            onDelete={() => setDialog('deleteSaved')}
          />
        )}
        {busy !== null ? (
          <Text testID="account-busy" style={styles.line}>
            {t(`account.busy.${busy}`)}
          </Text>
        ) : null}
        {problemText !== null ? (
          <Text testID="account-problem" style={styles.line}>
            {problemText}
          </Text>
        ) : null}
      </ScrollView>
      <Sheet
        visible={dialog !== null}
        onClose={() => setDialog(null)}
        closeLabel={t('common.cancel')}
        look="dialog">
        {dialog !== null ? (
          <AccountDialog dialog={dialog} onConfirm={confirm} onCancel={() => setDialog(null)} />
        ) : null}
      </Sheet>
    </Screen>
  );
}

/** Apple's own button, full width. Shown only where Apple's sheet works. */
function AppleButton({ testID, onPress }: { testID: string; onPress: () => void }) {
  const { theme } = useUnistyles();
  return (
    <AppleSignInButton
      testID={testID}
      // The app has one set of colors, and it is dark.
      dark
      cornerRadius={theme.radii.lg}
      style={styles.apple}
      onPress={onPress}
    />
  );
}

function Offline({ account }: { account: Account }) {
  const { t } = useTranslation();
  return (
    <SectionCard padded testID="account-offline">
      <View style={styles.block}>
        <Text style={styles.lead}>{t('account.offline.intro')}</Text>
        <Text style={styles.line}>{t('account.offline.kept')}</Text>
        {account.appleAvailable ? (
          <>
            <AppleButton
              testID="account-apple"
              onPress={() => {
                if (account.busy === null) account.signInWithApple();
              }}
            />
            <Text style={styles.note}>{t('account.offline.appleNote')}</Text>
          </>
        ) : (
          <Text style={styles.note}>{t('account.offline.noApple')}</Text>
        )}
      </View>
    </SectionCard>
  );
}

function Guest({
  account,
  guestNumber,
  onDelete,
}: {
  account: Account;
  guestNumber: string | null;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const name =
    guestNumber === null
      ? t('account.guest.noName')
      : t('account.guest.name', { name: t('online.guestName', { number: guestNumber }) });
  return (
    <>
      <SectionCard padded testID="account-guest">
        <View style={styles.block}>
          <Text testID="account-name" style={styles.lead}>
            {name}
          </Text>
          <Text style={styles.line}>{t('account.guest.kept')}</Text>
          <Text style={styles.line}>{t('account.guest.onlyHere')}</Text>
        </View>
      </SectionCard>
      <SectionCard padded>
        <View style={styles.block}>
          {account.appleAvailable ? (
            <>
              <Text style={styles.line}>{t('account.guest.save')}</Text>
              <AppleButton
                testID="account-save-apple"
                onPress={() => {
                  if (account.busy === null) account.saveWithApple();
                }}
              />
            </>
          ) : (
            <Text style={styles.note}>{t('account.guest.noApple')}</Text>
          )}
        </View>
      </SectionCard>
      <SectionCard>
        <SectionRow
          testID="account-delete"
          icon="trash"
          label={t('account.guest.delete')}
          hint={t('account.guest.deleteHint')}
          disabled={account.busy !== null}
          onPress={onDelete}
        />
      </SectionCard>
    </>
  );
}

function Saved({
  account,
  username,
  keys,
  onUsername,
  onSignOut,
  onDelete,
}: {
  account: Account;
  username: string | null;
  keys: readonly AuthKeyProvider[];
  onUsername: () => void;
  onSignOut: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const busy = account.busy !== null;
  const lastKey = keys.length <= 1;
  const addable = addableKeys(
    keys.map((provider) => ({ provider })),
    account.appleAvailable,
  );
  return (
    <>
      <SectionCard padded testID="account-saved">
        <View style={styles.block}>
          <Text testID="account-name" style={styles.lead}>
            {username === null
              ? t('account.saved.noName')
              : t('account.saved.name', { name: username })}
          </Text>
          <Text style={styles.line}>{t('account.saved.kept')}</Text>
        </View>
      </SectionCard>
      <SectionCard>
        <SectionRow
          testID="account-username"
          icon="users"
          label={t('account.saved.username')}
          value={username ?? t('account.saved.usernameNone')}
          onPress={onUsername}
        />
      </SectionCard>
      <SectionCard title={t('account.saved.keys')} testID="account-keys">
        {keys.map((provider) => {
          const name = t(`account.provider.${provider}`);
          return (
            <SectionRow
              key={provider}
              testID={`account-key-${provider}`}
              icon="keyRound"
              label={name}
              {...(lastKey ? { hint: t('account.saved.lastKey') } : {})}
              right={
                <ActionButton
                  testID={`account-key-${provider}-remove`}
                  kind="secondary"
                  compact
                  disabled={lastKey || busy}
                  label={t('account.saved.remove')}
                  accessibilityLabel={t('account.saved.removeLabel', { provider: name })}
                  onPress={() => account.removeKey(provider)}
                />
              }
            />
          );
        })}
        {addable.map((provider) => (
          <SectionRow
            key={provider}
            testID={`account-add-${provider}`}
            icon="keyRound"
            label={t('account.saved.add', { provider: t(`account.provider.${provider}`) })}
            disabled={busy}
            onPress={account.saveWithApple}
          />
        ))}
      </SectionCard>
      <SectionCard>
        <SectionRow
          testID="account-sign-out"
          icon="logOut"
          label={t('account.saved.signOut')}
          hint={t('account.saved.signOutHint')}
          disabled={busy}
          onPress={onSignOut}
        />
        <SectionRow
          testID="account-delete"
          icon="trash"
          label={t('account.saved.delete')}
          hint={t('account.saved.deleteHint')}
          disabled={busy}
          onPress={onDelete}
        />
      </SectionCard>
    </>
  );
}

/** The confirm dialog. Its own component, so each opening focuses the title again. */
function AccountDialog({
  dialog,
  onConfirm,
  onCancel,
}: {
  dialog: Dialog;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const titleRef = useFocusOnShow();
  if (dialog === 'signOut') {
    return (
      <ConfirmDialog
        testID="account-dialog"
        titleRef={titleRef}
        title={t('account.signOutDialog.title')}
        lines={[t('account.signOutDialog.comeBack'), t('account.signOutDialog.kept')]}
        confirmLabel={t('account.signOutDialog.confirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
  }
  const guest = dialog === 'deleteGuest';
  return (
    <ConfirmDialog
      testID="account-dialog"
      titleRef={titleRef}
      title={t(guest ? 'account.deleteDialog.guestTitle' : 'account.deleteDialog.savedTitle')}
      lines={[
        t('account.deleteDialog.games'),
        t('account.deleteDialog.invites'),
        t('account.deleteDialog.pushes'),
        t(guest ? 'account.deleteDialog.guestName' : 'account.deleteDialog.savedName'),
        t('account.deleteDialog.kept'),
      ]}
      confirmLabel={t('account.deleteDialog.confirm')}
      cancelLabel={t('common.cancel')}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  body: {
    flex: 1,
  },
  content: {
    gap: theme.space.lg,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.sm,
    paddingBottom: theme.space.lg,
  },
  block: {
    gap: theme.space.md,
  },
  lead: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
  line: {
    ...theme.type.body,
    color: theme.colors.text,
  },
  note: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  // Apple's button draws nothing without a height and a width.
  apple: {
    width: '100%',
    height: theme.touch.button,
  },
}));
