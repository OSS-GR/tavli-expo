/**
 * Connects an online game route (#266): a spinner while it loads the
 * session, "This game could not be opened." when online play is off,
 * nobody is signed in or the session did not load, else `children` with the transport and the player id
 * (`useOnlineConnection`, `connection.ts`).
 */
import type { GameTransport } from '@tavli/contracts';
import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { MissingGame } from '@/features/match/MissingGame';

import { useOnlineConnection } from './connection';

export interface OnlineConnectProps {
  readonly gameId: string;
  readonly onHome: () => void;
  readonly children: (connection: { transport: GameTransport; me: string }) => ReactNode;
}

export function OnlineConnect({ gameId, onHome, children }: OnlineConnectProps) {
  const connection = useOnlineConnection(gameId);
  if (connection.status === 'connecting') {
    return (
      <View testID="online-connecting" style={styles.connecting}>
        <ActivityIndicator />
      </View>
    );
  }
  if (connection.status !== 'ready') return <MissingGame onHome={onHome} />;
  return children({ transport: connection.transport, me: connection.me });
}

const styles = StyleSheet.create((theme) => ({
  connecting: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
}));
