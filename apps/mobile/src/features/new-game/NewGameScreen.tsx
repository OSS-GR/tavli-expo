/**
 * New game (wireframes 4 and 5): game, match length, and the bot level
 * (vs bot) or the player names (pass-and-play). Start sits at the bottom,
 * near the thumb.
 *
 * Game (#109): Portes, Plakoto, Fevga or Tavli (all three in rotation).
 * A game shows locked ("Coming soon") when the engine does not have it, or
 * vs the bot when the bot has no level for it (`botLevels`).
 *
 * House rules (#207, a first part of Kafeneio mode #58): the opening roll
 * (`match.openingRoll` in the engine). The hint under it says who starts
 * and how. Plakoto and Asodio also get the rules version (#241): the
 * engine preset of the match (`RULES_VERSIONS`). Its hint says what
 * changes. Games with one preset, and a Tavli match, show no version.
 */
import type { Difficulty } from '@tavli/contracts';
import { BOT_DIFFICULTIES } from '@tavli/contracts';
import type { PlayerId, PresetId } from '@tavli/engine';
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
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SegmentedControl, type SegmentOption } from '@/components/settings/SegmentedControl';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { Sheet } from '@/components/Sheet';
import { Toast, useToast } from '@/components/Toast';
import { BoardViewPicker } from '@/features/settings/BoardViewPicker';
import {
  GAME_CHOICES,
  MATCH_LENGTHS,
  MAX_NAME_LENGTH,
  OPENING_ROLL_RULES,
  RULES_VERSIONS,
  VERSION_KEYS,
  cleanName,
  gamePreset,
  gameScoring,
  isGameOpen,
  isVersionedGame,
  type GameChoice,
  type GameLevels,
  type MatchLength,
  type MatchMode,
  type MatchSetup,
  type OpeningRollRule,
  type RulesVersion,
  type RulesVersions,
} from '@/features/match/setup';

export interface NewGameScreenProps {
  mode: MatchMode;
  /** The last choices (or the defaults). */
  initial: MatchSetup;
  /** The bot levels this build can play, per game. The others show locked. */
  botLevels: GameLevels;
  onBack: () => void;
  onStart: (setup: MatchSetup) => void;
  /** A saved game exists: Start asks first, because it ends that game (wireframe 4). */
  hasSavedGame?: boolean;
  /**
   * Opens the rules of a game (the info button on its card). `preset` is
   * the game's chosen rules version (#241), so the page can name it.
   */
  onRules?: (game: GameChoice, preset: PresetId) => void;
}

export function NewGameScreen({
  mode,
  initial,
  botLevels: levelsByGame,
  onBack,
  onStart,
  hasSavedGame = false,
  onRules,
}: NewGameScreenProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const [toast, showToast] = useToast();
  const [game, setGame] = useState<GameChoice>(initial.game);
  const [targetPoints, setTargetPoints] = useState<MatchLength>(initial.targetPoints);
  const [chosenLevel, setBotLevel] = useState<Difficulty>(initial.botLevel);
  const [names, setNames] = useState(initial.names);
  const [openingRoll, setOpeningRoll] = useState<OpeningRollRule>(initial.openingRoll);
  const [rulesVersions, setRulesVersions] = useState<RulesVersions>(initial.rulesVersions);

  const openGames = GAME_CHOICES.filter((choice) => isGameOpen(choice, mode, levelsByGame));
  const lockedGames = GAME_CHOICES.filter((choice) => !openGames.includes(choice));
  const botLevels = levelsByGame[game];
  // A level the new game cannot play falls back to the easiest one it can.
  const botLevel = botLevels.includes(chosenLevel) ? chosenLevel : (botLevels[0] ?? chosenLevel);

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
  const openingOptions: SegmentOption<OpeningRollRule>[] = OPENING_ROLL_RULES.map((rule) => ({
    value: rule,
    label: t(`newGame.houseRules.${rule}`),
  }));
  const openingHint =
    openingRoll === 'chosenStarterRolls' && mode === 'bot'
      ? t('newGame.houseRules.chosenStarterRollsHintBot')
      : t(`newGame.houseRules.${openingRoll}Hint`);

  // The rules version (#241): only for a game with more than one preset.
  const versionGame = isVersionedGame(game) ? game : null;
  const version = versionGame === null ? null : rulesVersions[versionGame];
  const versionOptions: SegmentOption<RulesVersion>[] =
    versionGame === null
      ? []
      : RULES_VERSIONS[versionGame].map((id) => ({
          value: id,
          label: t(`newGame.rulesVersion.${VERSION_KEYS[id]}`),
        }));
  const chooseVersion = (id: RulesVersion) => {
    if (versionGame === null) return;
    setRulesVersions((old) => ({ ...old, [versionGame]: id }));
  };

  const [asking, setAsking] = useState(false);
  const startNow = () =>
    onStart({
      mode,
      game,
      targetPoints,
      botLevel,
      names: { white: cleanName(names.white), black: cleanName(names.black) },
      openingRoll,
      rulesVersions,
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
          <Text style={styles.backIcon} importantForAccessibility="no" allowFontScaling={false}>
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
          <View style={styles.gameList} accessibilityRole="radiogroup">
            {openGames.map((choice) => {
              const selected = choice === game;
              return (
                <View key={choice} style={styles.gameCard(selected)}>
                  <Pressable
                    testID={`new-game-${choice}`}
                    style={({ pressed }) => [
                      styles.gameChoice,
                      pressed && !selected && styles.pressed,
                    ]}
                    onPress={() => setGame(choice)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`${t(`games.${choice}`)}, ${t(`games.${choice}Subtitle`)}`}>
                    <View style={styles.radio}>
                      {selected ? <View style={styles.radioDot} /> : null}
                    </View>
                    <View style={styles.gameTexts}>
                      <Text style={styles.gameName}>{t(`games.${choice}`)}</Text>
                      <Text style={styles.hint}>{t(`games.${choice}Subtitle`)}</Text>
                    </View>
                  </Pressable>
                  {onRules ? (
                    <Pressable
                      testID={`new-game-rules-${choice}`}
                      accessibilityRole="button"
                      accessibilityLabel={t(`rules.title.${choice}`)}
                      onPress={() => onRules(choice, gamePreset(choice, rulesVersions))}
                      hitSlop={4}
                      style={({ pressed }) => [styles.rulesButton, pressed && styles.pressed]}>
                      <Text style={styles.rulesIcon} importantForAccessibility="no">
                        {'i'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
          {lockedGames.length > 0 ? (
            <View style={styles.chips}>
              {lockedGames.map((choice) => (
                <Pressable
                  key={choice}
                  testID={`new-game-locked-${choice}`}
                  accessibilityRole="button"
                  accessibilityLabel={t(`games.${choice}`)}
                  accessibilityHint={t('common.comingSoon')}
                  accessibilityState={{ disabled: true }}
                  onPress={() => showToast(t('newGame.gameSoon', { game: t(`games.${choice}`) }))}
                  style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
                  <Text style={styles.chipText}>{t(`games.${choice}`)}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {lockedGames.length > 0 ? (
            <Text style={styles.hint}>{t('newGame.lockedGames')}</Text>
          ) : null}
        </SettingsSection>

        <SettingsSection title={t('newGame.length.label')}>
          <SegmentedControl
            testID="new-game-length"
            label={t('newGame.length.label')}
            options={lengthOptions}
            value={`${targetPoints}`}
            onChange={(value) => setTargetPoints(Number(value) as MatchLength)}
          />
          <Text testID="new-game-length-hint" style={styles.hint}>
            {gameScoring(game, rulesVersions) === 'perChecker'
              ? t('newGame.length.hintPerChecker', { count: targetPoints })
              : t('newGame.length.hint', { count: targetPoints })}
          </Text>
        </SettingsSection>

        {mode === 'bot' ? (
          <SettingsSection title={t('newGame.botLevel.label')}>
            <SegmentedControl
              testID="new-game-level"
              label={t('newGame.botLevel.label')}
              options={levelOptions}
              value={botLevel}
              onChange={setBotLevel}
            />
            <Text style={styles.hint}>{t(`newGame.botLevel.${botLevel}Hint`)}</Text>
            {lockedLevels ? (
              <Text style={styles.hint}>
                {botLevels.includes('medium')
                  ? t('newGame.botLevel.hardSoon')
                  : t('newGame.botLevel.soon')}
              </Text>
            ) : null}
          </SettingsSection>
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

        {/* House rules (#207): who starts the first game. It replaces the
            "Who starts?" info box: the hint says what the chosen rule does. */}
        <SettingsSection title={t('newGame.houseRules.label')}>
          <Text style={styles.subLabel}>{t('newGame.houseRules.openingRoll')}</Text>
          <SegmentedControl
            testID="new-game-opening-roll"
            label={t('newGame.houseRules.openingRoll')}
            options={openingOptions}
            value={openingRoll}
            onChange={setOpeningRoll}
          />
          <Text style={styles.hint}>{openingHint}</Text>
          {/* The rules version (#241): Plakoto and Asodio only. */}
          {version !== null ? (
            <View style={styles.subPart}>
              <Text style={styles.subLabel}>{t('newGame.houseRules.rulesVersion')}</Text>
              <SegmentedControl
                testID="new-game-rules-version"
                label={t('newGame.houseRules.rulesVersion')}
                options={versionOptions}
                value={version}
                onChange={chooseVersion}
              />
              <Text testID="new-game-rules-version-hint" style={styles.hint}>
                {t(`newGame.rulesVersion.${VERSION_KEYS[version]}Hint`)}
              </Text>
            </View>
          ) : null}
        </SettingsSection>
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
  gameList: {
    gap: theme.space.sm,
  },
  gameChoice: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
  },
  rulesButton: {
    minWidth: theme.touch.minTarget,
    minHeight: theme.touch.minTarget,
    borderRadius: theme.touch.minTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: theme.colors.text,
  },
  rulesIcon: {
    ...theme.type.bodyStrong,
    fontStyle: 'italic',
    color: theme.colors.text,
  },
  gameCard: (selected: boolean) => ({
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: theme.space.sm,
    padding: theme.space.lg,
    borderRadius: theme.radii.lg,
    // The same border width either way, so the text does not move.
    borderWidth: 3,
    borderColor: selected ? theme.colors.accent : theme.colors.border,
    backgroundColor: selected ? theme.colors.surfaceSelected : theme.colors.surface,
  }),
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
  subLabel: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
  subPart: {
    gap: theme.space.xs,
    paddingTop: theme.space.md,
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
