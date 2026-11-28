/**
 * Parts of Play a friend in the Figma pass (#516, node `17:17`): the Who
 * row (the invite link, your friends, Add; a tap only picks, #732), the game list with round radio marks,
 * and a one-line setting row (a label, then its control).
 *
 * Text may wrap with a large font: no line limit, and no fixed width on a
 * label (Greek runs longer).
 */
import type { Friend, OnlineGameChoice } from '@tavli/contracts';
import { Fragment, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { CheckerAvatar } from '@/components/CheckerAvatar';
import { Icon } from '@/components/Icon';
import { RowDivider } from '@/components/SectionCard';
import { surfaceStyle } from '@/components/Surface';
import { recordText } from '@/features/friends/record';
import { playerNameText } from '@/features/online/playerName';

/** The checker of a tile in the Who row, in points. */
const CHECKER = 50;
/** The ring around the checker (Anyone) or the space where it would be. */
const RING_PAD = 3;
const RING_WIDTH = 2;
/** The box each checker sits in: the checker, the pad and the ring. */
const TILE_BOX = CHECKER + 2 * (RING_PAD + RING_WIDTH);
/** A tile's width: five fit on a 402 pt phone (Figma). */
const TILE_WIDTH = 64;

export interface WhoRowProps {
  friends: readonly Friend[];
  /** The picked receiver: a friend's player id, or `null` for the invite link. */
  selected: string | null;
  /** Friends who got an invite on this visit: their tiles show a check. */
  invited: ReadonlySet<string>;
  /** An invite is being made: every tile is off. */
  busy: boolean;
  /** A tap on a tile: it only picks the receiver (#732). `null` is the invite link. */
  onSelect: (playerId: string | null) => void;
  /** Add a friend. Without it there is no Add tile. */
  onAdd?: () => void;
  testID?: string;
}

/**
 * Who gets the invite (#516, #732): "Invite link" (anyone with the link),
 * then each friend as a checker with initials, then Add. The tiles are
 * radio buttons: a tap only picks the receiver, and the picked tile wears
 * the brass ring and a bold name. The screen's one main button then makes
 * the link or sends the invite. A friend who got an invite on this visit
 * keeps a check badge.
 */
export function WhoRow({ friends, selected, invited, busy, onSelect, onAdd, testID }: WhoRowProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const linkPicked = selected === null;
  return (
    <View
      testID={testID}
      style={styles.whoTray}
      accessibilityRole="radiogroup"
      accessibilityLabel={t('friend.who')}>
      <Pressable
        testID="friend-anyone"
        accessibilityRole="radio"
        accessibilityLabel={t('friend.anyoneLabel')}
        accessibilityState={{ checked: linkPicked, disabled: busy }}
        disabled={busy}
        onPress={() => onSelect(null)}
        style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
        <View style={linkPicked ? styles.ring : styles.box}>
          <CheckerAvatar wood="ebony" icon="link" size={CHECKER} />
        </View>
        <Text style={linkPicked ? styles.picked : styles.name}>{t('friend.anyone')}</Text>
      </Pressable>
      {friends.map((friend) => {
        const name = playerNameText(friend.name, t) ?? t('friends.unnamed');
        const done = invited.has(friend.playerId);
        const picked = selected === friend.playerId;
        return (
          <Pressable
            key={friend.playerId}
            testID={`friend-pick-${friend.playerId}`}
            accessibilityRole="radio"
            accessibilityLabel={done ? t('friend.invitedTo', { name }) : name}
            accessibilityHint={done ? undefined : (recordText(friend.record, t) ?? undefined)}
            accessibilityState={{ checked: picked, disabled: busy }}
            disabled={busy}
            onPress={() => onSelect(friend.playerId)}
            style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
            <View style={picked ? styles.ring : styles.box}>
              <CheckerAvatar playerKey={friend.playerId} name={name} size={CHECKER} />
              {done ? (
                <View style={styles.sentBadge}>
                  <Icon name="check" size={12} color={theme.colors.onAccent} />
                </View>
              ) : null}
            </View>
            <Text style={picked ? styles.picked : styles.name}>{name}</Text>
          </Pressable>
        );
      })}
      {onAdd !== undefined ? (
        <Pressable
          testID="friend-add"
          accessibilityRole="button"
          accessibilityLabel={t('friends.addButton')}
          onPress={onAdd}
          style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
          <View style={styles.addCircle}>
            <Icon name="userPlus" size={22} color={theme.colors.accentLight} />
          </View>
          <Text style={styles.name}>{t('friend.add')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export interface GameChoiceListProps {
  /** Names the group for screen readers. */
  label: string;
  options: readonly OnlineGameChoice[];
  value: OnlineGameChoice;
  onChange: (value: OnlineGameChoice) => void;
  testID: string;
}

/**
 * The games as radio rows on a tray (#516): a round mark on the left, the
 * name in Piazzolla and one short line under it. The picked row is a step
 * lighter, with a brass edge on the left and a filled brass mark with a
 * check, so color is not the only cue.
 */
export function GameChoiceList({ label, options, value, onChange, testID }: GameChoiceListProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={styles.gameTray}>
      <View style={styles.clip}>
        {options.map((game, index) => {
          const selected = game === value;
          const name = t(`games.${game}`);
          const hint = t(`games.${game}Subtitle`);
          return (
            <Fragment key={game}>
              {index > 0 ? <RowDivider /> : null}
              <Pressable
                testID={`${testID}-${game}`}
                accessibilityRole="radio"
                accessibilityLabel={name}
                accessibilityHint={hint}
                accessibilityState={{ checked: selected }}
                onPress={() => onChange(game)}
                style={({ pressed }) => [styles.gameRow(selected), pressed && styles.pressed]}>
                <View style={styles.mark(selected)}>
                  {selected ? <Icon name="check" size={15} color={theme.colors.onAccent} /> : null}
                </View>
                <View style={styles.gameTexts}>
                  <Text style={styles.gameName}>{name}</Text>
                  <Text style={styles.gameHint}>{hint}</Text>
                </View>
              </Pressable>
            </Fragment>
          );
        })}
      </View>
    </View>
  );
}

/**
 * One setting on one line (#516): the label on the left, the control on
 * the right. With a large font the control moves under the label.
 * Screen readers hear the label from the control's own group name.
 */
export function SettingLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel} importantForAccessibility="no" accessibilityElementsHidden>
        {label}
      </Text>
      <View style={styles.lineControl}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  whoTray: {
    ...surfaceStyle(theme, 'tray'),
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.sm,
    padding: theme.space.sm,
  },
  tile: {
    width: TILE_WIDTH,
    alignItems: 'center',
    gap: 6,
  },
  pressed: {
    opacity: 0.7,
  },
  // The picked tile: a brass ring around its checker, and a bold name.
  ring: {
    padding: RING_PAD,
    borderRadius: TILE_BOX / 2,
    borderWidth: RING_WIDTH,
    borderColor: theme.colors.accent,
  },
  box: {
    width: TILE_BOX,
    height: TILE_BOX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sentBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accent,
  },
  addCircle: {
    width: TILE_BOX,
    height: TILE_BOX,
    borderRadius: TILE_BOX / 2,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.accentLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  picked: {
    ...theme.type.footnote,
    fontWeight: '600',
    textAlign: 'center',
    color: theme.colors.text,
  },
  name: {
    ...theme.type.footnote,
    textAlign: 'center',
    color: theme.colors.textDim,
  },
  gameTray: {
    ...surfaceStyle(theme, 'tray'),
  },
  clip: {
    borderRadius: theme.radii.tray,
    overflow: 'hidden',
  },
  gameRow: (selected: boolean) => ({
    minHeight: theme.touch.row,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingHorizontal: theme.space.lg,
    paddingVertical: 6,
    backgroundColor: selected ? theme.colors.surfaceRaised : 'transparent',
    // The picked row's brass edge on the left.
    boxShadow: selected ? `inset 3px 0px 0px ${theme.colors.accent}` : undefined,
  }),
  mark: (selected: boolean) => ({
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: selected ? 0 : 1,
    borderColor: theme.colors.border,
    backgroundColor: selected ? theme.colors.accent : 'transparent',
  }),
  gameTexts: {
    flex: 1,
    gap: theme.space.xxs,
  },
  gameName: {
    ...theme.type.title3,
    color: theme.colors.text,
  },
  gameHint: {
    ...theme.type.footnote,
    color: theme.colors.textDim,
  },
  line: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: theme.space.md,
    rowGap: theme.space.sm,
    paddingLeft: theme.space.xs,
  },
  lineLabel: {
    ...theme.type.sectionHeader,
    minWidth: 108,
    color: theme.colors.textDim,
  },
  lineControl: {
    flexGrow: 1,
    flexBasis: 220,
    flexDirection: 'row',
  },
}));
