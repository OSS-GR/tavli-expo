/**
 * A player's seat (#499, Figma: game parts; layout: Figma "18 Game ·
 * Portrait and landscape"). Both players get the same seat, with no plate:
 * the checker they play (or a checker avatar with initials for a named
 * online opponent), the name and a status line. The seat has no score: the
 * screen shows it once between the two seats; screen readers still hear it
 * on each seat.
 *
 * In portrait the two seats sit side by side above the board; `mirrored`
 * puts the checker on the right, for the seat on the right. In landscape
 * (`stacked`) they sit on the left rail, one part per line, centred.
 *
 * - The player to move gets a brass ring around the checker and a gold
 *   status line ("Your turn"), so color is never the only cue: the words
 *   say it too. There is no ALL-CAPS pill, and no dice text: the dice on
 *   the board say it.
 * - The other player's status line is quiet ("Easy", "Online"), or empty.
 * - Asodio adds a short note: the checkers still to enter, or "Army frozen".
 * - Online, the time left shows as a clock line ("23 h to roll"). Under
 *   30 s it turns the problem color.
 * - A timed online turn (#530, Figma "14 Play ranked") shows the turn ring
 *   around the checker of the player to move instead: it empties over the
 *   turn, with the time left as a numeral ("1:24"). In the last 10 seconds
 *   the ring and the time turn the problem color, and on your seat the
 *   status line says "Play now, or you lose this game". A seat of a timed
 *   game keeps the ring's room, so it does not move when the turn passes.
 * - A long name or a large font wraps the lines; the seat then grows. There
 *   is no pip count (#238).
 * - With `onPress` (the other player online, #651) the seat is a button: a
 *   "›" ends its status line, and a tap opens their card.
 */
import type { CheckerStyle } from '@tavli/themes';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { CheckerAvatar } from '@/components/CheckerAvatar';
import { Icon } from '@/components/Icon';

import { TurnRing } from './TurnRing';

const NBSP = ' ';
/**
 * A note such as "12 to enter" never breaks in the middle. When a long name
 * (or Greek) makes the line wrap, it breaks after the "·", so the note stays whole.
 */
const keepTogether = (part: string) => part.replace(/ /g, NBSP);

/** The time left on the seat of the player the server waits for (online). */
export interface SeatClock {
  /** "4:54 to roll", "0:28 to move", "2 h to move". Screen readers hear it. */
  readonly text: string;
  /** The problem color: under 30 s (a line), your own last 10 s (a ring). */
  readonly urgent: boolean;
  /**
   * A timed turn (#530): the share of the turn left (1 to 0) and the time
   * as a clock ("1:24"). It draws the ring and the numeral in place of the
   * clock line. `null` or left out: the clock line.
   */
  readonly ring?: { readonly left: number; readonly time: string } | null;
  /** Your last seconds (#530): "Play now, or you lose this game", in place of the status line. */
  readonly warning?: string | null;
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
  /** A short note, e.g. "12 to enter" (Asodio). `null`: none. */
  note?: string | null;
  /** The time left (online). `null`: none. */
  clock?: SeatClock | null;
  /** A timed online game (#530): the seat keeps room for the turn ring. */
  timed?: boolean;
  score: number;
  target: number;
  active: boolean;
  /** The turn words while active. Default: "Your turn". */
  turnLabel?: string;
  /** One part per line, centred, for the left rail in landscape (#185). */
  stacked?: boolean;
  /** The seat on the right of the portrait row: the checker on the right. */
  mirrored?: boolean;
  /** The seat is a button (#651): a tap opens the player's card. */
  onPress?: () => void;
  /** What a tap does, for screen readers. */
  pressHint?: string;
  testID?: string;
}

export function PlayerStrip({
  name,
  checker,
  avatar = null,
  status = null,
  note = null,
  clock = null,
  timed = false,
  score,
  target,
  active,
  turnLabel,
  stacked = false,
  mirrored = false,
  onPress,
  pressHint,
  testID,
}: PlayerStripProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const turn = turnLabel ?? t('game.strip.turn');
  // Screen readers hear the name, the notes, the score, then the turn. The
  // seat shows no score, but its label still says it.
  const label = [
    name,
    active ? null : status,
    note,
    clock?.warning ?? null,
    clock?.text ?? null,
    t('game.strip.scoreLabel', { score, target }),
    active ? turn : null,
  ]
    .filter((part) => part !== null)
    .join(', ');

  const warning = clock?.warning ?? null;
  const line = (warning !== null ? [warning] : active ? [turn, note] : [status, note]).filter(
    (part): part is string => part !== null,
  );
  const size = 24;
  const checkerPiece =
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
  const ring = clock?.ring ?? null;
  const urgentColor = clock?.urgent === true;
  const piece =
    timed || ring !== null ? (
      <TurnRing
        testID={testID ? `${testID}-ring` : undefined}
        size={size}
        ring={
          ring === null
            ? null
            : {
                left: ring.left,
                color: urgentColor ? theme.colors.problem : theme.colors.turn,
                track: theme.colors.surfaceSunken,
              }
        }>
        {checkerPiece}
      </TurnRing>
    ) : (
      checkerPiece
    );
  // A seat that opens a card ends its line with "›" (on its own when empty).
  const chevron = onPress === undefined ? null : line.length === 0 ? '›' : `${NBSP}›`;
  const statusLine =
    line.length === 0 && chevron === null ? null : (
      <Text
        style={[
          warning !== null ? styles.warning : styles.status(active),
          stacked ? styles.centredText : mirrored && styles.mirroredText,
        ]}>
        {line.map((part, index) => (index === 0 ? part : `${NBSP}· ${keepTogether(part)}`))}
        {chevron}
      </Text>
    );
  const clockColor = clock?.urgent
    ? theme.colors.problem
    : active
      ? theme.colors.turnText
      : theme.colors.textDim;
  const clockLine =
    clock === null || ring !== null ? null : (
      <View
        testID={testID ? `${testID}-clock` : undefined}
        style={[styles.clockRow, mirrored && styles.mirroredClock, stacked && styles.centredClock]}>
        <Icon name="clock" color={clockColor} size={14} />
        <Text style={[styles.clock, { color: clockColor }]}>{clock.text}</Text>
      </View>
    );
  // A timed turn: the time left as a numeral, gold, or the problem color.
  const timeView =
    ring === null ? null : (
      <Text
        testID={testID ? `${testID}-time` : undefined}
        style={[
          styles.time,
          { color: urgentColor ? theme.colors.problem : theme.colors.turnText },
        ]}>
        {ring.time}
      </Text>
    );
  // A timed turn draws its own ring; otherwise a brass one marks the turn.
  const halo =
    timed || ring !== null ? 'none' : warning !== null ? 'urgent' : active ? 'turn' : 'off';
  const marked =
    halo === 'none' ? (
      piece
    ) : (
      <View testID={testID ? `${testID}-halo` : undefined} style={styles.halo(halo)}>
        {piece}
      </View>
    );
  const nameView = (
    <Text style={[styles.name, stacked ? styles.centredText : mirrored && styles.mirroredText]}>
      {name}
    </Text>
  );

  const seat = (style: StyleProp<ViewStyle>, children: ReactNode) =>
    onPress === undefined ? (
      <View
        testID={testID}
        style={style}
        accessible
        accessibilityLabel={label}
        accessibilityState={{ selected: active }}>
        {children}
      </View>
    ) : (
      <Pressable
        testID={testID}
        style={({ pressed }) => [style, pressed && styles.pressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        {...(pressHint ? { accessibilityHint: pressHint } : {})}
        accessibilityState={{ selected: active }}>
        {children}
      </Pressable>
    );

  if (stacked) {
    return seat(
      styles.stacked,
      <>
        {marked}
        {nameView}
        {statusLine}
        {clockLine}
        {timeView}
      </>,
    );
  }
  return seat(
    [styles.row, mirrored && styles.mirrored],
    <>
      {marked}
      <View style={styles.texts}>
        {nameView}
        {statusLine}
        {clockLine}
      </View>
      {timeView}
    </>,
  );
}

const styles = StyleSheet.create((theme) => ({
  // The portrait seat: small, so two fit side by side with Greek names.
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
  },
  mirrored: {
    flexDirection: 'row-reverse',
  },
  pressed: {
    opacity: 0.6,
  },
  mirroredText: {
    textAlign: 'right',
  },
  mirroredClock: {
    flexDirection: 'row-reverse',
  },
  // The landscape seat: one part per line, centred on the rail.
  stacked: {
    alignItems: 'center',
    gap: 2,
  },
  centredText: {
    textAlign: 'center',
  },
  centredClock: {
    justifyContent: 'center',
  },
  // The ring around the checker: brass for the turn, the problem color in
  // your last seconds, and its room kept when off.
  halo: (kind: 'turn' | 'urgent' | 'off') => ({
    padding: 2,
    borderRadius: 999,
    borderWidth: 2,
    borderColor:
      kind === 'turn'
        ? theme.colors.accent
        : kind === 'urgent'
          ? theme.colors.problem
          : 'transparent',
  }),
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
    fontSize: 13,
    lineHeight: 17,
    color: theme.colors.text,
  },
  status: (active: boolean) => ({
    ...theme.type.footnote,
    fontWeight: active ? '600' : '400',
    color: active ? theme.colors.turnText : theme.colors.textDim,
  }),
  warning: {
    ...theme.type.footnote,
    fontWeight: '600',
    color: theme.colors.problem,
  },
  time: {
    ...theme.type.numeral,
    fontSize: 18,
    lineHeight: 22,
    fontVariant: ['tabular-nums'],
  },
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
}));
