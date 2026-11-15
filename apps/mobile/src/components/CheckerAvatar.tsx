import { fonts, withAlpha } from '@tavli/ui';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { avatarWood, initialsOf } from './avatar';

/** The sizes from the Figma pass (Patterns → Checker avatars). */
export type CheckerAvatarSize = 18 | 24 | 32 | 40 | 56 | 72;

/** Initials show from this size up; smaller avatars are a plain checker. */
const MIN_INITIALS_SIZE = 32;

export interface CheckerAvatarProps {
  /** The player's id: it picks the wood, so it stays the same on every phone. */
  playerKey: string;
  /** The name the initials come from. With none the checker is plain. */
  name?: string | null;
  size?: CheckerAvatarSize;
  /** You: a brass ring. */
  you?: boolean;
  testID?: string;
}

/**
 * A player as a checker seen from above (#495): the board's own woods,
 * picked from the player id, with the player's initials in Piazzolla. It
 * only decorates: screen readers skip it and hear the name next to it.
 */
export function CheckerAvatar({
  playerKey,
  name = null,
  size = 40,
  you = false,
  testID,
}: CheckerAvatarProps) {
  const { theme } = useUnistyles();
  const wood = avatarWood(playerKey);
  const colors = theme.avatar[wood];
  const initials = name !== null && size >= MIN_INITIALS_SIZE ? initialsOf(name) : '';
  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.checker(size),
        {
          backgroundColor: colors.face,
          // The turned center, a lit ring around it, then the face.
          backgroundImage: `radial-gradient(circle closest-side, ${colors.center} 0%, ${colors.center} 54%, ${colors.ring} 57%, ${colors.face} 100%)`,
          borderColor: you ? theme.avatar.you : colors.rim,
          borderWidth: you ? 2 : 1,
        },
      ]}>
      {initials ? (
        // The checker keeps its size with a large system font: the initials do not scale.
        <Text allowFontScaling={false} style={[styles.initials(size), { color: colors.text }]}>
          {initials}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  checker: (size: number) => ({
    width: size,
    height: size,
    borderRadius: size / 2,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: `0px 2px 4px ${withAlpha(theme.colors.backgroundDeep, 0.5)}`,
  }),
  initials: (size: number) => ({
    fontFamily: fonts.numerals,
    // 24 on 56, 17 on 40, 13 on 32 (Figma).
    fontSize: Math.round(size * 0.43),
    lineHeight: Math.round(size * 0.5),
    includeFontPadding: false,
  }),
}));
