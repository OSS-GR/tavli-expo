/**
 * The in-game menu (wireframe 7, restyled in the Figma polish pass, #515).
 * Its resign dialogs (wireframe 13) use `ConfirmDialog` from `@/components`.
 *
 * - The title is the game on the board ("Game 1 · Portes"), with a close
 *   button. Under it the score as a line with each side's checker:
 *   "You 0 – 0 Bot · first to 1". Screen readers hear it with the match:
 *   "Portes · vs Bot (Easy) · You 0 – 0 Bot · first to 1".
 * - Safe actions first, in one card: How to play, Settings, Report or
 *   block (online), Exit to Home.
 * - Then the two resigns in a card of their own, in coral with a flag.
 * - Resume, the main button, at the bottom.
 */
import type { PerPlayer, PlayerId } from '@tavli/engine';
import { fonts } from '@tavli/ui';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { sideWood } from '@/components/avatar';
import { CheckerAvatar } from '@/components/CheckerAvatar';
import { RoundButton } from '@/components/RoundButton';
import { SectionCard, SectionRow } from '@/components/SectionCard';
import { useFocusOnShow } from '@/features/accessibility/focus';

/** The match score for the menu's score line. */
export interface MenuScore {
  readonly names: PerPlayer<string>;
  readonly score: PerPlayer<number>;
  /** First to this score wins. */
  readonly target: number;
}

export interface GameMenuProps {
  /**
   * The game on the board: "Game 2 · Plakoto" (#109). It is the menu's
   * title (#515). Without it the title is "Game menu".
   */
  gameLabel?: string;
  /**
   * The match, for screen readers: "Portes · vs Bot (Easy)". The score
   * line reads it first, then the score and the target from `score`.
   */
  about: string;
  score: MenuScore;
  /** `null` hides the hint and disables the row. */
  resignGameHint: string | null;
  resignMatchHint: string | null;
  rulesLabel: string;
  /** Without it there is no Resign game row: online you resign the whole match (#255). */
  onResignGame?: () => void;
  onResignMatch: () => void;
  onRules: () => void;
  onSettings: () => void;
  /**
   * Report or block the other player (#435). Online games only; without
   * it there is no row.
   */
  onReportOrBlock?: () => void;
  /** The hint of the Report or block row, with the other player's name. */
  reportOrBlockHint?: string;
  onExit: () => void;
  exitHint: string;
  onResume: () => void;
}

/** A row's screen reader label: the title and the hint, as one button. */
function rowLabel(title: string, hint: string | null | undefined): string {
  return hint ? `${title}, ${hint}` : title;
}

export function GameMenu(props: GameMenuProps) {
  const { t } = useTranslation();
  // The sheet covers the board: focus moves to its title (#153).
  const titleRef = useFocusOnShow();
  const resignGame = t('game.menu.resignGame');
  const resignMatch = t('game.menu.resignMatch');
  const exit = t('game.menu.exit');
  const reportOrBlock = t('safety.action');
  return (
    <View testID="game-menu" style={styles.menu}>
      <View style={styles.header}>
        <View style={styles.headerTexts}>
          <Text
            ref={titleRef}
            {...(props.gameLabel ? { testID: 'menu-game-label' } : {})}
            style={styles.title}
            accessibilityRole="header">
            {props.gameLabel ?? t('game.menu.title')}
          </Text>
          <ScoreLine about={props.about} score={props.score} />
        </View>
        <RoundButton
          testID="menu-close"
          icon="x"
          accessibilityLabel={t('game.menu.close')}
          onPress={props.onResume}
        />
      </View>
      <SectionCard testID="menu-actions">
        <SectionRow
          testID="menu-rules"
          icon="book"
          iconLook="bare"
          label={props.rulesLabel}
          onPress={props.onRules}
        />
        <SectionRow
          testID="menu-settings"
          icon="settings"
          iconLook="bare"
          label={t('game.menu.settings')}
          onPress={props.onSettings}
        />
        {props.onReportOrBlock ? (
          <SectionRow
            testID="menu-report-block"
            icon="shield"
            iconLook="bare"
            label={reportOrBlock}
            {...(props.reportOrBlockHint ? { hint: props.reportOrBlockHint } : {})}
            accessibilityLabel={rowLabel(reportOrBlock, props.reportOrBlockHint)}
            accessibilityHint=""
            onPress={props.onReportOrBlock}
          />
        ) : null}
        <SectionRow
          testID="menu-exit"
          icon="house"
          iconLook="bare"
          label={exit}
          hint={props.exitHint}
          accessibilityLabel={rowLabel(exit, props.exitHint)}
          accessibilityHint=""
          onPress={props.onExit}
        />
      </SectionCard>
      <SectionCard testID="menu-resigns">
        {props.onResignGame ? (
          <SectionRow
            testID="menu-resign-game"
            icon="flag"
            iconLook="bare"
            tone="danger"
            label={resignGame}
            {...(props.resignGameHint ? { hint: props.resignGameHint } : {})}
            accessibilityLabel={rowLabel(resignGame, props.resignGameHint)}
            accessibilityHint=""
            disabled={props.resignGameHint === null}
            onPress={props.onResignGame}
          />
        ) : null}
        <SectionRow
          testID="menu-resign-match"
          icon="flag"
          iconLook="bare"
          tone="danger"
          label={resignMatch}
          {...(props.resignMatchHint ? { hint: props.resignMatchHint } : {})}
          accessibilityLabel={rowLabel(resignMatch, props.resignMatchHint)}
          accessibilityHint=""
          disabled={props.resignMatchHint === null}
          onPress={props.onResignMatch}
        />
      </SectionCard>
      <ActionButton
        testID="menu-resume"
        icon="play"
        label={t('game.menu.resume')}
        onPress={props.onResume}
      />
    </View>
  );
}

/**
 * "You 0 – 0 Bot · first to 1", each name next to its side's checker. It
 * wraps with a large font. Screen readers hear one line, made from the
 * same score: "Portes · vs Bot (Easy) · You 0 – 0 Bot · first to 1".
 */
function ScoreLine({ about, score }: { about: string; score: MenuScore }) {
  const { t } = useTranslation();
  const target = t('home.continue.target', { target: score.target });
  const label = [
    about,
    t('game.end.score', {
      white: score.names.white,
      black: score.names.black,
      whiteScore: score.score.white,
      blackScore: score.score.black,
    }),
    target,
  ].join(' · ');
  const side = (player: PlayerId) => (
    <CheckerAvatar
      testID={`menu-checker-${player}`}
      wood={sideWood(player)}
      size={CHECKER}
      name={null}
    />
  );
  return (
    <View testID="menu-score" style={styles.scoreLine} accessible accessibilityLabel={label}>
      {side('white')}
      <Text style={styles.scoreText}>
        {`${score.names.white} `}
        <Text style={styles.scoreNumber}>{score.score.white}</Text>
      </Text>
      <Text style={styles.dash}>–</Text>
      <Text style={styles.scoreText}>
        <Text style={styles.scoreNumber}>{score.score.black}</Text>
        {` ${score.names.black}`}
      </Text>
      {side('black')}
      <Text style={styles.target}>{`· ${target}`}</Text>
    </View>
  );
}

/** The checker beside each name in the score line (Figma: 18 pt). */
const CHECKER = 18;

const styles = StyleSheet.create((theme) => ({
  menu: {
    gap: theme.space.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space.md,
  },
  headerTexts: {
    flex: 1,
    gap: theme.space.xs + 2,
  },
  title: {
    ...theme.type.title2,
    color: theme.colors.text,
  },
  scoreLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: theme.space.sm,
    rowGap: theme.space.xxs,
  },
  scoreText: {
    ...theme.type.callout,
    color: theme.colors.text,
  },
  scoreNumber: {
    fontFamily: fonts.numerals,
    fontVariant: ['tabular-nums'],
  },
  dash: {
    ...theme.type.callout,
    color: theme.colors.textDim,
  },
  target: {
    ...theme.type.footnote,
    color: theme.colors.textDim,
  },
}));
