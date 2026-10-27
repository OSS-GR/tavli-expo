/**
 * A player strip above or below the board (wireframe 6): checker color,
 * name, pip count and match score. The player to move gets a thick border
 * and a "Your turn" pill, so color is never the only cue. Asodio adds a
 * short note under the name: the checkers still to enter, or "Army frozen".
 */
import type { CheckerStyle } from '@tavli/themes';
import { displayCaps } from '@tavli/ui';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

export interface PlayerStripProps {
  name: string;
  /** The player's checker style from the board theme (for the color swatch). */
  checker: CheckerStyle;
  /** `null` hides the pip count (Settings → Show pip counts). */
  pips: number | null;
  /** A short note under the name, e.g. "12 to enter" (Asodio). `null`: none. */
  note?: string | null;
  score: number;
  target: number;
  active: boolean;
  /** The pill text while active. Default: "Your turn". */
  turnLabel?: string;
  testID?: string;
}

export function PlayerStrip({
  name,
  checker,
  pips,
  note = null,
  score,
  target,
  active,
  turnLabel,
  testID,
}: PlayerStripProps) {
  const { t } = useTranslation();
  const pill = turnLabel ?? t('game.strip.turn');
  const label = [
    name,
    pips === null ? null : t('game.strip.pipsLabel', { count: pips }),
    note,
    t('game.strip.scoreLabel', { score, target }),
    active ? pill : null,
  ]
    .filter((part) => part !== null)
    .join(', ');
  return (
    <View
      testID={testID}
      style={styles.strip(active)}
      accessible
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}>
      <View
        style={[styles.swatch, { backgroundColor: checker.fill, borderColor: checker.rim.color }]}
      />
      <View style={styles.who}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {pips === null && note === null ? null : (
          <Text style={styles.pips} numberOfLines={1}>
            {[pips === null ? null : t('game.strip.pips', { count: pips }), note]
              .filter((part) => part !== null)
              .join(' · ')}
          </Text>
        )}
      </View>
      {active ? (
        <View style={styles.pill}>
          <Text style={styles.pillText} numberOfLines={1}>
            {displayCaps(pill)}
          </Text>
        </View>
      ) : null}
      <Text style={styles.score}>
        {score}
        <Text style={styles.target}>{` /${target}`}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  strip: (active: boolean) => ({
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    minHeight: theme.touch.minTarget + theme.space.sm,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.xs,
    marginHorizontal: theme.space.sm,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: active ? 3 : 1,
    borderColor: active ? theme.colors.turn : theme.colors.border,
  }),
  swatch: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
  },
  who: {
    flex: 1,
  },
  name: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
  pips: {
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
