/**
 * "Who starts?" (wireframe 6a, #176; Figma pass #499): a card over the
 * board with one die per player, a seat label under each (their checker and
 * name), and a big Roll button.
 *
 * - Before a roll, a die is an empty slot with a brass outline and a "?".
 * - A roll tumbles the die and lands it on the value the engine rolled.
 * - A tie keeps both dice on screen with "Tie: both rolled 4. Roll again."
 *   until the next roll.
 * - The result ("You start", "Maria starts with 6-3.") has a Play button
 *   that closes it at once; the screen also closes it after a moment.
 * - With the house rule `rerollBoth` (#207) the starter does not play the
 *   opening dice but rolls both dice again: "Maria starts (6-3) and rolls
 *   again." The engine decides; `rollsAgain` only picks the words.
 * - Online (#379) each phone rolls only its own die. Once it is in,
 *   `waiting` ("Waiting for Opponent…") takes the place of Roll.
 *
 * Each step is read to screen reader users (`useAnnouncement`); focus moves
 * to the title when the card opens (#153).
 */
import { Canvas } from '@shopify/react-native-skia';
import type { DieValue, PerPlayer, PlayerId } from '@tavli/engine';
import type { CheckerStyle, ThemeManifest } from '@tavli/themes';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { DIE_SIZE } from '@/features/board/diceMotion';
import { AnimatedDie } from '@/features/board/skia/AnimatedDie';

import { openingDice, type OpeningStatus } from './opening';
import { useAnnouncement } from './useAnnouncement';

export interface OpeningCardProps {
  theme: ThemeManifest;
  status: OpeningStatus;
  names: PerPlayer<string>;
  /** Each player's checker style from the board theme, for the seat labels. */
  checkers: PerPlayer<CheckerStyle>;
  /** The human vs the bot: the result says "You start". */
  you?: PlayerId | null;
  /** The starter rolls both dice again (`openingRoll: "rerollBoth"`, #207). */
  rollsAgain?: boolean;
  /**
   * Names the game: the match (for this app run) and the game in it. With
   * `status.round` it keys each die's roll and each step read to screen
   * readers, so a remount does not read a step again (#216).
   */
  gameKey: string;
  /** The Roll button's label ("Maria: roll"). Shown while the dice are not decided. */
  rollLabel: string;
  /** Just after a tie the Roll button waits a moment, so a quick tap does not skip the tie. */
  rollDisabled?: boolean;
  /**
   * Online (#379): you cannot roll now (your die is in, or on its way).
   * This text shows in place of the Roll button.
   */
  waiting?: string | null;
  onRoll: () => void;
  /** Closes the result. */
  onClose: () => void;
  onDieLanded?: () => void;
}

/** The opening dice are bigger than the dice in the controls row. */
const SIZE = Math.round(DIE_SIZE * 1.3);
/** Room around the die for its hop and shadow. */
const BOX = Math.round(SIZE * 1.6);

function OpeningDie({
  theme,
  value,
  rollKey,
  index,
  label,
  testID,
  onLand,
}: {
  theme: ThemeManifest;
  value: DieValue | null;
  rollKey: string;
  index: number;
  label: string;
  testID: string;
  onLand?: () => void;
}) {
  const tilt = theme.layouts['portrait-rotated'].dice.tilt[index] ?? 0;
  return (
    // One canvas for the whole card life, always in this native view
    // (`collapsable={false}`): on iOS a canvas that moves to another native
    // parent loses its drawing (#173). The empty slot comes after it, so the
    // canvas keeps its place.
    <View collapsable={false} style={styles.dieBox}>
      <Canvas
        testID={testID}
        style={styles.dieBox}
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}>
        {value === null ? null : (
          <AnimatedDie
            key={rollKey}
            style={theme.dice}
            x={BOX / 2}
            y={BOX / 2}
            size={SIZE}
            value={value}
            index={index}
            tilt={tilt}
            used={false}
            rollKey={rollKey}
            {...(onLand ? { onLand } : {})}
          />
        )}
      </Canvas>
      {value === null ? (
        // Not rolled yet: an empty slot with a brass outline. The canvas says it.
        <View
          testID={`${testID}-slot`}
          style={styles.slot}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          <Text style={styles.slotMark}>?</Text>
        </View>
      ) : null}
    </View>
  );
}

const PLAYERS: readonly PlayerId[] = ['white', 'black'];

export function OpeningCard({
  theme,
  status,
  names,
  checkers,
  you = null,
  rollsAgain = false,
  gameKey,
  rollLabel,
  rollDisabled = false,
  waiting = null,
  onRoll,
  onClose,
  onDieLanded,
}: OpeningCardProps) {
  const { t } = useTranslation();
  const dice = openingDice(status);
  const decided = status.kind === 'decided';

  let message: string;
  // Only the rules line is quiet; a roll, a tie and the result stand out.
  let quiet = false;
  if (status.kind === 'decided') {
    const high = Math.max(status.white, status.black);
    const low = Math.min(status.white, status.black);
    const vars = { name: names[status.starter], high, low };
    if (rollsAgain) {
      message =
        status.starter === you
          ? t('game.opening.resultReroll_you', vars)
          : t('game.opening.resultReroll', vars);
    } else {
      message =
        status.starter === you
          ? t('game.opening.result_you', vars)
          : t('game.opening.result', vars);
    }
  } else if (status.kind === 'tie') {
    message = t('game.opening.tie', { value: status.value });
  } else {
    // One die rolled (pass-and-play): say whose and what.
    const { white, black } = status;
    const rolled: PlayerId | null =
      white !== null && black === null
        ? 'white'
        : black !== null && white === null
          ? 'black'
          : null;
    const value = rolled === null ? null : status[rolled];
    quiet = value === null;
    message =
      rolled === null || value === null
        ? rollsAgain
          ? t('game.opening.bodyReroll')
          : t('game.opening.body')
        : rolled === you
          ? t('game.opening.rolledBy_you', { value })
          : t('game.opening.rolledBy', { name: names[rolled], value });
  }

  // Focus goes to the title when the card opens (#153), then each step is
  // read: the message and what to do next. A new round reads again, even
  // with the same words (two ties of 4). A remount does not (#216).
  const titleRef = useFocusOnShow();
  const title =
    status.kind === 'decided'
      ? status.starter === you
        ? t('game.opening.titleYou')
        : t('game.opening.titleStarts', { name: names[status.starter] })
      : t('game.opening.title');
  useAnnouncement(
    decided ? message : `${message} ${waiting ?? `${rollLabel}.`}`,
    `${gameKey}:opening:${status.kind}:${status.round}`,
  );

  return (
    <View testID="opening-card" style={styles.card}>
      <Text ref={titleRef} style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text testID="opening-message" style={styles.message(quiet)}>
        {message}
      </Text>
      <View style={styles.dice}>
        {PLAYERS.map((player, index) => {
          const value = dice[player];
          const starts = status.kind === 'decided' && status.starter === player;
          return (
            <View key={player} style={styles.player}>
              <OpeningDie
                theme={theme}
                value={value}
                rollKey={`${gameKey}:${status.round}:${player}`}
                index={index}
                testID={`opening-die-${player}`}
                label={
                  value === null ? t('game.opening.notRolled') : t('game.opening.rolled', { value })
                }
                {...(onDieLanded ? { onLand: onDieLanded } : {})}
              />
              <View style={styles.seat}>
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor: checkers[player].fill,
                      borderColor: checkers[player].rim.color,
                    },
                  ]}
                />
                <Text style={styles.name(starts)}>{names[player]}</Text>
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.actions}>
        {decided ? (
          <ActionButton
            testID="opening-ok-button"
            label={t('game.opening.play')}
            icon="play"
            onPress={onClose}
          />
        ) : waiting !== null ? (
          <Text testID="opening-waiting" style={styles.waiting}>
            {waiting}
          </Text>
        ) : (
          <ActionButton
            testID="roll-button"
            label={rollLabel}
            subtitle={t('game.roll.orSwipeBoard')}
            icon="dices"
            disabled={rollDisabled}
            onPress={onRoll}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    marginHorizontal: theme.space.lg,
    padding: theme.space.lg,
    gap: theme.space.sm,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  title: {
    ...theme.type.title2,
    color: theme.colors.text,
    textAlign: 'center',
  },
  message: (quiet: boolean) => ({
    ...(quiet ? theme.type.body : theme.type.bodyStrong),
    color: quiet ? theme.colors.textDim : theme.colors.text,
    textAlign: 'center',
  }),
  dice: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: theme.space.xl,
  },
  player: {
    alignItems: 'center',
    gap: theme.space.xs,
    maxWidth: 140,
  },
  dieBox: {
    width: BOX,
    height: BOX,
  },
  slot: {
    position: 'absolute',
    left: (BOX - SIZE) / 2,
    top: (BOX - SIZE) / 2,
    width: SIZE,
    height: SIZE,
    borderRadius: Math.round(SIZE * 0.2),
    borderWidth: 2,
    borderColor: theme.colors.accentLine,
    backgroundColor: theme.colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotMark: {
    ...theme.type.numeral,
    fontSize: 28,
    lineHeight: 34,
    color: theme.colors.accentLight,
  },
  seat: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.xs,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  name: (starts: boolean) => ({
    ...theme.type.bodyStrong,
    flexShrink: 1,
    color: starts ? theme.colors.turnText : theme.colors.text,
    textAlign: 'center',
  }),
  actions: {
    alignSelf: 'stretch',
    paddingTop: theme.space.xs,
  },
  waiting: {
    ...theme.type.body,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
}));
