/**
 * The loading screen of the web app (#669): plain DOM, shown while
 * CanvasKit loads and before React starts. It uses no app code, so it can
 * show at once. The colors are the app's start colors (`app.json`
 * `backgroundColor` and the walnut theme's text color).
 */
export const LOADING_ID = 'tavlaki-loading';
const BACKGROUND = '#3B2A1D';
const TEXT = '#F3E7D3';

export interface LoadingScreen {
  /** The app is on screen: remove the loading screen. */
  done: () => void;
  /** CanvasKit did not load: say so, with a way to try again. */
  failed: () => void;
}

export function showLoading(doc: Document | undefined = globalThis.document): LoadingScreen {
  if (doc === undefined) return { done: () => undefined, failed: () => undefined };
  doc.body.style.backgroundColor = BACKGROUND;
  const box = doc.createElement('div');
  box.id = LOADING_ID;
  box.setAttribute('role', 'status');
  box.style.cssText =
    `position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;` +
    `justify-content:center;gap:16px;background:${BACKGROUND};color:${TEXT};` +
    `font:600 20px system-ui,-apple-system,sans-serif;text-align:center;padding:24px;z-index:1`;
  const text = doc.createElement('div');
  text.textContent = 'Tavlaki';
  box.appendChild(text);
  doc.body.appendChild(box);
  return {
    done: () => box.remove(),
    failed: () => {
      // English and Greek: the app's language is not loaded for sure here.
      text.textContent = 'Tavlaki did not load. · Το Tavlaki δεν φόρτωσε.';
      const again = doc.createElement('button');
      again.textContent = 'Try again · Δοκίμασε ξανά';
      again.style.cssText =
        `font:600 16px system-ui,-apple-system,sans-serif;padding:12px 20px;border-radius:12px;` +
        `border:1px solid ${TEXT};background:transparent;color:${TEXT};cursor:pointer`;
      again.onclick = () => doc.defaultView?.location.reload();
      box.appendChild(again);
    },
  };
}
