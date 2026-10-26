/**
 * "Who starts?" (wireframe 6a): a card over the board with one die per player.
 */
import { Canvas } from '@shopify/react-native-skia';
import type { PerPlayer, PlayerId } from '@tavli/engine';
import type { ThemeManifest } from '@tavli/themes';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { DIE_SIZE } from '@/features/board/DiceRow';
import { AnimatedDie } from '@/features/board/skia/AnimatedDie';

import type { OpeningStatus } from './opening';

export interface OpeningCardProps {
  theme: ThemeManifest;
  status: OpeningStatus;
  names: PerPlayer<string>;
  /** Changes when a new round starts (after a tie), so the dice roll again. */
  roundKey: string;
  onDieLanded?: () => void;
}

const BOX = DIE_SIZE * 1.6;

function OpeningDie({
  theme,
  value,
  rollKey,
  index,
  onLand,
}: {
  theme: ThemeManifest;
  value: number | null;
  rollKey: string;
  index: number;
  onLand?: () => void;
}) {
  const { t } = useTranslation();
  if (value === null) {
    return (
      <View style={styles.placeholder} accessible accessibilityLabel={t('game.opening.notRolled')}>
        <Text style={styles.question}>?</Text>
      </View>
    );
  }
  return (
    <Canvas
      style={styles.dieCanvas}
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('game.opening.rolled', { value })}>
      <AnimatedDie
        key={rollKey}
        style={theme.dice}
        x={BOX / 2}
        y={BOX / 2}
        size={DIE_SIZE}
        value={value}
        index={index}
        tilt={theme.layouts['portrait-rotated'].dice.tilt[index] ?? 0}
        used={false}
        rollKey={rollKey}
        {...(onLand ? { onLand } : {})}
      />
    </Canvas>
  );
}

export function OpeningCard({ theme, status, names, roundKey, onDieLanded }: OpeningCardProps) {
  const { t } = useTranslation();
  const players: PlayerId[] = ['white', 'black'];
  let message: string;
  if (status.kind === 'decided') {
    const high = Math.max(status.white, status.black);
    const low = Math.min(status.white, status.black);
    message = t('game.opening.result', { name: names[status.starter], high, low });
  } else if (status.tie !== null && status.white === null && status.black === null) {
    message = t('game.opening.tie', { value: status.tie });
  } else {
    message = t('game.opening.body');
  }
  return (
    <View testID="opening-card" style={styles.card} accessibilityLiveRegion="polite">
      <Text style={styles.title} accessibilityRole="header">
        {t('game.opening.title')}
      </Text>
      <Text testID="opening-message" style={styles.body}>
        {message}
      </Text>
      <View style={styles.dice}>
        {players.map((player, index) => (
          <View key={player} style={styles.player}>
            <OpeningDie
              theme={theme}
              value={status[player]}
              rollKey={`${roundKey}:${player}`}
              index={index}
              {...(onDieLanded ? { onLand: onDieLanded } : {})}
            />
            <Text style={styles.name} numberOfLines={1}>
              {names[player]}
            </Text>
          </View>
        ))}
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
    ...theme.type.title,
    color: theme.colors.text,
    textAlign: 'center',
  },
  body: {
    fontSize: 16,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
  dice: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: theme.space.xl,
    paddingTop: theme.space.sm,
  },
  player: {
    alignItems: 'center',
    gap: theme.space.xs,
    maxWidth: 140,
  },
  dieCanvas: {
    width: BOX,
    height: BOX,
  },
  placeholder: {
    width: BOX,
    height: BOX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  question: {
    width: DIE_SIZE,
    height: DIE_SIZE,
    lineHeight: DIE_SIZE,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.textDim,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: theme.radii.md,
    borderColor: theme.colors.border,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
}));
