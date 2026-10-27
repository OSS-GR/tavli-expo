/**
 * New game (wireframes 4 and 5): game, match length, and the bot level
 * (vs bot) or the player names (pass-and-play). Start sits at the bottom,
 * near the thumb.
 */
import type { Difficulty } from '@tavli/contracts';
import { BOT_DIFFICULTIES } from '@tavli/contracts';
import type { PlayerId } from '@tavli/engine';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { SegmentedControl, type SegmentOption } from '@/components/settings/SegmentedControl';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { Sheet } from '@/components/Sheet';
import { Toast, useToast } from '@/components/Toast';
import { ConfirmDialog } from '@/features/match/GameMenu';
import { BoardViewPicker } from '@/features/settings/BoardViewPicker';
import {
  GAME_CHOICES,
  MATCH_LENGTHS,
  MAX_NAME_LENGTH,
  PLAYABLE_GAMES,
  cleanName,
  type MatchLength,
  type MatchMode,
  type MatchSetup,
} from '@/features/match/setup';

export interface NewGameScreenProps {
  mode: MatchMode;
  /** The last choices (or the defaults). */
  initial: MatchSetup;
  /** The bot levels this build can play. The others show locked. */
  botLevels: readonly Difficulty[];
  onBack: () => void;
  onStart: (setup: MatchSetup) => void;
  /** A saved game exists: Start asks first, because it ends that game (wireframe 4). */
  hasSavedGame?: boolean;
}

export function NewGameScreen({
  mode,
  initial,
  botLevels,
  onBack,
  onStart,
  hasSavedGame = false,
}: NewGameScreenProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const [toast, showToast] = useToast();
  const [targetPoints, setTargetPoints] = useState<MatchLength>(initial.targetPoints);
  const [botLevel, setBotLevel] = useState<Difficulty>(initial.botLevel);
  const [names, setNames] = useState(initial.names);

  const lengthOptions: SegmentOption<`${MatchLength}`>[] = MATCH_LENGTHS.map((n) => ({
    value: `${n}`,
    label: String(n),
  }));
  const levelOptions: SegmentOption<Difficulty>[] = BOT_DIFFICULTIES.map((level) => {
    const locked = !botLevels.includes(level);
    return {
      value: level,
      label: t(`bot.levels.${level}`),
      ...(locked ? { disabled: true, accessibilityHint: t('common.comingSoon') } : {}),
    };
  });
  const lockedLevels = BOT_DIFFICULTIES.some((level) => !botLevels.includes(level));

  const [asking, setAsking] = useState(false);
  const startNow = () =>
    onStart({
      mode,
      game: 'portes',
      targetPoints,
      botLevel,
      names: { white: cleanName(names.white), black: cleanName(names.black) },
    });
  const start = () => (hasSavedGame ? setAsking(true) : startNow());

  const nameField = (player: PlayerId) => (
    <View style={styles.nameRow}>
      <View style={styles.swatch(player)} />
      <TextInput
        testID={`new-game-name-${player}`}
        style={styles.input}
        value={names[player]}
        onChangeText={(text) => setNames((old) => ({ ...old, [player]: text }))}
        placeholder={t(`newGame.players.${player}`)}
        placeholderTextColor={theme.colors.textDim}
        accessibilityLabel={t(`newGame.players.${player}Label`)}
        maxLength={MAX_NAME_LENGTH}
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="done"
      />
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable
          testID="new-game-back"
          accessibilityRole="button"
          accessibilityLabel={t('newGame.back')}
          onPress={onBack}
          hitSlop={8}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <Text style={styles.backIcon} importantForAccessibility="no">
            {'‹'}
          </Text>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          {mode === 'bot' ? t('newGame.titleBot') : t('newGame.titleLocal')}
        </Text>
        <View style={styles.headerSpace} />
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <SettingsSection title={t('newGame.game')}>
          <View
            testID="new-game-portes"
            style={styles.gameCard}
            accessible
            accessibilityRole="radio"
            accessibilityState={{ checked: true }}
            accessibilityLabel={`${t('games.portes')}, ${t('games.portesSubtitle')}`}>
            <View style={styles.radio}>
              <View style={styles.radioDot} />
            </View>
            <View style={styles.gameTexts}>
              <Text style={styles.gameName}>{t('games.portes')}</Text>
              <Text style={styles.hint}>{t('games.portesSubtitle')}</Text>
            </View>
          </View>
          <View style={styles.chips}>
            {GAME_CHOICES.filter((game) => !PLAYABLE_GAMES.includes(game)).map((game) => (
              <Pressable
                key={game}
                testID={`new-game-locked-${game}`}
                accessibilityRole="button"
                accessibilityLabel={t(`games.${game}`)}
                accessibilityHint={t('common.comingSoon')}
                accessibilityState={{ disabled: true }}
                onPress={() => showToast(t('newGame.gameSoon', { game: t(`games.${game}`) }))}
                style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
                <Text style={styles.chipText}>{t(`games.${game}`)}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.hint}>{t('newGame.lockedGames')}</Text>
        </SettingsSection>

        <SettingsSection title={t('newGame.length.label')}>
          <SegmentedControl
            testID="new-game-length"
            label={t('newGame.length.label')}
            options={lengthOptions}
            value={`${targetPoints}`}
            onChange={(value) => setTargetPoints(Number(value) as MatchLength)}
          />
          <Text style={styles.hint}>{t('newGame.length.hint', { count: targetPoints })}</Text>
        </SettingsSection>

        {mode === 'bot' ? (
          <>
            <SettingsSection title={t('newGame.botLevel.label')}>
              <SegmentedControl
                testID="new-game-level"
                label={t('newGame.botLevel.label')}
                options={levelOptions}
                value={botLevel}
                onChange={setBotLevel}
              />
              <Text style={styles.hint}>{t(`newGame.botLevel.${botLevel}Hint`)}</Text>
              {lockedLevels ? <Text style={styles.hint}>{t('newGame.botLevel.soon')}</Text> : null}
            </SettingsSection>
            <View style={styles.info}>
              <Text style={styles.infoTitle}>{t('newGame.whoStarts.title')}</Text>
              <Text style={styles.hint}>{t('newGame.whoStarts.body')}</Text>
            </View>
          </>
        ) : (
          <>
            <SettingsSection title={t('newGame.players.label')}>
              {nameField('white')}
              {nameField('black')}
            </SettingsSection>
            <SettingsSection title={t('newGame.boardView')}>
              <BoardViewPicker testID="new-game-board-view" />
            </SettingsSection>
          </>
        )}
      </ScrollView>
      <View style={styles.footer}>
        <ActionButton testID="new-game-start" label={t('newGame.start')} onPress={start} />
      </View>
      <Toast text={toast} />
      <Sheet
        visible={asking}
        onClose={() => setAsking(false)}
        closeLabel={t('common.cancel')}
        look="dialog">
        <ConfirmDialog
          testID="replace-dialog"
          title={t('newGame.replace.title')}
          lines={[t('newGame.replace.body')]}
          confirmLabel={t('newGame.replace.confirm')}
          cancelLabel={t('common.cancel')}
          onConfirm={() => {
            setAsking(false);
            startNow();
          }}
          onCancel={() => setAsking(false)}
        />
      </Sheet>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingTop: rt.insets.top,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.sm,
  },
  back: {
    width: theme.touch.minTarget,
    height: theme.touch.minTarget,
    borderRadius: theme.touch.minTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  backIcon: {
    fontSize: 30,
    lineHeight: 32,
    color: theme.colors.text,
  },
  headerSpace: {
    width: theme.touch.minTarget,
  },
  pressed: {
    opacity: 0.7,
  },
  title: {
    ...theme.type.title,
    flex: 1,
    textAlign: 'center',
    color: theme.colors.text,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: theme.space.lg,
    paddingBottom: theme.space.xl,
  },
  gameCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    padding: theme.space.lg,
    borderRadius: theme.radii.lg,
    borderWidth: 3,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surfaceSelected,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.text,
  },
  gameTexts: {
    flex: 1,
  },
  gameName: {
    ...theme.type.title,
    color: theme.colors.text,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.sm,
    paddingTop: theme.space.sm,
  },
  chip: {
    minWidth: 104,
    minHeight: theme.touch.minTarget,
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.space.md,
    borderRadius: theme.radii.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: theme.colors.border,
  },
  chipText: {
    ...theme.type.body,
    color: theme.colors.textDisabled,
  },
  hint: {
    ...theme.type.caption,
    color: theme.colors.textDim,
    paddingTop: theme.space.xs,
  },
  info: {
    marginTop: theme.space.xl,
    padding: theme.space.lg,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surface,
  },
  infoTitle: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    minHeight: theme.touch.row,
    paddingHorizontal: theme.space.lg,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  swatch: (player: PlayerId) => ({
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: player === 'white' ? theme.checker.lightEdge : theme.checker.darkRing,
    backgroundColor: player === 'white' ? theme.checker.light : theme.checker.dark,
  }),
  input: {
    ...theme.type.body,
    flex: 1,
    minHeight: theme.touch.minTarget,
    color: theme.colors.text,
  },
  footer: {
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.sm,
    paddingBottom: Math.max(rt.insets.bottom, theme.space.lg),
  },
}));
