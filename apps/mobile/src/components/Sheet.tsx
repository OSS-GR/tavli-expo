/**
 * A bottom sheet over a dimmed screen (wireframes 7 and 13). A tap on the
 * dimmed part, or the Android back button, calls `onClose`.
 *
 * It is a `Modal`, so screen readers stay in it. The content scrolls when a
 * large font makes it taller than the screen (#153).
 */
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  /** Read by screen readers on the dimmed part, for example "Resume". */
  closeLabel: string;
  /** `dialog`: a card with side margins (13). `sheet`: full width (7). */
  look?: 'sheet' | 'dialog';
  children: ReactNode;
  testID?: string;
}

export function Sheet({
  visible,
  onClose,
  closeLabel,
  look = 'sheet',
  children,
  testID,
}: SheetProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          style={styles.scrim}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        />
        <View testID={testID} style={styles.sheet(look)} accessibilityViewIsModal>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content(look)}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.backgroundDeep,
    opacity: 0.7,
  },
  sheet: (look: 'sheet' | 'dialog') => ({
    // Never taller than the screen: the content scrolls instead.
    flexShrink: 1,
    maxHeight: '100%',
    overflow: 'hidden',
    marginTop: rt.insets.top,
    marginHorizontal: look === 'dialog' ? theme.space.lg : 0,
    marginBottom: look === 'dialog' ? rt.insets.bottom + theme.space.lg : 0,
    borderTopLeftRadius: theme.radii.xl,
    borderTopRightRadius: theme.radii.xl,
    borderBottomLeftRadius: look === 'dialog' ? theme.radii.xl : 0,
    borderBottomRightRadius: look === 'dialog' ? theme.radii.xl : 0,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  }),
  scroll: {
    flexGrow: 0,
  },
  content: (look: 'sheet' | 'dialog') => ({
    gap: theme.space.sm,
    padding: theme.space.xl,
    paddingBottom: look === 'sheet' ? rt.insets.bottom + theme.space.lg : theme.space.xl,
  }),
}));
