/**
 * New game (wireframes 4 and 5): game, match length, and the bot level
 * (vs bot) or the player names (pass-and-play). Start sits at the bottom,
 * near the thumb, on a fade over the end of the list.
 *
 * Look (#357): the shared `Screen`, `ScreenHeader` and `SectionCard`
 * parts. The games are cards, two per row, Tavli on a whole row; the
 * chosen card has a brass border, a lighter fill and a small brass check.
 * The book button on each card opens its rules without choosing it.
 *
 * Game (#109): Portes, Plakoto, Fevga or Tavli (all three in rotation).
 * A game shows locked ("Coming soon") when the engine does not have it, or
 * vs the bot when the bot has no level for it (`botLevels`).
 *
 * House rules (#207, a first part of Kafeneio mode #58): the opening roll
 * (`match.openingRoll` in the engine). The hint under it says who starts
 * and how. Plakoto and Asodio also get the rules version (#241): the
 * engine preset of the match (`RULES_VERSIONS`). Its hint says what
 * changes. A Tavli match shows the version of its Plakoto game, "Rules
 * version (Plakoto)" (#247). Portes and Fevga have one preset: no version.
 * Both groups have a "Standard" option, so each radio names its group for
 * screen readers (#243), for example "Opening roll: Standard".
 */
import type { Difficulty } from '@tavli/contracts';
import { BOT_DIFFICULTIES } from '@tavli/contracts';
import type { PlayerId, PresetId } from '@tavli/engine';
import { withAlpha } from '@tavli/ui';
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
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionCard, SectionTitle } from '@/components/SectionCard';
import { SegmentedControl, type SegmentOption } from '@/components/settings/SegmentedControl';
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
  versionedGameOf,
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
  // A Tavli match picks the version of its Plakoto game (#247).
  const versionGame = versionedGameOf(game);
  const version = versionGame === null ? null : rulesVersions[versionGame];
  const versionLabel =
    game === 'tavli'
      ? t('newGame.houseRules.rulesVersionPlakoto')
      : t('newGame.houseRules.rulesVersion');
  const versionOptions: SegmentOption<RulesVersion>[] =
    versionGame === null
      ? []
      : RULES_VERSIONS[versionGame].map((id) => ({
          value: id,
          label: t(`newGame.rulesVersion.${VERSION_KEYS[id]}`),
        }));
  // Screen readers hear the group with each house rule option (#243).
  const houseRuleLabel =
    (group: string) =>
    ({ label }: { label: string }) =>
      t('newGame.houseRules.optionLabel', { group, option: label });
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
    <View key={player} style={styles.nameRow}>
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

  const gameCard = (choice: GameChoice) => {
    const selected = choice === game;
    return (
      <View key={choice} style={[styles.gameCard, selected && styles.gameCardSelected]}>
        <Pressable
          testID={`new-game-${choice}`}
          style={({ pressed }) => [styles.gameChoice, pressed && !selected && styles.pressed]}
          onPress={() => setGame(choice)}
          accessibilityRole="radio"
          accessibilityState={{ checked: selected }}
          accessibilityLabel={`${t(`games.${choice}`)}, ${t(`games.${choice}Subtitle`)}`}>
          <View style={styles.gameNameLine}>
            <Text style={styles.gameName}>{t(`games.${choice}`)}</Text>
            {selected ? (
              <View style={styles.check}>
                <Icon name="check" size={14} color={theme.colors.onAccent} />
              </View>
            ) : null}
          </View>
          <Text style={styles.gameSubtitle}>{t(`games.${choice}Subtitle`)}</Text>
        </Pressable>
        {onRules ? (
          <Pressable
            testID={`new-game-rules-${choice}`}
            accessibilityRole="button"
            accessibilityLabel={t(`rules.title.${choice}`)}
            onPress={() => onRules(choice, gamePreset(choice, rulesVersions))}
            style={({ pressed }) => [styles.rulesButton, pressed && styles.pressed]}>
            <Icon name="book" size={20} color={theme.colors.accent} />
          </Pressable>
        ) : null}
      </View>
    );
  };
  // Two cards per row; Tavli (all three games) takes a whole row.
  const pairGames = openGames.filter((choice) => choice !== 'tavli');
  const gameRows: GameChoice[][] = [];
  for (let i = 0; i < pairGames.length; i += 2) gameRows.push(pairGames.slice(i, i + 2));
  if (openGames.includes('tavli')) gameRows.push(['tavli']);

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenHeader
          title={mode === 'bot' ? t('newGame.titleBot') : t('newGame.titleLocal')}
          onBack={onBack}
          backLabel={t('common.back')}
          testID="new-game-back"
        />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          <View style={styles.section}>
            <SectionTitle title={t('newGame.game')} />
            <View style={styles.gameGrid} accessibilityRole="radiogroup">
              {gameRows.map((row) => (
                <View key={row.join('-')} style={styles.gameRow}>
                  {row.map(gameCard)}
                  {row.length === 1 && row[0] !== 'tavli' ? (
                    <View style={styles.gameSpace} />
                  ) : null}
                </View>
              ))}
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
          </View>

          <SectionCard title={t('newGame.length.label')} padded>
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
          </SectionCard>

          {mode === 'bot' ? (
            <SectionCard title={t('newGame.botLevel.label')} padded>
              <SegmentedControl
                testID="new-game-level"
                label={t('newGame.botLevel.label')}
                options={levelOptions}
                value={botLevel}
                onChange={setBotLevel}
              />
              <View style={styles.hints}>
                <Text style={styles.hint}>{t(`newGame.botLevel.${botLevel}Hint`)}</Text>
                {lockedLevels ? (
                  <Text style={styles.hint}>
                    {botLevels.includes('medium')
                      ? t('newGame.botLevel.hardSoon')
                      : t('newGame.botLevel.soon')}
                  </Text>
                ) : null}
              </View>
            </SectionCard>
          ) : (
            <>
              <SectionCard title={t('newGame.players.label')}>
                {nameField('white')}
                {nameField('black')}
              </SectionCard>
              <SectionCard title={t('newGame.boardView')} padded>
                <BoardViewPicker testID="new-game-board-view" />
              </SectionCard>
            </>
          )}

          {/* House rules (#207): who starts the first game. It replaces the
              "Who starts?" info box: the hint says what the chosen rule does. */}
          <SectionCard title={t('newGame.houseRules.label')}>
            <View style={styles.rulePart}>
              <Text style={styles.subLabel}>{t('newGame.houseRules.openingRoll')}</Text>
              <SegmentedControl
                testID="new-game-opening-roll"
                label={t('newGame.houseRules.openingRoll')}
                options={openingOptions}
                accessibilityLabelFor={houseRuleLabel(t('newGame.houseRules.openingRoll'))}
                value={openingRoll}
                onChange={setOpeningRoll}
              />
              <Text style={styles.hint}>{openingHint}</Text>
            </View>
            {/* The rules version (#241): Plakoto and Asodio, and Tavli's Plakoto game (#247). */}
            {version !== null ? (
              <View style={styles.rulePart}>
                <Text style={styles.subLabel}>{versionLabel}</Text>
                <SegmentedControl
                  testID="new-game-rules-version"
                  label={versionLabel}
                  options={versionOptions}
                  accessibilityLabelFor={houseRuleLabel(versionLabel)}
                  value={version}
                  onChange={chooseVersion}
                />
                <Text testID="new-game-rules-version-hint" style={styles.hint}>
                  {t(`newGame.rulesVersion.${VERSION_KEYS[version]}Hint`)}
                </Text>
              </View>
            ) : null}
          </SectionCard>
        </ScrollView>
        {/* Start sits over the end of the list on a fade. Touches on the
            fade go through to the list (`box-none`). */}
        <View style={styles.dock} pointerEvents="box-none">
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
    </Screen>
  );
}

/** How far the fade above Start reaches over the end of the list. */
const FADE = 32;

const styles = StyleSheet.create((theme, rt) => ({
  body: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: theme.space.xl,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.sm,
    // The fade above Start covers the end of the list: room to scroll past it.
    paddingBottom: FADE + theme.space.lg,
  },
  section: {
    gap: theme.space.sm,
  },
  gameGrid: {
    gap: theme.space.sm,
  },
  gameRow: {
    flexDirection: 'row',
    gap: theme.space.sm,
  },
  gameSpace: {
    flex: 1,
  },
  gameCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: theme.radii.lg,
    // The same border width either way, so the text does not move.
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  gameCardSelected: {
    borderColor: theme.colors.accent,
    backgroundImage: `linear-gradient(160deg, ${theme.colors.surfaceSelected} 0%, ${theme.colors.surface} 80%)`,
  },
  gameChoice: {
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
    gap: theme.space.xxs,
    minHeight: 64,
    paddingVertical: theme.space.sm,
    paddingLeft: theme.space.md,
    paddingRight: theme.space.xs,
  },
  gameNameLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space.xs,
  },
  gameName: {
    ...theme.type.bodyStrong,
    fontWeight: '700',
    color: theme.colors.text,
  },
  gameSubtitle: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  check: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accent,
  },
  rulesButton: {
    minWidth: theme.touch.minTarget,
    minHeight: theme.touch.minTarget,
    marginRight: theme.space.xxs,
    borderRadius: theme.touch.minTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.sm,
  },
  chip: {
    minWidth: 104,
    minHeight: theme.touch.minTarget,
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.space.md,
    borderRadius: theme.radii.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: theme.colors.border,
  },
  chipText: {
    ...theme.type.body,
    color: theme.colors.textDisabled,
  },
  hints: {
    gap: theme.space.xs,
  },
  hint: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  subLabel: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
  rulePart: {
    gap: theme.space.sm,
    padding: theme.space.md,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    minHeight: theme.touch.row,
    paddingHorizontal: theme.space.lg,
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
  // Pulled up over the end of the list. The fade runs from a clear page
  // color to the page color behind Start.
  dock: {
    marginTop: -FADE,
    paddingTop: FADE,
    paddingHorizontal: theme.space.lg,
    paddingBottom: Math.max(rt.insets.bottom, theme.space.lg),
    backgroundImage: `linear-gradient(180deg, ${withAlpha(theme.colors.background, 0)} 0%, ${theme.colors.background} 38%)`,
  },
}));
