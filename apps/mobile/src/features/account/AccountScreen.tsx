/**
 * Settings → Account (#402, ADR-0008): who this phone plays as online,
 * what is kept where, and the account's actions. The state and the calls
 * are in `useAccount.ts`.
 *
 * - Offline (this phone never played online): no server call. Continue
 *   with Apple (iPhone) or Continue with email (#433) signs in to an
 *   account (one made on another phone, or a new one). A guest is never
 *   made here.
 * - Guest (Figma frame 09, #519): a hero (checker, "Guest 4821", "On
 *   this phone only"), the Save your account card (Apple or email, and
 *   what a saved account gives behind a text button), What we keep as two
 *   rows, and Delete my guest account alone at the end in red. A guest
 *   has no Sign out: with no key it could never come back.
 * - The email code step (`EmailCodeForm`) shows in place of the cards;
 *   its Cancel shows them again.
 * - A guest whose Apple ID or email has an account already gets the move
 *   dialog (#403): its games in progress and open invites, then Move my
 *   games or Keep the guest.
 * - After a guest's save, a key sign-in or a move, a saved account with
 *   no username sees the username step (`UsernameForm`, #483) in place
 *   of the cards, under the note; Save or Not now shows them again.
 * - Saved: the username (to Settings → Username), the ways to sign in
 *   (never remove the last), Sign out and Delete my account.
 * - A failed action opens the problem popup (`ProblemCard`, #462): what
 *   went wrong, what to do, OK. It shares one `Sheet` with the move
 *   dialog, so Keep my guest account turns the dialog into the problem
 *   with no second Modal (iOS does not show one as another closes).
 * - Each note is read to screen readers (`useAnnouncement`). The dialogs
 *   hide the screen behind them (`Sheet`) and move focus to their title.
 *   No text has a line limit, so large fonts wrap and scroll.
 *
 * Navigation stays in the route (`app/account.tsx`).
 */
import type { AuthKeyProvider, EmailKeyCredential } from '@tavli/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { CheckerAvatar } from '@/components/CheckerAvatar';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Icon } from '@/components/Icon';
import { ProblemCard } from '@/components/Problem';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionCard, SectionRow } from '@/components/SectionCard';
import { Sheet } from '@/components/Sheet';
import { Surface } from '@/components/Surface';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { useAnnouncement } from '@/features/game/useAnnouncement';
import { AccountBenefits } from '@/features/online/AccountBenefits';
import { EmailCodeForm } from '@/features/online/EmailCodeForm';
import { UsernameForm } from '@/features/online/UsernameForm';
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

/** What the email code step does with the code. */
type EmailStep = 'signIn' | 'save' | 'add';

export function AccountScreen({ deps, onBack, onUsername, visit = 0 }: AccountScreenProps) {
  const { t } = useTranslation();
  const titleRef = useFocusOnShow();
  const account = useAccount(deps, visit);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [emailStep, setEmailStep] = useState<EmailStep | null>(null);
  const { state, busy, problem, note, said } = account;

  const noteText = note === null ? null : t(`account.note.${note}`);
  useAnnouncement(noteText, noteText === null ? undefined : `account:${said}`);
  useAnnouncement(busy === null ? null : t(`account.busy.${busy}`));

  const useCode = async (credential: EmailKeyCredential) => {
    if (emailStep === 'signIn') await account.signInWithEmail(credential);
    else await account.saveWithEmail(credential);
    setEmailStep(null);
  };
  const emailTitle =
    emailStep === 'signIn'
      ? t('emailCode.title')
      : emailStep === 'save'
        ? t('emailCode.saveTitle')
        : t('account.saved.add', { provider: t('account.provider.email') });

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
      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          {emailStep !== null ? (
            <SectionCard padded testID="account-email">
              <EmailCodeForm
                auth={deps.auth}
                title={emailTitle}
                onCode={useCode}
                onBack={() => setEmailStep(null)}
                backLabel={t('common.cancel')}
              />
            </SectionCard>
          ) : (
            <>
              {noteText !== null ? (
                <Text testID="account-note" style={styles.line}>
                  {noteText}
                </Text>
              ) : null}
              {account.usernameStep !== null ? (
                <SectionCard padded testID="account-username-step">
                  <UsernameForm
                    usernames={deps.usernames}
                    mine={account.usernameStep}
                    title={t('username.title')}
                    onDone={account.finishUsernameStep}
                    onNotNow={() => account.finishUsernameStep()}
                  />
                </SectionCard>
              ) : state.kind === 'loading' ? (
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
                <Offline account={account} onEmail={() => setEmailStep('signIn')} />
              ) : state.kind === 'guest' ? (
                <Guest
                  account={account}
                  id={state.id}
                  guestNumber={state.guestNumber}
                  onEmail={() => setEmailStep('save')}
                  onDelete={() => setDialog('deleteGuest')}
                />
              ) : (
                <Saved
                  account={account}
                  username={state.username}
                  keys={state.keys.map((key) => key.provider)}
                  onUsername={onUsername}
                  onAddEmail={() => setEmailStep('add')}
                  onSignOut={() => setDialog('signOut')}
                  onDelete={() => setDialog('deleteSaved')}
                />
              )}
              {busy !== null ? (
                <Text testID="account-busy" style={styles.line}>
                  {t(`account.busy.${busy}`)}
                </Text>
              ) : null}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <Sheet
        visible={account.offer !== null || problem !== null}
        onClose={account.offer !== null ? account.keepGuest : account.dismissProblem}
        closeLabel={t(account.offer !== null ? 'common.cancel' : 'problem.ok')}
        // A problem brings its own card: no sheet box around it (#480).
        look={account.offer === null ? 'bare' : 'dialog'}>
        {problem !== null && account.offer === null ? (
          <ProblemCard
            // A new key per problem, so each one takes the focus again.
            key={said}
            testID="account-problem"
            problem={{
              title: t(`account.problem.${problem}.title`),
              text: t(`account.problem.${problem}.text`),
            }}
            okLabel={t('problem.ok')}
            onOk={account.dismissProblem}
          />
        ) : account.offer !== null ? (
          <MoveDialog
            title={t(
              account.offerKey === 'email'
                ? 'account.moveDialog.titleEmail'
                : 'account.moveDialog.title',
            )}
            activeGames={account.offer.activeGames}
            openInvites={account.offer.openInvites}
            onMove={account.moveGuest}
            onKeep={account.keepGuest}
          />
        ) : null}
      </Sheet>
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
export function AppleButton({ testID, onPress }: { testID: string; onPress: () => void }) {
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

function Offline({ account, onEmail }: { account: Account; onEmail: () => void }) {
  const { t } = useTranslation();
  return (
    <SectionCard padded testID="account-offline">
      <View style={styles.block}>
        <Text style={styles.lead}>{t('account.offline.intro')}</Text>
        <Text style={styles.line}>{t('account.offline.kept')}</Text>
        {account.appleAvailable ? (
          <AppleButton
            testID="account-apple"
            onPress={() => {
              if (account.busy === null) account.signInWithApple();
            }}
          />
        ) : null}
        <ActionButton
          testID="account-email-sign-in"
          kind={account.appleAvailable ? 'secondary' : 'primary'}
          label={t('account.offline.email')}
          disabled={account.busy !== null}
          onPress={onEmail}
        />
        <Text style={styles.note}>{t('account.offline.signInNote')}</Text>
      </View>
    </SectionCard>
  );
}

/**
 * A guest (Figma frame 09, #519): the hero (checker, guest name, "On this
 * phone only"), the one raised card to save the account (the full list of
 * what a saved account gives opens under "What a saved account gives"),
 * What we keep as two rows, and Delete alone at the end in red.
 */
function Guest({
  account,
  id,
  guestNumber,
  onEmail,
  onDelete,
}: {
  account: Account;
  id: string;
  guestNumber: string | null;
  onEmail: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const [showBenefits, setShowBenefits] = useState(false);
  const shown =
    guestNumber === null
      ? t('account.guest.anonymous')
      : t('online.guestName', { number: guestNumber });
  const said =
    guestNumber === null ? t('account.guest.noName') : t('account.guest.name', { name: shown });
  const chip = t('account.guest.chip');
  const server = t('account.guest.server');
  const serverHint = t('account.guest.serverHint');
  const phone = t('account.guest.phone');
  const phoneHint = t('account.guest.phoneHint');
  return (
    <>
      <View
        testID="account-guest"
        style={styles.hero}
        accessible
        accessibilityLabel={`${said} ${chip}.`}>
        <CheckerAvatar testID="account-avatar" playerKey={id} name={shown} size={72} />
        <Text testID="account-name" style={styles.heroName}>
          {shown}
        </Text>
        <View style={styles.chip}>
          <Icon name="smartphone" size={13} color={theme.colors.textDim} />
          <Text style={styles.chipText}>{chip}</Text>
        </View>
      </View>
      <Surface tier="raised" style={styles.saveCard} testID="account-save">
        <View style={styles.saveTexts}>
          <Text style={styles.saveTitle} accessibilityRole="header">
            {t('account.guest.saveTitle')}
          </Text>
          <Text style={styles.saveBody}>{t('account.guest.saveBody')}</Text>
        </View>
        {account.appleAvailable ? (
          <AppleButton
            testID="account-save-apple"
            onPress={() => {
              if (account.busy === null) account.saveWithApple();
            }}
          />
        ) : null}
        <ActionButton
          testID="account-save-email"
          kind={account.appleAvailable ? 'secondary' : 'primary'}
          icon="mail"
          label={t('account.guest.saveEmail')}
          disabled={account.busy !== null}
          onPress={onEmail}
        />
        <View style={styles.more}>
          <ActionButton
            testID="account-benefits-toggle"
            kind="text"
            size="small"
            icon="info"
            label={t('account.guest.benefits')}
            onPress={() => setShowBenefits((open) => !open)}
          />
        </View>
        {showBenefits ? <AccountBenefits testID="account-benefits" /> : null}
      </Surface>
      <SectionCard title={t('account.guest.keep')} testID="account-kept">
        <SectionRow
          icon="globe"
          iconLook="bare"
          label={server}
          hint={serverHint}
          accessibilityLabel={`${server}: ${serverHint}`}
        />
        <SectionRow
          icon="smartphone"
          iconLook="bare"
          label={phone}
          hint={phoneHint}
          accessibilityLabel={`${phone}: ${phoneHint}`}
        />
      </SectionCard>
      <SectionCard>
        <SectionRow
          testID="account-delete"
          icon="trash"
          tone="danger"
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
  onAddEmail,
  onSignOut,
  onDelete,
}: {
  account: Account;
  username: string | null;
  keys: readonly AuthKeyProvider[];
  onUsername: () => void;
  onAddEmail: () => void;
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
            onPress={provider === 'email' ? onAddEmail : account.saveWithApple}
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

/**
 * The move offer (#403). Keep is the main button: it changes nothing.
 * Its own component, so each opening focuses the title again.
 */
export function MoveDialog({
  title,
  activeGames,
  openInvites,
  onMove,
  onKeep,
}: {
  title: string;
  activeGames: number;
  openInvites: number;
  onMove: () => void;
  onKeep: () => void;
}) {
  const { t } = useTranslation();
  const titleRef = useFocusOnShow();
  return (
    <ConfirmDialog
      testID="account-move-dialog"
      titleRef={titleRef}
      title={title}
      lines={[
        t('account.moveDialog.ask'),
        t('account.moveDialog.games', { count: activeGames }),
        t('account.moveDialog.invites', { count: openInvites }),
        t('account.moveDialog.between'),
        t('account.moveDialog.deleted'),
      ]}
      confirmLabel={t('account.moveDialog.move')}
      cancelLabel={t('account.moveDialog.keep')}
      onConfirm={onMove}
      onCancel={onKeep}
    />
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
    // 20 pt between the parts (Figma frame 09).
    gap: theme.space.lg + theme.space.xs,
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
  hero: {
    alignItems: 'center',
    gap: theme.space.sm,
    paddingTop: theme.space.xs,
  },
  heroName: {
    ...theme.type.title1,
    textAlign: 'center',
    color: theme.colors.text,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
    minHeight: 26,
    paddingHorizontal: theme.space.sm + theme.space.xxs,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.surfaceSunken,
  },
  chipText: {
    ...theme.type.footnote,
    fontWeight: '600',
    color: theme.colors.textDim,
  },
  saveCard: {
    gap: theme.space.md + theme.space.xxs,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.lg + theme.space.xxs,
    paddingBottom: theme.space.lg,
  },
  saveTexts: {
    gap: theme.space.xs,
  },
  saveTitle: {
    ...theme.type.title2,
    color: theme.colors.text,
  },
  saveBody: {
    ...theme.type.callout,
    color: theme.colors.textDim,
  },
  more: {
    alignItems: 'center',
  },
}));
