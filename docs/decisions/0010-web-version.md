# ADR-0010: Web version

- **Status:** Proposed
- **Date:** 2026-11-19
- **Issue:** #637

## Context

The owner wants Tavlaki to work in the browser too (2026-11-19). Today the app is iOS and Android only: `app.json` lists `"platforms": ["ios", "android"]`.

What helps us:

- The rules, the bot and the online model are pure TypeScript (`packages/engine`, `packages/bot`, `packages/online`). They run in a browser as they are.
- Every phone feature sits behind a port and an adapter (ADR-0002). The web needs new adapters, not new screens.
- Expo builds for the web from the same code (ADR-0003). Expo Router, Reanimated, Gesture Handler, Unistyles 3 and Skia all have a web version.
- The site `tavlaki.com` is already on Cloudflare (`docs/legal/`).

What we do not know yet (phase 0 of the plan measures it):

- How fast the Skia board loads and draws in a browser. Skia on the web is CanvasKit, a WebAssembly file of a few megabytes.
- How the session is kept in a browser. The app uses Better Auth's Expo plugin and `expo-secure-store`; a browser has neither.
- Which adapters work on the web as they are (storage, sound, crash reports, analytics).

The full plan is `docs/architecture/web-app.md`.

## Options

| Option | Pros | Cons | Cost |
|--------|------|------|------|
| A. The same Expo app, built for the web too (`apps/mobile` + `react-native-web`) | One code base; every new feature reaches the web; screens, strings, themes and tests are shared | The phone layouts need work for wide windows; the Skia board must load CanvasKit; some adapters need a web twin | Size L |
| B. A second app for the web (`apps/web`, plain React, its own board on canvas or SVG) | Small download; made for the browser from the start | Every screen is built and kept twice; the board, the gestures and the animations are written again; two apps drift apart | Size XL, and more for every later feature |
| C. No web app; the site only links to the stores | No work | A friend with no iPhone cannot play; an invite link is a dead end for them | None |

## Decision

Proposed: **A**, in the phases of `docs/architecture/web-app.md`.

1. One app. The web build comes from `apps/mobile` with `react-native-web`.
2. The same ports. A feature with no browser version gets an adapter that does nothing (haptics) or a web twin (session storage). No screen checks `Platform.OS` for a vendor.
3. The board stays on Skia (ADR-0005). If phase 0 shows CanvasKit is too slow or too large, we stop and write a new ADR before any other work.
4. The server stays the same. The web is one more client of the same Convex functions, with the same sign-in rules (ADR-0008).
5. The web app is a static site on Cloudflare, next to the legal site.
6. The first public web version has no push notifications.

The owner decides the open points in "Owner decisions" of the plan before phase 1 starts. This ADR moves to **Accepted** after phase 0, with its numbers.

## Consequences

- A friend can play from an invite link with no install.
- Every new feature must work in three places: iOS, Android and the browser. CI builds the web app, and a small set of browser tests runs on each PR.
- The app gets a third way to sign in with Apple (the web flow) and a second way to keep a session.
- The privacy policy, the terms and the consent screen cover the browser.
- How we can switch later: the adapters hide every vendor, so a web twin can be replaced alone. If the Skia board fails on the web, only `features/board` needs a second renderer; the engine and the screens stay.
