/**
 * The chat of an online game (ADR-0011, #692), as the content of the game
 * screen's sheet. `OnlineMatchScreen` shows it; the text field
 * (`ChatComposer`) is the sheet's footer, so it stays in place while the
 * messages scroll.
 *
 * What shows, by `ChatView.status`:
 * - `open`: the messages (yours on the right), then the text field. The
 *   first time, the chat rules show first (`chatSeen.rulesSeen`).
 *   Messages from one player form a group (`chatRows`): the last bubble
 *   has the tail, and the time when no answer came at once.
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
 * The header (`ChatHead`, chat v2, #709) names the other player. Its "…"
 * button opens a small menu in place: Mute, Report or block, and the chat
 * rules. It is the sheet's `header`, so it stays in place over the
 * messages; `useChatPanel` holds what it shares with the content.
 * A report from here names the game, so the server keeps the other
 * player's last messages with it.
 *
 * The text field has ready phrases over it while it is empty
 * (`CHAT_PHRASES`): a tap sends one as a normal message, in this phone's
 * language.
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
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { sideWood } from '@/components/avatar';
import { CheckerAvatar } from '@/components/CheckerAvatar';
import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icons';
import { FieldProblem } from '@/components/Problem';
import { RoundButton } from '@/components/RoundButton';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { termsUrl } from '@/features/online/usernameStep';

import { CHAT_PHRASES, chatRows, clockTime } from './chatLayout';
import type { ChatPanel } from './useChat';

/** The statuses that send the player to another screen to fix them. */
export type ChatFix = Extract<ChatStatus, 'needs-account' | 'needs-username' | 'needs-terms'>;

export interface ChatHeadProps {
  chat: Chat;
  view: ChatView;
  /** This phone's side in the game. */
  me: PlayerId;
  /** The other player's name, as the game screen shows it. */
  opponentName: string;
  /** The player has read the chat rules (`chatSeen`). */
  rulesSeen: boolean;
  panel: ChatPanel;
  /** Report or block the other player, from the chat. Without it the menu has no such row. */
  onReportOrBlock?: () => void;
  onClose: () => void;
}

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
  panel: ChatPanel;
  /** Opens the screen that fixes a `needs-*` status. */
  onFix: (status: ChatFix) => void;
  /** Accepts the new terms in place (`needs-terms`). Without it, `onFix` opens the username screen. */
  usernames?: Usernames;
  /** Opens Settings (the chat switch). */
  onSettings: () => void;
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

/** The chat's header: the other player, the "…" menu and Close. It stays over the messages. */
export function ChatHead({
  chat,
  view,
  me,
  opponentName,
  rulesSeen,
  panel,
  onReportOrBlock,
  onClose,
}: ChatHeadProps) {
  const { t } = useTranslation();
  const titleRef = useFocusOnShow();
  const { theme } = useUnistyles();
  const [busy, setBusy] = useState(false);
  const { status } = view;
  const mute = () => {
    if (busy) return;
    setBusy(true);
    // The new view comes through the watch. A failed call leaves the chat as it is.
    void chat
      .setMuted(view.gameId, true)
      .catch(() => undefined)
      .finally(() => setBusy(false));
  };

  const canMute = status === 'open';
  const canReport = onReportOrBlock !== undefined && (status === 'open' || status === 'muted');
  const canReadRules = status === 'open' && rulesSeen;
  const hasMenu = canMute || canReport || canReadRules;
  const pick = (action: () => void) => () => {
    panel.closeMenu();
    action();
  };
  return (
    <View style={styles.header}>
      <View style={styles.head}>
        <CheckerAvatar wood={sideWood(me === 'white' ? 'black' : 'white')} size={40} />
        <View style={styles.titles}>
          <Text
            ref={titleRef}
            testID="chat-title"
            accessibilityRole="header"
            accessibilityLabel={t('chat.openLabel', { name: opponentName })}
            style={styles.title}>
            {opponentName}
          </Text>
          <Text style={styles.subtitle}>{t('chat.title')}</Text>
        </View>
        {hasMenu ? (
          <RoundButton
            testID="chat-more"
            icon="ellipsis"
            size="small"
            accessibilityLabel={t('chat.more')}
            expanded={panel.menuOpen}
            onPress={panel.toggleMenu}
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
      {hasMenu && panel.menuOpen ? (
        <View testID="chat-menu" style={styles.menu}>
          {canMute ? (
            <MenuRow
              testID="chat-mute"
              icon="bellOff"
              label={t('chat.mute')}
              hint={t('chat.muteHint')}
              onPress={pick(mute)}
            />
          ) : null}
          {canReport ? (
            <MenuRow
              testID="chat-report"
              icon="flag"
              label={t('safety.actionLabel', { name: opponentName })}
              color={theme.colors.problem}
              onPress={pick(onReportOrBlock)}
            />
          ) : null}
          {canReadRules ? (
            <MenuRow
              testID="chat-rules-again"
              icon="book"
              label={t('chat.rulesAgain')}
              onPress={panel.askRules}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function ChatSheet({
  chat,
  view,
  me,
  opponentName,
  rulesSeen,
  onRulesSeen,
  panel,
  onFix,
  usernames,
  onSettings,
}: ChatSheetProps) {
  const { t, i18n } = useTranslation();
  const { theme } = useUnistyles();
  const [busy, setBusy] = useState(false);
  const { status } = view;

  const unmute = () => {
    if (busy) return;
    setBusy(true);
    // The new view comes through the watch. A failed call leaves the chat as it is.
    void chat
      .setMuted(view.gameId, false)
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

  let body = null;
  if (status === 'open' && (!rulesSeen || panel.rulesAsked)) {
    body = (
      <View testID="chat-rules" style={styles.note}>
        <Text style={styles.noteTitle}>{t('chat.rules.title')}</Text>
        {(['kind', 'noLinks', 'tools', 'kept'] as const).map((key) => (
          <Text key={key} style={styles.body}>
            {`• ${t(`chat.rules.${key}`)}`}
          </Text>
        ))}
        <ActionButton
          testID="chat-rules-ok"
          label={t('chat.rules.ok')}
          onPress={() => {
            panel.rulesDone();
            if (!rulesSeen) onRulesSeen();
          }}
        />
      </View>
    );
  } else if (status === 'open') {
    body =
      view.messages.length === 0 ? (
        <View testID="chat-empty" style={styles.empty}>
          <Icon name="messageCircle" size={32} color={theme.colors.textDim} />
          <Text style={styles.emptyTitle}>{t('chat.emptyTitle')}</Text>
          <Text style={styles.emptyLine}>{t('chat.emptyLine')}</Text>
        </View>
      ) : (
        <View testID="chat-messages" style={styles.messages}>
          {chatRows(view.messages, me).map(({ message, mine, last, time }) => (
            <View key={message.id} style={styles.messageRow(last)}>
              <Bubble message={message} mine={mine} last={last} />
              {time ? (
                <Text style={styles.time(mine)}>{clockTime(message.sentAt, i18n.language)}</Text>
              ) : null}
            </View>
          ))}
        </View>
      );
  } else {
    body = (
      <View testID={`chat-status-${status}`} style={styles.card}>
        <Text style={styles.body}>{t(STATUS_TEXT[status])}</Text>
        {status === 'muted' ? (
          <ActionButton
            testID="chat-unmute"
            label={t('chat.unmute')}
            busy={busy}
            onPress={unmute}
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
      {body}
    </View>
  );
}

function MenuRow({
  testID,
  icon,
  label,
  hint,
  color,
  onPress,
}: {
  testID: string;
  icon: IconName;
  label: string;
  hint?: string;
  /** The text color. Default: the theme's text. */
  color?: string;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      {...(hint === undefined ? {} : { accessibilityHint: hint })}
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}>
      <Icon name={icon} size={20} color={theme.colors.textDim} />
      <Text style={[styles.menuText, color === undefined ? null : { color }]}>{label}</Text>
    </Pressable>
  );
}

function Bubble({ message, mine, last }: { message: ChatMessage; mine: boolean; last: boolean }) {
  const { t } = useTranslation();
  return (
    <View
      style={styles.bubble(mine, last)}
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
  /** The typed text. The screen keeps it, so it stays while the field is away. */
  text: string;
  onText: (text: string) => void;
}

/** The text field and Send: the footer of the sheet while the chat is open. */
export function ChatComposer({ chat, gameId, text, onText: setText }: ChatComposerProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const [sending, setSending] = useState(false);
  // The text key of the last refusal, and a count so the same problem is read again.
  const [problem, setProblem] = useState<{ key: SendProblemKey; n: number } | null>(null);
  const left = CHAT_MAX_LENGTH - Array.from(text).length;
  const ready = text.trim() !== '' && left >= 0 && !sending;

  // Sends the typed text, or a ready phrase (the typed text then stays).
  const sendText = (sent: string, typed: boolean) => {
    if (sending) return;
    setSending(true);
    chat.send({ gameId, text: sent }).then(
      () => {
        if (typed) setText('');
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
  const send = () => {
    if (ready) sendText(text, true);
  };

  return (
    <View style={styles.composer}>
      {text === '' ? (
        <ScrollView
          testID="chat-phrases"
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.phrases}>
          {CHAT_PHRASES.map((key) => {
            const phrase = t(`chat.phrases.${key}`);
            return (
              <Pressable
                key={key}
                testID={`chat-phrase-${key}`}
                accessibilityRole="button"
                accessibilityLabel={t('chat.phraseLabel', { text: phrase })}
                accessibilityState={{ disabled: sending }}
                disabled={sending}
                onPress={() => sendText(phrase, false)}
                style={({ pressed }) => [styles.phrase, pressed && styles.pressed]}>
                <Text style={styles.phraseText}>{phrase}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      <View style={styles.row}>
        <View style={styles.field(problem !== null, text !== '')}>
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
          {left <= 40 ? (
            <Text
              testID="chat-left"
              accessibilityLabel={
                left >= 0 ? t('chat.left', { count: left }) : t('chat.over', { count: -left })
              }
              style={styles.left(left < 0)}>
              {left}
            </Text>
          ) : null}
        </View>
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
      <FieldProblem
        testID="chat-problem"
        text={problem === null ? null : t(problem.key)}
        eventKey={`chat-problem:${gameId}:${problem?.n ?? 0}`}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  sheet: {
    gap: theme.space.md,
  },
  header: {
    gap: theme.space.sm,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  titles: {
    flexGrow: 1,
    flexShrink: 1,
  },
  title: {
    ...theme.type.title3,
    color: theme.colors.text,
  },
  subtitle: {
    ...theme.type.footnote,
    color: theme.colors.textDim,
  },
  menu: {
    borderRadius: theme.radii.tray,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    minHeight: theme.touch.minTarget,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
  },
  menuText: {
    ...theme.type.body,
    flexShrink: 1,
    color: theme.colors.text,
  },
  pressed: {
    opacity: 0.7,
  },
  messages: {
    gap: theme.space.xxs,
  },
  messageRow: (last: boolean) => ({
    gap: theme.space.xxs,
    marginBottom: last ? theme.space.sm : 0,
  }),
  bubble: (mine: boolean, last: boolean) => ({
    alignSelf: mine ? 'flex-end' : 'flex-start',
    maxWidth: '82%',
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm,
    borderRadius: theme.radii.xl,
    // The tail: the last bubble of a group has a small corner on its side.
    borderBottomRightRadius: mine && last ? theme.radii.sm : theme.radii.xl,
    borderBottomLeftRadius: !mine && last ? theme.radii.sm : theme.radii.xl,
    borderWidth: 1,
    borderColor: mine ? theme.colors.accentWash : theme.colors.separator,
    backgroundColor: mine ? theme.colors.accentWash : theme.colors.surface,
  }),
  bubbleText: {
    ...theme.type.body,
    color: theme.colors.text,
  },
  time: (mine: boolean) => ({
    ...theme.type.footnote,
    color: theme.colors.textDim,
    alignSelf: mine ? 'flex-end' : 'flex-start',
    paddingHorizontal: theme.space.xs,
  }),
  empty: {
    alignItems: 'center',
    gap: theme.space.xs,
    paddingVertical: theme.space.lg,
  },
  emptyTitle: {
    ...theme.type.title3,
    color: theme.colors.text,
    textAlign: 'center',
  },
  emptyLine: {
    ...theme.type.caption,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
  note: {
    gap: theme.space.sm,
  },
  card: {
    gap: theme.space.md,
    padding: theme.space.lg,
    borderRadius: theme.radii.tray,
    borderWidth: 1,
    borderColor: theme.colors.separator,
    backgroundColor: theme.colors.surface,
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
    gap: theme.space.sm,
  },
  phrases: {
    gap: theme.space.sm,
  },
  phrase: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: theme.space.md,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.accentLine,
    backgroundColor: theme.colors.surface,
  },
  phraseText: {
    ...theme.type.callout,
    color: theme.colors.text,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.space.sm,
  },
  field: (problem: boolean, typed: boolean) => ({
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.space.sm,
    minHeight: theme.touch.minTarget,
    paddingHorizontal: theme.space.lg,
    borderRadius: theme.touch.minTarget / 2,
    borderWidth: 1,
    borderColor: problem
      ? theme.colors.problemLine
      : typed
        ? theme.colors.accentLine
        : theme.colors.border,
    backgroundColor: theme.colors.backgroundDeep,
  }),
  input: {
    ...theme.type.body,
    flex: 1,
    maxHeight: 120,
    paddingVertical: theme.space.sm,
    color: theme.colors.text,
    // A browser draws its own focus ring inside the field: the field's border shows the focus.
    outlineWidth: 0,
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
    ...theme.type.footnote,
    color: over ? theme.colors.problem : theme.colors.textDim,
    paddingVertical: theme.space.md,
  }),
}));
