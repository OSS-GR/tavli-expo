/**
 * The chat of an online game (ADR-0011, #692), as the content of the game
 * screen's sheet. `OnlineMatchScreen` shows it; the text field
 * (`ChatComposer`) is the sheet's footer, so it stays in place while the
 * messages scroll.
 *
 * What shows, by `ChatView.status`:
 * - `open`: the messages (yours on the right), then the text field. The
 *   first time, the chat rules show first (`chatSeen.rulesSeen`).
 * - `muted`: a note and Unmute.
 * - `needs-account`, `needs-username`: what chat needs, and a button to
 *   the screen that fixes it (`onFix`).
 * - `needs-terms`: the terms changed (the chat rules are in them). The
 *   card links the terms and has Accept: with `usernames` it accepts them
 *   in place (the server takes the same username again with the new
 *   terms, so there is no rename and no 30-day wait). Without
 *   `usernames` the button goes to the username screen (`onFix`).
 * - `turned-off`: a note and the way to Settings.
 * - `banned`: a note.
 * - `unavailable` never opens the sheet: the chat button does not show.
 *
 * The header has Mute and Report or block. A report from here names the
 * game, so the server keeps the other player's last messages with it.
 *
 * The text of a message never goes to analytics, crash reports or logs.
 */
import {
  CHAT_MAX_LENGTH,
  TERMS_VERSION,
  isChatErrorData,
  type Chat,
  type ChatErrorCode,
  type ChatMessage,
  type ChatStatus,
  type ChatView,
  type Usernames,
} from '@tavli/contracts';
import type { PlayerId } from '@tavli/engine';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, Text, TextInput, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { Icon } from '@/components/Icon';
import { FieldProblem } from '@/components/Problem';
import { RoundButton } from '@/components/RoundButton';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { termsUrl } from '@/features/online/usernameStep';

/** The statuses that send the player to another screen to fix them. */
export type ChatFix = Extract<ChatStatus, 'needs-account' | 'needs-username' | 'needs-terms'>;

export interface ChatSheetProps {
  chat: Chat;
  view: ChatView;
  /** This phone's side in the game. */
  me: PlayerId;
  /** The other player's name, as the game screen shows it. */
  opponentName: string;
  /** The player has read the chat rules (`chatSeen`). */
  rulesSeen: boolean;
  onRulesSeen: () => void;
  /** Opens the screen that fixes a `needs-*` status. */
  onFix: (status: ChatFix) => void;
  /** Accepts the new terms in place (`needs-terms`). Without it, `onFix` opens the username screen. */
  usernames?: Usernames;
  /** Opens Settings (the chat switch). */
  onSettings: () => void;
  /** Report or block the other player, from the chat. Without it the header has no such button. */
  onReportOrBlock?: () => void;
  onClose: () => void;
}

/** The text for each status that has no messages. */
const STATUS_TEXT = {
  'needs-account': 'chat.status.needsAccount',
  'needs-username': 'chat.status.needsUsername',
  'needs-terms': 'chat.status.needsTerms',
  'turned-off': 'chat.status.turnedOff',
  muted: 'chat.status.muted',
  banned: 'chat.status.banned',
  unavailable: 'chat.status.unavailable',
} as const satisfies Record<Exclude<ChatStatus, 'open'>, string>;

const FIX_LABEL = {
  'needs-account': 'chat.fix.account',
  'needs-username': 'chat.fix.username',
  'needs-terms': 'chat.fix.terms',
} as const satisfies Record<ChatFix, string>;

function isFix(status: ChatStatus): status is ChatFix {
  return status === 'needs-account' || status === 'needs-username' || status === 'needs-terms';
}

export function ChatSheet({
  chat,
  view,
  me,
  opponentName,
  rulesSeen,
  onRulesSeen,
  onFix,
  usernames,
  onSettings,
  onReportOrBlock,
  onClose,
}: ChatSheetProps) {
  const { t, i18n } = useTranslation();
  const titleRef = useFocusOnShow();
  const [busy, setBusy] = useState(false);
  const { status } = view;

  const setMuted = (muted: boolean) => {
    if (busy) return;
    setBusy(true);
    // The new view comes through the watch. A failed call leaves the chat as it is.
    void chat
      .setMuted(view.gameId, muted)
      .catch(() => undefined)
      .finally(() => setBusy(false));
  };

  // Accept the new terms: the same username again, with the terms. The
  // chat opens through the watch. A failed call says so on the card.
  const [termsFailed, setTermsFailed] = useState(false);
  const acceptTerms = () => {
    if (busy || usernames === undefined) return;
    setBusy(true);
    setTermsFailed(false);
    usernames
      .mine()
      .then((mine) =>
        mine.name === null
          ? Promise.reject(new Error('no username'))
          : usernames.setMine({ name: mine.name, acceptTerms: TERMS_VERSION }),
      )
      .then(
        () => setBusy(false),
        () => {
          setTermsFailed(true);
          setBusy(false);
        },
      );
  };

  const head = (
    <View style={styles.head}>
      <View style={styles.titles}>
        <Text ref={titleRef} testID="chat-title" accessibilityRole="header" style={styles.title}>
          {t('chat.title')}
        </Text>
        <Text style={styles.subtitle}>{t('chat.with', { name: opponentName })}</Text>
      </View>
      {status === 'open' ? (
        <HeadButton
          testID="chat-mute"
          label={t('chat.mute')}
          hint={t('chat.muteHint')}
          onPress={() => setMuted(true)}
        />
      ) : null}
      {onReportOrBlock && (status === 'open' || status === 'muted') ? (
        <HeadButton
          testID="chat-report"
          label={t('chat.report')}
          hint={t('chat.reportHint', { name: opponentName })}
          onPress={onReportOrBlock}
        />
      ) : null}
      <RoundButton
        testID="chat-close"
        icon="x"
        size="small"
        accessibilityLabel={t('chat.close')}
        onPress={onClose}
      />
    </View>
  );

  let body = null;
  if (status === 'open' && !rulesSeen) {
    body = (
      <View testID="chat-rules" style={styles.note}>
        <Text style={styles.noteTitle}>{t('chat.rules.title')}</Text>
        {(['kind', 'noLinks', 'tools', 'kept'] as const).map((key) => (
          <Text key={key} style={styles.body}>
            {`• ${t(`chat.rules.${key}`)}`}
          </Text>
        ))}
        <ActionButton testID="chat-rules-ok" label={t('chat.rules.ok')} onPress={onRulesSeen} />
      </View>
    );
  } else if (status === 'open') {
    body =
      view.messages.length === 0 ? (
        <Text testID="chat-empty" style={styles.empty}>
          {t('chat.empty', { name: opponentName })}
        </Text>
      ) : (
        <View testID="chat-messages" style={styles.messages}>
          {view.messages.map((message) => (
            <Bubble key={message.id} message={message} mine={message.from === me} />
          ))}
        </View>
      );
  } else {
    body = (
      <View testID={`chat-status-${status}`} style={styles.note}>
        <Text style={styles.body}>{t(STATUS_TEXT[status])}</Text>
        {status === 'muted' ? (
          <ActionButton
            testID="chat-unmute"
            label={t('chat.unmute')}
            busy={busy}
            onPress={() => setMuted(false)}
          />
        ) : null}
        {status === 'needs-terms' && usernames ? (
          <>
            <ActionButton
              testID="chat-terms-read"
              kind="secondary"
              label={t('chat.terms.read')}
              onPress={() => void Linking.openURL(termsUrl(i18n.language)).catch(() => undefined)}
            />
            <ActionButton
              testID="chat-terms-accept"
              label={t('chat.terms.accept')}
              busy={busy}
              onPress={acceptTerms}
            />
            <FieldProblem
              testID="chat-terms-problem"
              text={termsFailed ? t('chat.terms.failed') : null}
              eventKey={`chat-terms:${view.gameId}`}
            />
          </>
        ) : isFix(status) ? (
          <ActionButton
            testID="chat-fix"
            label={t(FIX_LABEL[status])}
            onPress={() => onFix(status)}
          />
        ) : null}
        {status === 'turned-off' ? (
          <ActionButton
            testID="chat-settings"
            label={t('chat.fix.settings')}
            onPress={onSettings}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View testID="chat-sheet" style={styles.sheet}>
      {head}
      {body}
    </View>
  );
}

function HeadButton({
  testID,
  label,
  hint,
  onPress,
}: {
  testID: string;
  label: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.headButton, pressed && styles.pressed]}>
      <Text style={styles.headButtonText}>{label}</Text>
    </Pressable>
  );
}

function Bubble({ message, mine }: { message: ChatMessage; mine: boolean }) {
  const { t } = useTranslation();
  return (
    <View
      style={styles.bubble(mine)}
      accessible
      accessibilityLabel={t(mine ? 'chat.youSaid' : 'chat.theySaid', { text: message.text })}>
      <Text style={styles.bubbleText}>{message.text}</Text>
    </View>
  );
}

/** What the text field says for each refused send. */
const SEND_PROBLEM = {
  EMPTY: 'chat.problem.empty',
  TOO_LONG: 'chat.problem.tooLong',
  LINK: 'chat.problem.link',
  BAD_WORDS: 'chat.problem.badWords',
  TOO_FAST: 'chat.problem.tooFast',
  CHAT_CLOSED: 'chat.problem.closed',
  NOT_SIGNED_IN: 'chat.problem.signedOut',
  NOT_A_PLAYER: 'chat.problem.closed',
  GAME_NOT_FOUND: 'chat.problem.closed',
} as const satisfies Record<ChatErrorCode, string>;

type SendProblemKey = (typeof SEND_PROBLEM)[ChatErrorCode] | 'chat.problem.network';

export interface ChatComposerProps {
  chat: Chat;
  gameId: string;
}

/** The text field and Send: the footer of the sheet while the chat is open. */
export function ChatComposer({ chat, gameId }: ChatComposerProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  // The text key of the last refusal, and a count so the same problem is read again.
  const [problem, setProblem] = useState<{ key: SendProblemKey; n: number } | null>(null);
  const left = CHAT_MAX_LENGTH - Array.from(text).length;
  const ready = text.trim() !== '' && left >= 0 && !sending;

  const send = () => {
    if (!ready) return;
    setSending(true);
    chat.send({ gameId, text }).then(
      () => {
        setText('');
        setProblem(null);
        setSending(false);
      },
      (error: unknown) => {
        // The typed text stays, so the player can change it.
        const key: SendProblemKey = isChatErrorData(error)
          ? SEND_PROBLEM[error.code]
          : 'chat.problem.network';
        setProblem((last) => ({ key, n: (last?.n ?? 0) + 1 }));
        setSending(false);
      },
    );
  };

  return (
    <View style={styles.composer}>
      <FieldProblem
        testID="chat-problem"
        text={problem === null ? null : t(problem.key)}
        eventKey={`chat-problem:${gameId}:${problem?.n ?? 0}`}
      />
      <View style={styles.row}>
        <TextInput
          testID="chat-input"
          style={styles.input}
          value={text}
          onChangeText={(next) => {
            setText(next);
            if (problem !== null) setProblem(null);
          }}
          placeholder={t('chat.placeholder')}
          placeholderTextColor={theme.colors.textDim}
          accessibilityLabel={t('chat.inputLabel')}
          multiline
          // One row to start with; it grows with the text (up to `maxHeight`).
          rows={1}
          // A little over the limit may be typed, so the count can say so.
          maxLength={CHAT_MAX_LENGTH + 50}
          returnKeyType="send"
          submitBehavior="submit"
          onSubmitEditing={send}
        />
        <Pressable
          testID="chat-send"
          accessibilityRole="button"
          accessibilityLabel={t('chat.send')}
          accessibilityState={{ disabled: !ready, busy: sending }}
          disabled={!ready}
          onPress={send}
          style={({ pressed }) => [styles.send(ready), pressed && styles.pressed]}>
          <Icon
            name="send"
            size={20}
            color={ready ? theme.colors.onAccent : theme.colors.textDim}
          />
        </Pressable>
      </View>
      {left <= 40 ? (
        <Text testID="chat-left" style={styles.left(left < 0)}>
          {left >= 0 ? t('chat.left', { count: left }) : t('chat.over', { count: -left })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  sheet: {
    gap: theme.space.md,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.space.sm,
  },
  titles: {
    flexGrow: 1,
    flexShrink: 1,
  },
  title: {
    ...theme.type.headline,
    color: theme.colors.text,
  },
  subtitle: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  headButton: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: theme.space.md,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  headButtonText: {
    ...theme.type.caption,
    color: theme.colors.text,
  },
  pressed: {
    opacity: 0.7,
  },
  messages: {
    gap: theme.space.xs,
  },
  bubble: (mine: boolean) => ({
    alignSelf: mine ? 'flex-end' : 'flex-start',
    maxWidth: '82%',
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm,
    borderRadius: theme.radii.lg,
    borderBottomRightRadius: mine ? theme.radii.sm : theme.radii.lg,
    borderBottomLeftRadius: mine ? theme.radii.lg : theme.radii.sm,
    borderWidth: 1,
    borderColor: mine ? theme.colors.accentLine : theme.colors.border,
    backgroundColor: mine ? theme.colors.accentWash : theme.colors.surface,
  }),
  bubbleText: {
    ...theme.type.body,
    color: theme.colors.text,
  },
  empty: {
    ...theme.type.body,
    color: theme.colors.textDim,
    textAlign: 'center',
    paddingVertical: theme.space.lg,
  },
  note: {
    gap: theme.space.sm,
  },
  noteTitle: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
  body: {
    ...theme.type.body,
    color: theme.colors.text,
  },
  composer: {
    gap: theme.space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.space.sm,
  },
  input: {
    ...theme.type.body,
    flex: 1,
    minHeight: theme.touch.minTarget,
    maxHeight: 120,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.backgroundDeep,
    color: theme.colors.text,
  },
  send: (ready: boolean) => ({
    width: theme.touch.minTarget,
    height: theme.touch.minTarget,
    borderRadius: theme.touch.minTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ready ? theme.colors.accent : theme.colors.surface,
    borderWidth: 1,
    borderColor: ready ? theme.colors.accentLine : theme.colors.border,
  }),
  left: (over: boolean) => ({
    ...theme.type.caption,
    color: over ? theme.colors.problem : theme.colors.textDim,
    textAlign: 'right',
  }),
}));
