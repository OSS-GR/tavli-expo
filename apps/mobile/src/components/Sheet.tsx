/**
 * A bottom sheet over a dimmed screen (wireframes 7 and 13). A tap on the
 * dimmed part, or the Android back button, calls `onClose`.
 *
 * It is a `Modal`, so screen readers stay in it. The content scrolls when a
 * large font makes it taller than the screen (#153).
 *
 * Landscape (#185): a sheet over the game screen passes `turns`, so the
 * Modal may stay sideways with the game (on iOS a Modal turns the screen
 * back to portrait if it does not list landscape). On a wide screen the
 * sheet keeps a readable width (`MAX_SHEET_WIDTH`) in the middle.
 *
 * The `raised` look is the bottom sheet of the Figma polish pass (#515):
 * full width like `sheet`, with the raised fill, a brass top edge, 28 pt
 * top corners and a grab handle. Only the game menu uses it so far. The
 * handle only decorates: the sheet closes with a tap on the dimmed part,
 * the Android back button or the content's own button.
 *
 * A text field in it (the email code, the username) stays above the
 * keyboard: on iOS the sheet moves up with it (`KeyboardAvoidingView`);
 * Android resizes the window.
 */
import { useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
  type ModalProps,
} from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

export type SheetLook = 'sheet' | 'raised' | 'dialog' | 'bare';

/** `sheet` and `raised` sit at the bottom edge, full width. */
function atBottom(look: SheetLook): boolean {
  return look === 'sheet' || look === 'raised';
}

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  /** Read by screen readers on the dimmed part, for example "Resume". */
  closeLabel: string;
  /**
   * `dialog`: a card with side margins (13). `sheet`: full width (7).
   * `raised`: full width in the Figma look, with a grab handle (#515).
   * `bare`: placed like `dialog`, with no box of its own: the content
   * brings its own (the problem popup, #480). It adds no padding or gap
   * either: the content does its own spacing. A sheet that closes keeps
   * the look it had while it fades out.
   */
  look?: SheetLook;
  /** The screen under it turns with the phone (the game screen): the sheet turns too. */
  turns?: boolean;
  children: ReactNode;
  testID?: string;
}

export function Sheet({
  visible,
  onClose,
  closeLabel,
  look = 'sheet',
  turns = false,
  children,
  testID,
}: SheetProps) {
  // Keep the last look while the Modal fades out: a caller that picks the
  // look from what it shows (Settings → Account) must not restyle a
  // closing sheet.
  const [kept, setKept] = useState(look);
  if (visible && kept !== look) setKept(look);
  const shown = visible ? look : kept;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      supportedOrientations={turns ? TURNS : UPRIGHT}>
      <KeyboardAvoidingView
        style={styles.root(shown)}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable
          style={styles.scrim}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        />
        <View testID={testID} style={styles.sheet(shown)} accessibilityViewIsModal>
          {shown === 'raised' ? (
            <View
              style={styles.handle}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          ) : null}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content(shown)}
            keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** iOS only: the orientations the Modal allows. Android follows the screen under it. */
const UPRIGHT: ModalProps['supportedOrientations'] = ['portrait'];
const TURNS: ModalProps['supportedOrientations'] = ['portrait', 'landscape'];

/** The widest a sheet gets (a phone on its side is about 950 pt wide). */
export const MAX_SHEET_WIDTH = 560;

const styles = StyleSheet.create((theme, rt) => ({
  root: (look: SheetLook) => ({
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: atBottom(look) ? 0 : theme.space.lg,
  }),
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.backgroundDeep,
    opacity: 0.7,
  },
  sheet: (look: SheetLook) => ({
    // Never taller than the screen: the content scrolls instead.
    flexShrink: 1,
    maxHeight: '100%',
    width: '100%',
    maxWidth: MAX_SHEET_WIDTH,
    // `bare` clips nothing: the content's own border and corners show whole.
    overflow: look === 'bare' ? 'visible' : 'hidden',
    marginTop: rt.insets.top,
    marginBottom: atBottom(look) ? 0 : rt.insets.bottom + theme.space.lg,
    // `bare` has no box: no fill, no border, and no corners that would cut
    // the content's own.
    ...(look === 'bare'
      ? {}
      : look === 'raised'
        ? {
            borderTopLeftRadius: theme.radii.sheet,
            borderTopRightRadius: theme.radii.sheet,
            backgroundColor: theme.colors.surfaceRaised,
            borderTopWidth: 1,
            borderColor: theme.colors.accentLine,
            boxShadow: `inset 0px 1px 0px ${theme.colors.border}`,
          }
        : {
            borderTopLeftRadius: theme.radii.xl,
            borderTopRightRadius: theme.radii.xl,
            borderBottomLeftRadius: look === 'sheet' ? 0 : theme.radii.xl,
            borderBottomRightRadius: look === 'sheet' ? 0 : theme.radii.xl,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }),
  }),
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    marginTop: theme.space.sm,
    backgroundColor: theme.colors.border,
  },
  scroll: {
    flexGrow: 0,
  },
  // One object for every look, so a theme change repaints it (#539).
  content: (look: SheetLook) => ({
    gap: look === 'bare' ? 0 : theme.space.sm,
    paddingHorizontal: look === 'bare' ? 0 : look === 'raised' ? theme.space.lg : theme.space.xl,
    paddingTop: look === 'bare' ? 0 : look === 'raised' ? theme.space.lg : theme.space.xl,
    paddingBottom:
      look === 'bare'
        ? 0
        : look === 'sheet' || look === 'raised'
          ? rt.insets.bottom + theme.space.lg
          : theme.space.xl,
  }),
}));
