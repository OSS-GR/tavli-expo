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
 * top corners and a grab handle. The handle works (#652): drag it down and
 * the sheet follows the finger; let go past `DRAG_CLOSE_DISTANCE` and it
 * slides away and calls `onClose`, a shorter drag springs it back. The
 * dimmed part, the Android back button and the content's own button close
 * it too; screen readers use those (the handle is hidden from them).
 * Android needs its own `GestureHandlerRootView` in a `Modal`.
 *
 * A text field in it (the email code, the username) stays above the
 * keyboard: on iOS the sheet moves up with it (`KeyboardAvoidingView`);
 * Android resizes the window.
 */
import { useEffect, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
  type ModalProps,
} from 'react-native';
import {
  GestureDetector,
  GestureHandlerRootView,
  usePanGesture,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';
import { scheduleOnRN } from 'react-native-worklets';

/** A drag of the handle this far down closes the sheet (points). */
export const DRAG_CLOSE_DISTANCE = 90;
/** How far a closing sheet slides before the Modal fades (points). */
const DRAG_AWAY = 400;
/** The handle's touch area: taller than the bar, so a thumb finds it. */
const HANDLE_HEIGHT = 28;

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
   * The content has its own close button with the same job (the sign-in
   * sheet): the dimmed part still closes on a tap, but screen readers
   * skip it, so they do not hear two buttons with one label.
   */
  ownCloseButton?: boolean;
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
  ownCloseButton = false,
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

  // The drag of the handle (#652). A sheet that opens again starts in place.
  const dragY = useSharedValue(0);
  useEffect(() => {
    if (visible) dragY.set(0);
  }, [visible, dragY]);
  // A drag that closes asks `onClose`. A parent may keep the sheet open
  // (a call still on its way holds it): then the sheet springs back, so it
  // never stays off screen under the scrim.
  const [dragClosed, setDragClosed] = useState(0);
  useEffect(() => {
    if (dragClosed > 0 && visible) dragY.set(withSpring(0, SPRING));
  }, [dragClosed, visible, dragY]);
  const closeByDrag = () => {
    setDragClosed((n) => n + 1);
    onClose();
  };
  const pan = usePanGesture({
    // No spread here: the Worklets Babel plugin does not allow one in a gesture config.
    minDistance: 4,
    enabled: visible && shown === 'raised',
    testID: 'sheet-handle-pan',
    onUpdate: (e) => {
      'worklet';
      // Never above its place: only down.
      dragY.set(Math.max(0, e.translationY));
    },
    onFinalize: (e) => {
      'worklet';
      // The end event has no translation: the last update left it in `dragY`.
      if (!e.canceled && dragY.get() >= DRAG_CLOSE_DISTANCE) {
        dragY.set(withTiming(DRAG_AWAY, { duration: 180 }));
        scheduleOnRN(closeByDrag);
      } else {
        dragY.set(withSpring(0, SPRING));
      }
    },
  });
  const dragged = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.get() }] }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      supportedOrientations={turns ? TURNS : UPRIGHT}>
      <GestureHandlerRootView style={styles.gestures}>
        <KeyboardAvoidingView
          style={styles.root(shown)}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable
            style={styles.scrim}
            onPress={onClose}
            accessible={!ownCloseButton}
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
            accessibilityElementsHidden={ownCloseButton}
            importantForAccessibility={ownCloseButton ? 'no-hide-descendants' : 'auto'}
          />
          <Animated.View
            testID={testID}
            style={[styles.sheet(shown), dragged]}
            accessibilityViewIsModal>
            {shown === 'raised' ? (
              <GestureDetector gesture={pan}>
                <View
                  testID="sheet-handle"
                  style={styles.handleArea}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants">
                  <View style={styles.handle} />
                </View>
              </GestureDetector>
            ) : null}
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.content(shown)}
              keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

/** How a dragged sheet goes back to its place. */
const SPRING = { damping: 20, stiffness: 220 };

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
    // Clear of a camera at the side (an iPhone Duo's camera column).
    paddingLeft: rt.insets.left + (atBottom(look) ? 0 : theme.space.lg),
    paddingRight: rt.insets.right + (atBottom(look) ? 0 : theme.space.lg),
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
  gestures: {
    flex: 1,
  },
  handleArea: {
    height: HANDLE_HEIGHT,
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingTop: theme.space.sm,
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.border,
  },
  scroll: {
    flexGrow: 0,
  },
  // One object for every look, so a theme change repaints it (#539).
  content: (look: SheetLook) => ({
    gap: look === 'bare' ? 0 : theme.space.sm,
    paddingHorizontal: look === 'bare' ? 0 : look === 'raised' ? theme.space.lg : theme.space.xl,
    // `raised`: the handle area above already gives the space.
    paddingTop: look === 'bare' ? 0 : look === 'raised' ? theme.space.xxs : theme.space.xl,
    paddingBottom:
      look === 'bare'
        ? 0
        : look === 'sheet' || look === 'raised'
          ? rt.insets.bottom + theme.space.lg
          : theme.space.xl,
  }),
}));
