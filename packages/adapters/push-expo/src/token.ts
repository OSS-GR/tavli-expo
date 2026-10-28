/**
 * The shape of an Expo push token: `ExponentPushToken[…]` (what
 * `getExpoPushTokenAsync` gives today) or `ExpoPushToken[…]`. The part in
 * the brackets has no spaces and no brackets.
 */

/** The longest token we keep. Real tokens are far shorter. */
export const MAX_EXPO_PUSH_TOKEN_LENGTH = 200;

const TOKEN_SHAPE = /^Expo(?:nent)?PushToken\[[^\s[\]]+\]$/;

export function isExpoPushToken(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_EXPO_PUSH_TOKEN_LENGTH &&
    TOKEN_SHAPE.test(value)
  );
}
