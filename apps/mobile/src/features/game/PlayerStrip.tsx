/**
 * A player strip above or below the board (wireframe 6): checker color,
 * name and match score, on one line (#184). The player to move gets a
 * thick border and a "Your turn" pill, so color is never the only cue.
 * Asodio adds a short note after the name: the checkers still to enter, or
 * "Army frozen". A long name or a large font wraps the line; the strip then
 * grows. There is no pip count (#238).
 *
 * `stacked` (landscape, #185): a small card for a side column, one part per
 * line: the color and the score, the turn pill, the name, the note.
 */
import type { CheckerStyle } from '@tavli/themes';
import { displayCaps } from '@tavli/ui';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

/** The height of a strip at the normal font size, in points (#184). The menu button matches it. */
export const STRIP_HEIGHT = 36;

const NBSP = '\u00A0';
/**
 * A note such as "12 to enter" never breaks in the middle. When a long name
 * (or Greek) makes the line wrap, it breaks after the "·", so the note stays whole.
 */
const keepTogether = (part: string) => part.replace(/ /g, NBSP);

export interface PlayerStripProps {
  name: string;
  /** The player's checker style from the board theme (for the color swatch). */
  checker: CheckerStyle;
  /** A short note under the name, e.g. "12 to enter" (Asodio). `null`: none. */
  note?: string | null;
  score: number;
  target: number;
  active: boolean;
  /** The pill text while active. Default: "Your turn". */
  turnLabel?: string;
  /** One part per line, for the narrow side columns in landscape (#185). */
  stacked?: boolean;
  testID?: string;
}

export function PlayerStrip({
  name,
  checker,
  note = null,
  score,
  target,
  active,
  turnLabel,
  stacked = false,
  testID,
}: PlayerStripProps) {
  const { t } = useTranslation();
  const pill = turnLabel ?? t('game.strip.turn');
  const label = [name, note, t('game.strip.scoreLabel', { score, target }), active ? pill : null]
    .filter((part) => part !== null)
    .join(', ');
  const swatch = (
    <View
      style={[styles.swatch, { backgroundColor: checker.fill, borderColor: checker.rim.color }]}
    />
  );
  const scoreText = (
    <Text style={styles.score}>
      {score}
      <Text style={styles.target}>{` /${target}`}</Text>
    </Text>
  );
  const pillView = active ? (
    <View style={[styles.pill, stacked && styles.pillStacked]}>
      <Text style={styles.pillText}>{displayCaps(pill)}</Text>
    </View>
  ) : null;
  if (stacked) {
    return (
      <View
        testID={testID}
        style={styles.stacked(active)}
        accessible
        accessibilityLabel={label}
        accessibilityState={{ selected: active }}>
        <View style={styles.stackedTop}>
          {swatch}
          {scoreText}
        </View>
        {pillView}
        <Text style={styles.name}>{name}</Text>
        {note === null ? null : <Text style={styles.note}>{keepTogether(note)}</Text>}
      </View>
    );
  }
  return (
    <View
      testID={testID}
      style={styles.strip(active)}
      accessible
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}>
      {swatch}
      <Text style={styles.who}>
        <Text style={styles.name}>{name}</Text>
        {note === null ? null : (
          <>
            <Text style={styles.note}>{`${NBSP}· `}</Text>
            <Text style={styles.note}>{keepTogether(note)}</Text>
          </>
        )}
      </Text>
      {pillView}
      {scoreText}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  strip: (active: boolean) => ({
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    minHeight: STRIP_HEIGHT,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.xxs,
    marginHorizontal: theme.space.sm,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: active ? 3 : 1,
    borderColor: active ? theme.colors.turn : theme.colors.border,
  }),
  stacked: (active: boolean) => ({
    gap: theme.space.xxs,
    minHeight: STRIP_HEIGHT,
    paddingHorizontal: theme.space.sm,
    paddingVertical: theme.space.xs,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: active ? 3 : 1,
    borderColor: active ? theme.colors.turn : theme.colors.border,
  }),
  stackedTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.sm,
  },
  swatch: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  who: {
    flex: 1,
  },
  name: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
  note: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  pill: {
    // A long pass-and-play name may not push the score off the strip.
    flexShrink: 1,
    maxWidth: '50%',
    paddingHorizontal: theme.space.sm,
    paddingVertical: theme.space.xxs,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.turn,
  },
  pillStacked: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  pillText: {
    ...theme.type.section,
    color: theme.colors.onAccent,
  },
  score: {
    ...theme.type.title,
    color: theme.colors.text,
  },
  target: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
}));
