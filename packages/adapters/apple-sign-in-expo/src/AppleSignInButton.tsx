/**
 * Apple's own "Continue with Apple" button (Apple's design rules: its
 * look, words and size come from iOS, in the phone's language). Show it
 * only when `AppleSheet.isAvailable()` says true; it draws nothing
 * elsewhere.
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import type { StyleProp, ViewStyle } from 'react-native';

export interface AppleSignInButtonProps {
  onPress: () => void;
  /** `dark`: a white button on a dark screen; else black. */
  dark: boolean;
  /** Height and width: the button draws nothing without them. */
  style: StyleProp<ViewStyle>;
  cornerRadius?: number;
  testID?: string;
}

export function AppleSignInButton({
  onPress,
  dark,
  style,
  cornerRadius,
  testID,
}: AppleSignInButtonProps) {
  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={
        dark
          ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
          : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
      }
      onPress={onPress}
      style={style}
      {...(cornerRadius === undefined ? {} : { cornerRadius })}
      {...(testID === undefined ? {} : { testID })}
    />
  );
}
