/**
 * The rows of "Your online games" (#297), with the loading and failed
 * states. Home shows the first few (`limit`) and "See all"; the "See all"
 * screen shows every row. Each row is one target and reads as one item.
 * History (#313) draws its own rows (`renderRows`) with these states.
 */
import type { GameSummary } from '@tavli/contracts';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';

import { gameRowText, type MyGamesState } from './myGames';

interface OnlineGameListBase {
  state: MyGamesState;
  /** The phone time the clocks show. */
  now: number;
  /** At most this many rows. More rows show "See all" (with `onSeeAll`). Default: every row. */
  limit?: number;
  onSeeAll?: () => void;
  onRetry: () => void;
  /** The text of an empty list. Without it an empty list shows nothing. */
  emptyText?: string;
}

/**
 * Tappable rows that open the game (`onOpen`), or the rows a screen draws
 * itself (`renderRows`, given the games to show).
 */
export type OnlineGameListProps = OnlineGameListBase &
  (
    | { onOpen: (gameId: string) => void; renderRows?: undefined }
    | { renderRows: (games: readonly GameSummary[]) => ReactNode; onOpen?: undefined }
  );

export function OnlineGameList({
  state,
  now,
  limit,
  onOpen,
  renderRows,
  onSeeAll,
  onRetry,
  emptyText,
}: OnlineGameListProps) {
  const { t } = useTranslation();
  if (state.status === 'signedOut') return null;
  if (state.status === 'loading') {
    return (
      <Text testID="online-games-loading" style={styles.note}>
        {t('home.online.loading')}
      </Text>
    );
  }
  if (state.status === 'failed') {
    return (
      <View style={styles.failed}>
        <Text testID="online-games-failed" style={styles.note}>
          {t('home.online.failed')}
        </Text>
        <ActionButton
          testID="online-games-retry"
          kind="secondary"
          label={t('home.online.retry')}
          onPress={onRetry}
        />
      </View>
    );
  }
  const { games, offset } = state;
  const empty =
    games.length === 0 && emptyText !== undefined ? (
      <Text testID="online-games-empty" style={styles.note}>
        {emptyText}
      </Text>
    ) : null;
  // No game and no failure: only the empty text. After a failure the
  // stale note shows even with no game: the list may be out of date.
  if (games.length === 0 && !state.failed) return empty;
  const shown = limit === undefined ? games : games.slice(0, limit);
  return (
    <View style={styles.list}>
      {empty}
      {renderRows !== undefined
        ? renderRows(shown)
        : shown.map((game) => (
            <OnlineGameRow
              key={game.gameId}
              game={game}
              now={now}
              offset={offset}
              onPress={() => onOpen(game.gameId)}
            />
          ))}
      {onSeeAll !== undefined && shown.length < games.length ? (
        <Pressable
          testID="online-games-see-all"
          accessibilityRole="link"
          onPress={onSeeAll}
          hitSlop={8}
          style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
          <Text style={styles.linkText}>{t('home.online.seeAll', { count: games.length })}</Text>
        </Pressable>
      ) : null}
      {state.failed ? (
        <View style={styles.failed}>
          <Text testID="online-games-stale" style={styles.note}>
            {t('home.online.stale')}
          </Text>
          <ActionButton
            testID="online-games-retry"
            kind="secondary"
            label={t('home.online.retry')}
            onPress={onRetry}
          />
        </View>
      ) : null}
    </View>
  );
}

interface OnlineGameRowProps {
  game: GameSummary;
  now: number;
  offset: number;
  onPress: () => void;
}

function OnlineGameRow({ game, now, offset, onPress }: OnlineGameRowProps) {
  const { t } = useTranslation();
  const text = gameRowText(game, t, now, offset);
  return (
    <Pressable
      testID={`online-game-${game.gameId}`}
      accessibilityRole="button"
      accessibilityLabel={text.label}
      onPress={onPress}
      style={({ pressed }) => [styles.row(game.myTurn), pressed && styles.pressed]}>
      <View style={styles.dot(game.myTurn)} importantForAccessibility="no" />
      <View style={styles.texts}>
        <Text style={styles.title}>{text.title}</Text>
        <Text style={styles.turn(game.myTurn)}>{text.turn}</Text>
        <Text style={styles.line}>
          {text.time === null ? text.score : `${text.score} · ${text.time}`}
        </Text>
      </View>
      <Text style={styles.chevron} importantForAccessibility="no">
        {'›'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  list: {
    gap: theme.space.sm,
  },
  row: (myTurn: boolean) => ({
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    minHeight: theme.touch.row,
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space.lg,
    borderRadius: theme.radii.lg,
    borderWidth: myTurn ? 2 : 1,
    borderColor: myTurn ? theme.colors.accent : theme.colors.border,
    backgroundColor: theme.colors.surface,
  }),
  pressed: {
    opacity: 0.75,
  },
  dot: (myTurn: boolean) => ({
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: myTurn ? theme.colors.accent : theme.colors.border,
  }),
  texts: {
    flex: 1,
    gap: theme.space.xxs,
  },
  title: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
  turn: (myTurn: boolean) => ({
    ...(myTurn ? theme.type.bodyStrong : theme.type.body),
    color: myTurn ? theme.colors.text : theme.colors.textDim,
  }),
  line: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  chevron: {
    ...theme.type.title,
    color: theme.colors.textDim,
  },
  note: {
    ...theme.type.body,
    color: theme.colors.textDim,
  },
  failed: {
    gap: theme.space.sm,
  },
  link: {
    alignSelf: 'center',
    minHeight: theme.touch.minTarget,
    justifyContent: 'center',
    paddingHorizontal: theme.space.lg,
  },
  linkText: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
    textDecorationLine: 'underline',
  },
}));
