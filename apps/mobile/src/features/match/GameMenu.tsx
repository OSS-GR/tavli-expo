/**
 * The in-game menu (wireframe 7). Its resign dialogs (wireframe 13) use
 * `ConfirmDialog` from `@/components`.
 * Resign sits at the top, far from the thumb; Resume at the bottom.
 */
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';

export interface MenuRowProps {
  icon: string;
  title: string;
  hint?: string;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}

export function MenuRow({ icon, title, hint, disabled = false, onPress, testID }: MenuRowProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={hint ? `${title}, ${hint}` : title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.icon}>
        <Text
          style={styles.iconText(disabled)}
          importantForAccessibility="no"
          allowFontScaling={false}>
          {icon}
        </Text>
      </View>
      <View style={styles.texts}>
        <Text style={styles.title(disabled)}>{title}</Text>
        {hint ? <Text style={styles.hint(disabled)}>{hint}</Text> : null}
      </View>
      <Text style={styles.chevron(disabled)} importantForAccessibility="no">
        {'›'}
      </Text>
    </Pressable>
  );
}

export interface GameMenuProps {
  summary: string;
  /** `null` hides the hint and disables the row. */
  resignGameHint: string | null;
  resignMatchHint: string | null;
  rulesLabel: string;
  onResignGame: () => void;
  onResignMatch: () => void;
  onRules: () => void;
  onSettings: () => void;
  onExit: () => void;
  exitHint: string;
  onResume: () => void;
}

export function GameMenu(props: GameMenuProps) {
  const { t } = useTranslation();
  return (
    <View testID="game-menu" style={styles.menu}>
      <Text style={styles.heading} accessibilityRole="header">
        {t('game.menu.title')}
      </Text>
      <Text style={styles.summary}>{props.summary}</Text>
      <MenuRow
        testID="menu-resign-game"
        icon="!"
        title={t('game.menu.resignGame')}
        {...(props.resignGameHint ? { hint: props.resignGameHint } : {})}
        disabled={props.resignGameHint === null}
        onPress={props.onResignGame}
      />
      <MenuRow
        testID="menu-resign-match"
        icon="!!"
        title={t('game.menu.resignMatch')}
        {...(props.resignMatchHint ? { hint: props.resignMatchHint } : {})}
        disabled={props.resignMatchHint === null}
        onPress={props.onResignMatch}
      />
      <MenuRow testID="menu-rules" icon="?" title={props.rulesLabel} onPress={props.onRules} />
      <MenuRow
        testID="menu-settings"
        icon={'⚙︎'}
        title={t('game.menu.settings')}
        onPress={props.onSettings}
      />
      <MenuRow
        testID="menu-exit"
        icon={'⌂'}
        title={t('game.menu.exit')}
        hint={props.exitHint}
        onPress={props.onExit}
      />
      <View style={styles.resume}>
        <ActionButton testID="menu-resume" label={t('game.menu.resume')} onPress={props.onResume} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  menu: {
    gap: theme.space.xs,
  },
  heading: {
    ...theme.type.title,
    color: theme.colors.text,
  },
  summary: {
    ...theme.type.body,
    color: theme.colors.textDim,
    paddingBottom: theme.space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    minHeight: theme.touch.row,
    paddingVertical: theme.space.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.separator,
  },
  pressed: {
    opacity: 0.7,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSelected,
  },
  iconText: (disabled: boolean) => ({
    ...theme.type.bodyStrong,
    color: disabled ? theme.colors.textDisabled : theme.colors.text,
  }),
  texts: {
    flex: 1,
  },
  title: (disabled: boolean) => ({
    ...theme.type.bodyStrong,
    color: disabled ? theme.colors.textDisabled : theme.colors.text,
  }),
  hint: (disabled: boolean) => ({
    ...theme.type.caption,
    color: disabled ? theme.colors.textDisabled : theme.colors.textDim,
  }),
  chevron: (disabled: boolean) => ({
    ...theme.type.title,
    color: disabled ? theme.colors.textDisabled : theme.colors.textDim,
  }),
  resume: {
    paddingTop: theme.space.md,
  },
}));
