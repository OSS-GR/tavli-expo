/**
 * A player's seat above or below the board (#499, Figma: game parts).
 * Both players get the same plate: the checker they play (or a checker
 * avatar with initials for a named online opponent), the name, a status
 * line and the match score as a numeral with a small "of 3".
 *
 * - The player to move gets a brass edge and a gold status line ("Your
 *   turn · 6-6, 3 moves left"), so color is never the only cue: the words
 *   say it too. There is no ALL-CAPS pill.
 * - The other player's status line is quiet ("Easy · Portes", "Online ·
 *   Portes"), or empty.
 * - Asodio adds a short note: the checkers still to enter, or "Army frozen".
 * - Online, the time left shows as a clock line ("4:54 to roll"). Under
 *   30 s it turns the problem color.
 * - A long name or a large font wraps the lines; the seat then grows. There
 *   is no pip count (#238).
 *
 * `stacked` (landscape, #185): a small card for a side column, one part per
 * line: the checker and the score, the name, the status, the clock.
 */
import type { CheckerStyle } from '@tavli/themes';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { CheckerAvatar } from '@/components/CheckerAvatar';
import { Icon } from '@/components/Icon';
import { surfaceStyle } from '@/components/Surface';

const NBSP = ' ';
/**
 * A note such as "12 to enter" never breaks in the middle. When a long name
 * (or Greek) makes the line wrap, it breaks after the "·", so the note stays whole.
 */
const keepTogether = (part: string) => part.replace(/ /g, NBSP);

/** The time left on the seat of the player the server waits for (online). */
export interface SeatClock {
  /** "4:54 to roll", "0:28 to move", "2 h to move". */
  readonly text: string;
  /** Under 30 s: the line turns the problem color. */
  readonly urgent: boolean;
}

export interface PlayerStripProps {
  name: string;
  /** The player's checker style from the board theme. */
  checker: CheckerStyle;
  /**
   * A named online opponent: a checker avatar with their initials in place
   * of the plain checker. `key` is their player id (it picks the wood).
   */
  avatar?: { readonly key: string; readonly name: string } | null;
  /** The quiet status line while not active: "Easy · Portes". `null`: none. */
  status?: string | null;
  /** After the turn words while active: "6-6, 3 moves left". `null`: none. */
  turnDetail?: string | null;
  /** A short note, e.g. "12 to enter" (Asodio). `null`: none. */
  note?: string | null;
  /** The time left (online). `null`: none. */
  clock?: SeatClock | null;
  score: number;
  target: number;
  active: boolean;
  /** The turn words while active. Default: "Your turn". */
  turnLabel?: string;
  /** One part per line, for the narrow side columns in landscape (#185). */
  stacked?: boolean;
  testID?: string;
}

export function PlayerStrip({
  name,
  checker,
  avatar = null,
  status = null,
  turnDetail = null,
  note = null,
  clock = null,
  score,
  target,
  active,
  turnLabel,
  stacked = false,
  testID,
}: PlayerStripProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const turn = turnLabel ?? t('game.strip.turn');
  // Screen readers hear the name, the notes, the score, then the turn. The
  // dice have their own label, so the turn detail stays out.
  const label = [
    name,
    active ? null : status,
    note,
    clock?.text ?? null,
    t('game.strip.scoreLabel', { score, target }),
    active ? turn : null,
  ]
    .filter((part) => part !== null)
    .join(', ');

  const line = (active ? [turn, turnDetail, note] : [status, note]).filter(
    (part): part is string => part !== null,
  );
  const size = stacked ? 24 : 32;
  const piece =
    avatar !== null ? (
      <CheckerAvatar playerKey={avatar.key} name={avatar.name} size={size} />
    ) : (
      <View
        style={[
          styles.checker(size),
          { backgroundColor: checker.fill, borderColor: checker.rim.color },
        ]}
      />
    );
  const scoreView = (
    <View style={styles.scoreBox}>
      <Text style={styles.score(stacked)}>{score}</Text>
      <Text style={styles.target}>{t('game.strip.of', { target })}</Text>
    </View>
  );
  const statusLine =
    line.length === 0 ? null : (
      <Text style={styles.status(active)}>
        {line.map((part, index) => (index === 0 ? part : `${NBSP}· ${keepTogether(part)}`))}
      </Text>
    );
  const clockColor = clock?.urgent
    ? theme.colors.problem
    : active
      ? theme.colors.turnText
      : theme.colors.textDim;
  const clockLine =
    clock === null ? null : (
      <View testID={testID ? `${testID}-clock` : undefined} style={styles.clockRow}>
        <Icon name="clock" color={clockColor} size={14} />
        <Text style={[styles.clock, { color: clockColor }]}>{clock.text}</Text>
      </View>
    );

  if (stacked) {
    return (
      <View
        testID={testID}
        style={[styles.plate, styles.stacked, active && styles.active]}
        accessible
        accessibilityLabel={label}
        accessibilityState={{ selected: active }}>
        <View style={styles.stackedTop}>
          {piece}
          {scoreView}
        </View>
        <Text style={styles.name}>{name}</Text>
        {statusLine}
        {clockLine}
      </View>
    );
  }
  return (
    <View
      testID={testID}
      style={[styles.plate, styles.row, active && styles.active]}
      accessible
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}>
      {piece}
      <View style={styles.texts}>
        <Text style={styles.name}>{name}</Text>
        {statusLine}
        {clockLine}
      </View>
      {scoreView}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  // The shared tray (#496), with a thin edge so the brass one replaces it.
  plate: {
    ...surfaceStyle(theme, 'tray'),
    marginHorizontal: theme.space.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  // Your turn: a brass edge.
  active: {
    borderWidth: 2,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surfaceRaised,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.xs,
  },
  stacked: {
    marginHorizontal: 0,
    gap: theme.space.xxs,
    paddingHorizontal: theme.space.sm,
    paddingVertical: theme.space.xs,
  },
  stackedTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.sm,
  },
  checker: (size: number) => ({
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: 2,
  }),
  texts: {
    flex: 1,
  },
  name: {
    ...theme.type.bodyStrong,
    fontSize: 16,
    lineHeight: 21,
    color: theme.colors.text,
  },
  status: (active: boolean) => ({
    ...theme.type.footnote,
    fontWeight: active ? '600' : '400',
    color: active ? theme.colors.turnText : theme.colors.textDim,
  }),
  clockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
  },
  clock: {
    ...theme.type.footnote,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
  },
  scoreBox: {
    alignItems: 'flex-end',
  },
  score: (stacked: boolean) => ({
    ...theme.type.numeral,
    fontSize: stacked ? 20 : 24,
    lineHeight: stacked ? 24 : 28,
    color: theme.colors.text,
  }),
  target: {
    ...theme.type.footnote,
    fontSize: 12,
    lineHeight: 15,
    color: theme.colors.textDim,
  },
}));
