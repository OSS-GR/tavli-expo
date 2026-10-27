/** `render` with the app's root views (Gesture Handler needs its root view). */
import { render } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

function Root({ children }: { children: ReactNode }) {
  return <GestureHandlerRootView style={{ flex: 1 }}>{children}</GestureHandlerRootView>;
}

export function renderWithRoot(ui: ReactElement) {
  return render(ui, { wrapper: Root });
}
