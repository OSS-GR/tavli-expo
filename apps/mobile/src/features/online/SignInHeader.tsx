/**
 * The top of a sign-in card (#519, Figma frame 09): the title, one line
 * under it, and a round close button on the right. The sign-in sheet
 * (`SignInSheet`) and the invite card (`InviteAccountGate`) use it. The
 * close button is the old **Not now**: it signs in nothing (the sheet
 * closes, the invite card goes Home). Screen readers hear "Not now".
 */
import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View, type HostInstance } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { RoundButton } from '@/components/RoundButton';

export interface SignInHeaderProps {
  title: string;
  body: string;
  /** Takes the screen reader's focus when the card shows. */
  titleRef?: Ref<HostInstance>;
  onClose: () => void;
}

export function SignInHeader({ title, body, titleRef, onClose }: SignInHeaderProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      <View style={styles.texts}>
        <Text ref={titleRef} style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <Text style={styles.body}>{body}</Text>
      </View>
      <RoundButton
        testID="sign-in-not-now"
        icon="x"
        size="small"
        accessibilityLabel={t('signIn.notNow')}
        onPress={onClose}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space.md,
  },
  texts: {
    flex: 1,
    gap: theme.space.xs,
  },
  title: {
    ...theme.type.title1,
    color: theme.colors.text,
  },
  body: {
    ...theme.type.callout,
    color: theme.colors.textDim,
  },
}));
