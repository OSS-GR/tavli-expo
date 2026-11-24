/**
 * True in a browser (#679). The board uses it for the few places where the
 * web needs its own path: CanvasKit has no system font, a new canvas is a
 * new WebGL context, and Safari is slow per draw call and per first use of
 * a shader. It is a constant, so a component may pick its hooks by it.
 * See "The Safari freezes" in `docs/architecture/web-app.md`.
 */
import { Platform } from 'react-native';

export const WEB_BOARD = Platform.OS === 'web';
