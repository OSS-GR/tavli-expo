# Web version: the plan

> Status: **proposed** (owner request, 2026-11-19, #637). The decision is [ADR-0010](../decisions/0010-web-version.md). Nothing here is built yet. Each phase gets its own issues when the owner accepts the plan.

## Goal

A person opens a link in a browser and plays Tavlaki: against the bot, with a friend on one screen, and online with the same account, friends and rating as on the phone. No install.

Not a goal of the first web version: push notifications, an installed web app (PWA), a different design for desktop.

## What we know today

Facts from the code on 2026-11-19:

| Area | Today | On the web |
|------|-------|------------|
| App config | `platforms: ["ios", "android"]`; `react-dom` is installed, `react-native-web` is not | Add `web` and `react-native-web` |
| Rules, bot, online model | Pure TypeScript | Works as it is |
| Board | Skia (`features/board`) | Skia has a web version (CanvasKit, WebAssembly). **Speed and size not measured** |
| Animations, gestures, styles | Reanimated 4, Gesture Handler 3, Unistyles 3 | All have a web version. **Not tested in this app** |
| Storage | `@tavli/storage-mmkv` | `react-native-mmkv` ships web files. **Not tested** |
| Session | Better Auth Expo plugin + `expo-secure-store` | No browser version. **Needs a web twin** |
| Sign in with Apple | `expo-apple-authentication` (iPhone only). The server already knows a Services ID (`auth.ts`) | Needs Apple's web flow |
| Email code, guest | Our own routes (`keyPlugin.ts`) | Should work; the server must trust the web address |
| Server trust | `trustedOrigins: ['tavlaki://']` | Add the web address; allow browser calls from it (CORS) |
| Online games | Convex client over a web socket | Convex is made for browsers too |
| Pushes | `expo-notifications`, Expo push | None in the first web version |
| Haptics | `expo-haptics` | None. An adapter that does nothing |
| Sound | `expo-audio` | Ships web files. Browsers play no sound before the first click |
| Crash reports, analytics | Sentry, PostHog (React Native SDKs) | Both ship web files. **Not tested** |
| Update check | Build number from `expo-application` + `updatePolicy` | A web page is always the newest after a reload. Needs its own rule |
| Share | `Share.share` (6 places), `Linking.openURL` (10 places) | Web Share where the browser has it, else "Copy link" |
| Site | `tavlaki.com` on a Cloudflare Worker (`docs/legal/`) | The web app is a second static site |

## Owner decisions

Decided by the owner on 2026-11-19:

| # | Question | Decision |
|---|----------|----------|
| 1 | Where does the web app live? | `play.tavlaki.com`. Its own Worker and its own headers; the legal site and the iOS link file stay untouched |
| 2 | Phone browsers too, or desktop only? | Both. Phone browsers must work |
| 3 | Which sign-ins on the web? | The same as in the app: guest, email code and Apple, so one account works everywhere (ADR-0008) |
| 4 | What does an invite link do? | It opens the iPhone app when the app is on the phone (as today). With no app, the page `tavlaki.com/i/<code>` offers two buttons: **Get Tavlaki** and **Continue in the browser**. The friend link page (`/add/`) does the same |

Still open. Decide these before phase 3 and phase 4:

| # | Question | Recommendation | Why |
|---|----------|----------------|-----|
| 5 | Is the web app public from day one? | No: a closed test first | The link is not shown on the homepage until phase 4 ends |
| 6 | Pushes on the web? | Not in the first version | Web push is a separate system and Safari on iPhone allows it only for an installed web app. The tab title and a sound tell you it is your turn |

## Phases

No dates (see the roadmap). Sizes are S, M, L.

### Phase 0: evaluate (size S)

Find out if the plan holds, before we build. The work lives on a spike branch and is **not merged**. The result is a findings section in this file and ADR-0010 set to Accepted, or a new ADR if the answer is no.

| # | Question | How we test | Pass when |
|---|----------|-------------|-----------|
| 0.1 | Does the app start in a browser? | Add `web`, `react-native-web`, run `expo start --web` with online play off | Home shows; the list of what broke is written down |
| 0.2 | Is the Skia board fast enough? | Play a game vs the bot in Chrome, Safari and Firefox on a laptop, and in Safari and Chrome on a mid-range phone | Dragging a checker and the dice throw stay smooth (about 60 frames per second on the laptop, no visible stutter on the phone) |
| 0.3 | Is the download small enough? | `expo export --platform web`, measure the JavaScript, CanvasKit and the theme images, compressed | First load under about 5 MB compressed, and the board shows in under 5 s on a normal phone connection. The owner sets the final limit from the numbers |
| 0.4 | Do styles and themes work? | Switch app theme and board theme, change the language | Every screen repaints, like on the phone |
| 0.5 | Do gestures work with a mouse and with touch? | Drag, tap, the roll swipe, undo by dragging back | All board actions work with both |
| 0.6 | Is the bot fast enough? | Time a 2-ply hint and a bot turn in each browser | No slower than twice the phone's time. If slower: a Web Worker goes into phase 2 |
| 0.7 | How do we keep a session? | Sign in as a guest from a local web build against the dev server, with the two ways Better Auth offers (cookies, or its cross-domain plugin with web storage) | One way works in Safari too (Safari blocks cookies from another site) and passes `authProviderContract` |
| 0.8 | Which adapters work as they are? | Run storage, sound, Sentry and PostHog in the browser | A table: works, needs a twin, or off |

**Stop rule:** if 0.2 or 0.3 fails and has no fix, we do not start phase 1. We write a new ADR about the board on the web.

### Phase 1: the web build (size M)

The app runs in a browser with offline play. Not public.

- **Config:** `web` in `platforms`, `react-native-web`, the web output of Expo Router, a `web` script. `app.config.ts` stays a function of `config`.
- **Adapters with a web twin or a do-nothing twin:** haptics (nothing), storage (what 0.8 found), push notifications (nothing: `turnPushes()` is `undefined`), screen orientation, the update check (off), `expo-updates` (off).
- **How a twin is picked:** in the adapter package, with a `.web.ts` file. `services.ts` stays the one place that picks adapters (ADR-0002), and no screen checks `Platform.OS` for a vendor.
- **Board:** CanvasKit loads before the first screen, with a loading screen in the app's colors.
- **Online play:** off in this phase (`games === undefined`), so the screens show "online play is off" as they do today with no server address.
- **CI:** a new job builds the web app (`expo export --platform web`) on every PR and joins `checks`. A broken web build then blocks a merge.
- **Docs:** `docs/process/running-the-app.md` gets "Run in a browser"; CLAUDE.md gets the web rules.

Done when: a person plays a full Tavli match vs the bot and a pass-and-play game in Chrome, Safari and Firefox; the tutorial, Settings, History and the game review work; all current tests still pass.

### Phase 2: the browser feel (size M)

The app feels right with a mouse, a keyboard and a wide window.

- **Layout:** screens keep a phone-wide column in the middle of a wide window. The game screen uses the window: the wide board (`landscape-wide`) when the window is wider than tall. Resizing the window never remounts the board (the same rule as turning the phone).
- **Mouse:** pointer cursor on what you can press, a hover look on buttons and tiles, no text selection on the board.
- **Keyboard:** Tab reaches every control with a visible focus ring. Keys for the main actions: Roll, Confirm, Undo. The move list (the screen reader path) works with the keyboard alone.
- **Screen readers:** check Home, a game and the end screen with VoiceOver in Safari and NVDA in Firefox. Announcements use an ARIA live region.
- **Sheets and dialogs:** `Sheet`, `ConfirmDialog`, `ProblemDialog` trap focus, close with Escape and scroll with a large font.
- **Browser parts:** the back button and a reload keep you where you were; each route has a page title; a favicon; "reduce motion" follows the browser setting.
- **Sound:** starts after the first click (browsers block it before). No error and no missing first sound.
- **Tab in the background:** timers and the pass notice follow the tab's state (`AppState` on the web).
- **Share:** Web Share where the browser has it, else **Copy link**.
- **Bot in a Web Worker:** only if 0.6 says so.

Done when: the text scaling checks pass at 200% browser zoom, a keyboard-only game works, and the owner accepts the look on a laptop and a phone browser.

### Phase 3: online on the web (size L)

The same account, friends, invites and ranked play as on the phone.

- **Server:** add the web address to `trustedOrigins` and allow its browser calls (CORS) on the HTTP routes. Nothing else changes: no public function takes a player id, and every rule of ADR-0008 holds.
- **Session:** the way 0.7 chose. The web twin of `createSecureSessionStorage` and of the Better Auth client passes `authProviderContract` and `betterAuthClient.test.ts`.
- **Sign-in choices on the web:** guest, email code, and Apple through Apple's web flow (the Services ID the server already has). The same `SignInChoices`; the Apple button is the web twin of `@tavli/apple-sign-in-expo`. Still no account at start: only when the person opens online play.
- **Invites:** `play…/invite/<code>` opens the invite in the browser. The fallback pages `tavlaki.com/i/` and `/add/` get **Continue in the browser** next to **Get Tavlaki** (decision 4); on a computer, where there is no app, the same page shows. The friend link and its QR code stay the same.
- **Your turn without a push:** the tab title and a sound, only while the tab is open. The async-invite screens say that the browser sends no notification.
- **Play ranked, friends, leaderboards, block and report, usernames:** the same screens. Check each on the web.
- **Download my data:** saves a file in place of the share sheet. **Delete my account** and **Sign out of all phones** work the same.
- **Update needed:** a web build that is too old shows "Reload" in place of the store button. `updatePolicy` gets a `web` platform.
- **Tests:** the Convex adapters already run their contract checks in Node. Add browser tests (Playwright) for: guest sign-in, make and accept an invite in two tabs, play a turn each, resign.

Done when: a web player and an iPhone player finish a friend match and a ranked match against each other, and one account signs in on both.

### Phase 4: legal, hosting and release (size M)

- **Hosting:** a second Cloudflare Worker with static assets for the web app (decision 1). A deploy workflow like `deploy-server.yml`: the dev site on each `main` push, the public site only by hand. Never a `pull_request` trigger.
- **Headers:** a content security policy, no framing, and long caching for files with a hash in the name. The app pages are `noindex`; the homepage stays the page search engines see.
- **Server per site:** the dev site talks to the dev Convex, the public site to prod, through `convexServer()` as today.
- **Privacy and terms:** all four privacy files and all four terms files name the browser, what the browser stores (settings, the saved game, the session) and that the web sends no pushes. The consent screen is the same; with no consent the web app stores only what it needs to work.
- **Delete pages and store answers:** update `docs/legal/site/delete/`; the store forms do not change (the web app is not in a store).
- **Crash reports and analytics:** a `platform` value of `web`; source maps for the web build go to Sentry. Still no ids, names or ratings.
- **Supported browsers:** the last two versions of Chrome, Safari, Firefox and Edge, and Safari on iOS 17 or newer. An older browser gets a plain page that says so.
- **Release:** a closed test with the link shared by hand, then a **Play in the browser** button on both homepages and **Continue in the browser** on the invite pages, and a What's new entry.

Done when: the owner plays on the public address, the legal pages are live, and the browser tests run against the dev site after each deploy.

### Phase 5: later (not planned in detail)

- Web push for "your turn", where browsers allow it.
- An installed web app (PWA) with an icon and offline play vs the bot.
- A layout made for large screens (the move list and the score next to the board).

## Rules for all phases

- One issue, one PR. Every PR keeps iOS and Android as they are: the app's Jest and the phone builds must not change behavior.
- No vendor import outside the adapters. A web twin lives in the same adapter package.
- The engine, the bot and the online model do not change for the web.
- Never a rule check in a screen or an adapter.
- Every string in English and Greek.
- A feature that lands after phase 1 must work on the web too, or say why not in its issue.

## Tests

| What | Tool | When |
|------|------|------|
| Rules, bot, online model, server | Vitest (as today) | Every PR |
| Screens and flows | Jest with the native preset (as today) | Every PR |
| The web build compiles | `expo export --platform web` in CI | Every PR, from phase 1 |
| Web adapters | The port contract checks in `@tavli/contracts/testing` | Every PR |
| The real browser | Playwright: start a game vs the bot, roll, move, confirm; from phase 3 the online flows | Every PR (Chromium); all three engines before a release |
| Speed and size | The phase 0 measures, run again before the release | Phase 0 and phase 4 |

## Risks

| Risk | How likely | What we do |
|------|-----------|------------|
| CanvasKit is too large or too slow on a phone browser | Medium | Phase 0 measures it first, with a stop rule |
| Safari blocks the session (cookies from another site) | High, known | Phase 0 picks a way that works in Safari before we build on it |
| The web twin of a library lags behind its native version | Medium | Keep twins small and behind ports; the contract checks catch a break |
| Phone layouts look wrong in a wide window | Certain | Phase 2 is for this |
| Each new feature now costs more (three platforms) | Certain | CI builds the web on every PR, so a break shows at once |
| Abuse is easier from a browser (scripts, many guest accounts) | Medium | The server already checks every move and caps invites, requests and searches. Review the caps in phase 3 |

## Findings

Empty until phase 0 is done.
