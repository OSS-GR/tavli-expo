/**
 * Whether the on-screen keyboard shows now. A sheet with a text field
 * gives its content more room while it does (#729).
 *
 * iOS tells before the keyboard moves ("will"), Android only after
 * ("did"), so both are heard. A browser has no such events: there it
 * stays `false`.
 */
import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

export function useKeyboardShown(): boolean {
  // A sheet that opens over a keyboard that is up already starts right.
  const [shown, setShown] = useState(() => Keyboard.isVisible());
  useEffect(() => {
    const subscriptions = [
      Keyboard.addListener('keyboardWillShow', () => setShown(true)),
      Keyboard.addListener('keyboardDidShow', () => setShown(true)),
      Keyboard.addListener('keyboardWillHide', () => setShown(false)),
      Keyboard.addListener('keyboardDidHide', () => setShown(false)),
    ];
    return () => {
      for (const subscription of subscriptions) subscription.remove();
    };
  }, []);
  return shown;
}
