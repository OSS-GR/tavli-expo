# Expo and React Native best practices for Tavli

Status: recommendation, written 2026-10-26.
Scope: how we build the Tavli mobile app with Expo, React Native and TypeScript.
Every version below was checked on 2026-10-26 against official docs or the npm registry. See [Versions verified](#versions-verified-on-2026-10-26) and [Sources](#sources).

The big ideas:

- Use **Expo SDK 58** with **development builds**, not Expo Go.
- Keep the game rules and the bot in **pure TypeScript packages** with no React Native imports.
- Put every outside service (auth, backend, push, analytics, crash reports, storage) **behind an interface**. The app only talks to the interface. This keeps things "plug and play".
- Let **EAS** build, submit and update the app. Let **GitHub Actions** run fast checks.

---

## Recommended stack

| Area | Choice | Why | Link |
| --- | --- | --- | --- |
| Framework | Expo SDK 58 (`expo@~58.0.19`) | Latest stable SDK (Oct 15, 2026). React Native team recommends Expo. | [SDK 58 notes](https://expo.dev/changelog/sdk-58) |
| Runtime | React Native 0.88.0, React 19.3.0, Hermes V1 | Pinned by SDK 58. New Architecture is always on. | [SDK versions table](https://docs.expo.dev/versions/latest/) |
| Language | TypeScript `~6.0.3`, `strict: true` | Version that the SDK 58 template ships. | [TypeScript guide](https://docs.expo.dev/guides/typescript/) |
| React Compiler | On (`experiments.reactCompiler: true`) | On by default in the SDK 58 template. Removes most manual `useMemo`/`useCallback`. | [React Compiler guide](https://docs.expo.dev/guides/react-compiler/) |
| Native code | Continuous Native Generation (CNG) + config plugins | No `ios/` or `android/` folders in git. Upgrades are easy. | [CNG](https://docs.expo.dev/workflow/continuous-native-generation/) |
| Dev client | `expo-dev-client` development builds | Expo Go cannot load our native libraries. SDK 58 Expo Go is not in stores yet. | [Dev builds](https://docs.expo.dev/develop/development-builds/introduction/) |
| Repo layout | pnpm workspaces monorepo (`apps/*`, `packages/*`) | Expo configures Metro for monorepos automatically. pnpm isolated installs are supported since SDK 54. | [Monorepo guide](https://docs.expo.dev/guides/monorepos/) |
| Navigation | Expo Router `~58.0.26` with typed routes | File-based routes, deep links for free, protected routes for auth. | [Expo Router](https://docs.expo.dev/router/introduction/) |
| Invite links | Universal Links (iOS) + App Links (Android) + custom scheme | One `https://` invite link that opens the app or a web fallback. | [iOS](https://docs.expo.dev/linking/ios-universal-links/), [Android](https://docs.expo.dev/linking/android-app-links/) |
| Animation | `react-native-reanimated` 4.7.1 + `react-native-worklets` 0.13.0 | Runs animations on the UI thread. Needs the New Architecture. | [Reanimated](https://docs.swmansion.com/react-native-reanimated/) |
| Gestures | `react-native-gesture-handler` ~3.3.0 (hook API) | Native drag tracking. v3 adds `usePanGesture` and friends. | [Upgrading to GH 3](https://docs.swmansion.com/react-native-gesture-handler/docs/guides/upgrading-to-3/) |
| Board drawing | `@shopify/react-native-skia` 2.14.0 | GPU 2D canvas. Takes Reanimated shared values as props. | [Skia](https://shopify.github.io/react-native-skia/) |
| 3D (optional, later) | `@react-three/fiber` 9 + `expo-gl` | Only for 3D dice, and only if 2D is not enough. | [expo-gl](https://docs.expo.dev/versions/latest/sdk/gl-view/) |
| Game flow state | XState 5 (`xstate@5.33.3`) | Turns, phases and match rules are a state machine. Easy to test without UI. | [XState](https://stately.ai/docs/xstate) |
| App/UI state | Zustand 5 (`zustand@5.0.16`) | Small, simple, works outside React. | [Zustand](https://zustand.docs.pmnd.rs/) |
| Server state | TanStack Query 5 (`@tanstack/react-query@5.104.5`) | Caching, retries, refetch for profiles, friends, match lists. | [TanStack Query](https://tanstack.com/query/latest) |
| Local storage | `react-native-mmkv` 4 behind a `KeyValueStore` interface | Fast sync storage. Works with Zustand `persist`. | [MMKV](https://github.com/mrousavy/react-native-mmkv) |
| Secrets on device | `expo-secure-store` ~58.0.2 | Keychain / Keystore for tokens. | [SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/) |
| Styling | Unistyles 3 (`react-native-unistyles@3.6.0`) | `StyleSheet` superset, themes, no re-renders. Low lock-in. | [Unistyles](https://www.unistyl.es/) |
| Lint / format | ESLint flat config + `eslint-config-expo` + Prettier | Official Expo setup. Includes React Compiler rules. | [ESLint guide](https://docs.expo.dev/guides/using-eslint/) |
| Unit tests (app) | Jest + `jest-expo` ~58.0.12 + React Native Testing Library 14 | Official Expo preset mocks native modules. | [Unit testing](https://docs.expo.dev/develop/unit-testing/) |
| Unit tests (pure TS) | Vitest 5 | Fast. No React Native needed for engine and bot. | [Vitest](https://vitest.dev/) |
| E2E tests | Maestro (local + EAS Workflows) | YAML flows. Official EAS Workflows support. | [E2E on EAS](https://docs.expo.dev/eas/workflows/examples/e2e-tests/) |
| CI | GitHub Actions (checks) + EAS Workflows (builds, updates, submit) | Cheap fast checks on GitHub. Native work on EAS. | [EAS Workflows](https://docs.expo.dev/eas/workflows/get-started/) |
| Releases | EAS Build + EAS Submit + EAS Update (channels) | One toolchain for both stores and OTA fixes. | [EAS Update deploy](https://docs.expo.dev/eas-update/deployment/) |
| Crash reports | Sentry (`@sentry/react-native` ~8.28.0, SDK 58 pin) | Mature. Source maps for EAS Build and EAS Update. | [Using Sentry](https://docs.expo.dev/guides/using-sentry/) |
| Analytics | PostHog (`posthog-react-native`) | One-command EAS setup since SDK 58. Free tier. EU hosting option. | [Using PostHog](https://docs.expo.dev/guides/using-posthog/) |
| Perf monitoring | EAS Observe (`expo-observe`) | Startup and screen timing per release. 100K events/month free. | [EAS Observe](https://docs.expo.dev/eas/observe/introduction/) |
| Push | `expo-notifications` ~58.1.6 + Expo Push Service, behind `PushService` | No FCM/APNs server code to start. Can swap later. | [Push overview](https://docs.expo.dev/push-notifications/overview/) |
| Sound | `expo-audio` ~58.0.10 | `expo-av` is deprecated and gone from the SDK docs. | [expo-audio](https://docs.expo.dev/versions/latest/sdk/audio/) |
| Haptics | `expo-haptics` ~58.0.7 | Simple, cross-platform. | [expo-haptics](https://docs.expo.dev/versions/latest/sdk/haptics/) |
| i18n | `expo-localization` + `i18next` + `react-i18next` | Greek + English. Biggest ecosystem. Plural rules via `Intl`. | [Localization guide](https://docs.expo.dev/guides/localization/) |
| Sign in with Apple | `expo-apple-authentication` ~58.0.2 | Covers App Store guideline 4.8 if we add Google login. | [Apple auth](https://docs.expo.dev/versions/latest/sdk/apple-authentication/) |
| AI agent tooling | Expo MCP Server + Expo Skills + `AGENTS.md` | Agents read the right SDK docs and drive EAS. | [Expo for agents](https://docs.expo.dev/agents/) |
| Node / package manager | Node 24 LTS, pnpm (pinned in `packageManager`) | SDK 58 needs Node 22.13+, 24.3+ or 26+. No odd versions. | [SDK 58 tool bumps](https://expo.dev/changelog/sdk-58) |

---

## 1. Platform versions

Facts (verified 2026-10-26):

- **Expo SDK 58** is the latest stable SDK. It shipped on **October 15, 2026**.
- SDK 58 uses **React Native 0.88**, **React 19.3.0**, React Native Web 0.21.
- React Native **0.88.0** is also the latest stable on npm (published 2026-10-15). The reactnative.dev versions page still lists 0.87 as "latest". It lags behind npm.
- **New Architecture:** SDK 55 and later run only on the New Architecture. It cannot be turned off. React Native 0.82 was the first version with no legacy mode.
- **Hermes V1** is the default JS engine since SDK 56.
- **React Compiler:** Babel is set up automatically since SDK 54. The SDK 58 default template turns it on with `experiments.reactCompiler: true`. The lint rules ship in `eslint-config-expo` since SDK 55. `babel-plugin-react-compiler` is at 1.0.0 (stable).
- **TypeScript:** the SDK 58 template pins `typescript ~6.0.3`. TypeScript 7.0.2 (the native Go compiler) is on npm, but Expo does not ship it yet.
- **Strict TypeScript API** is the default in React Native 0.87+. Deep imports from `react-native/Libraries/*` are type errors.
- **OS minimums for SDK 58:** Android 7+, `compileSdkVersion` 37, `targetSdkVersion` 36. iOS 16.4+, Xcode 26.4+.
- **Node:** 22.13+ (22 line), 24.3+ (24 line) or 26+. Odd versions (23, 25) are not supported.
- **SDK life:** each SDK gets about one year of support. Expo is exploring more frequent, smaller SDK releases (SDK 56 in May, SDK 57 in June, SDK 58 in October 2026).

Rules:

- **Do** start on SDK 58. Do not start a new project on an older SDK.
- **Do** create the app with `npx create-expo-app@latest --template default@sdk-58`. Until the new Expo Go ships, plain `create-expo-app` still makes SDK 57 projects.
- **Do** keep `experiments.reactCompiler: true`. Write code that follows the [Rules of React](https://react.dev/reference/rules).
- **Do** use `npx expo install <pkg>` for every package that has native code. It picks the version that matches the SDK.
- **Do** run `npx expo-doctor@latest` in CI. It checks versions and the React Native Directory for New Architecture support.
- **Do** upgrade the SDK with `npx expo install expo@^<next>.0.0 --fix`, then read the "breaking changes" part of the release notes. The `expo-upgrade` agent skill helps.
- **Do not** add a library that does not support the New Architecture. Check [reactnative.directory](https://reactnative.directory/) first.
- **Do not** deep import from `react-native/Libraries/*`.
- **Do not** bump TypeScript, React or React Native by hand. Let the SDK pick them.

---

## 2. Project structure (monorepo)

Expo supports Bun, npm, pnpm and Yarn workspaces. Since SDK 52, `expo/metro-config` finds monorepo packages by itself. Since SDK 54, isolated installs (pnpm default) work. Since SDK 55, autolinking module resolution is on for monorepos, so Metro and native builds agree on one copy of each native module.

Suggested layout:

```text
tavli/
├─ apps/
│  └─ mobile/              # Expo app (Expo Router, UI, adapters)
│     ├─ src/app/          # routes only (thin files)
│     ├─ src/features/     # game screen, lobby, friends, settings
│     ├─ src/adapters/     # real implementations of service interfaces
│     ├─ app.config.ts
│     └─ eas.json
├─ packages/
│  ├─ game-engine/         # pure TS: rules for Portes, Plakoto, Fevga, Asodio
│  ├─ bot/                 # pure TS: AI player, depends on game-engine only
│  ├─ contracts/           # pure TS: service interfaces + shared types + zod schemas
│  ├─ ui/                  # React Native design system (tokens, buttons, board parts)
│  ├─ backend/             # server code (match server, invites, push sender)
│  └─ config/              # shared tsconfig, eslint, prettier, vitest presets
├─ .eas/workflows/         # EAS Workflows YAML
├─ .github/workflows/      # GitHub Actions
├─ .maestro/               # E2E flows
├─ pnpm-workspace.yaml
├─ package.json            # root scripts, packageManager, devDeps only
└─ AGENTS.md
```

Rules:

- **Do** keep `game-engine`, `bot` and `contracts` free of `react`, `react-native` and `expo` imports. Enforce this with an ESLint `no-restricted-imports` rule. Then they run in Node, in tests, on the server and in the app.
- **Do** make the engine deterministic. Pass the random number source in (seeded RNG). The same seed must give the same game. This helps replays, tests and server checks.
- **Do** define every outside service as an interface in `packages/contracts`, for example `AuthService`, `MatchTransport`, `PushService`, `Analytics`, `CrashReporter`, `KeyValueStore`, `SoundPlayer`, `Haptics`. Put real versions in `apps/mobile/src/adapters`. Pass them in through one React context or a small service registry.
- **Do** use `"workspace:*"` for internal dependencies.
- **Do** put shared dev tools (TypeScript, ESLint, Prettier, Vitest) in the root `package.json`.
- **Do** pin the package manager with the `packageManager` field (for example `"packageManager": "pnpm@<version>"`). Use Corepack.
- **Do** check for duplicates with `pnpm why --depth=10 react-native`. Two copies of React or React Native in one app break it.
- **Do** start with pnpm isolated installs. If a library breaks, set `nodeLinker: hoisted` in `pnpm-workspace.yaml`. That is Expo's documented fallback.
- **Do not** add `watchFolders`, `resolver.nodeModulesPath`, `extraNodeModules` or `disableHierarchicalLookup` to `metro.config.js`. Expo does this now. Old settings cause bugs.
- **Do not** add Turborepo or Nx on day one. Plain pnpm scripts are enough for one app. Add Turborepo later if CI gets slow.
- **Do not** let `packages/ui` import from `apps/mobile`. Dependencies flow one way: app → ui → contracts.

---

## 3. Navigation and deep links (Expo Router)

Expo Router is Expo's default and recommended router. Since SDK 56 it no longer depends on React Navigation. In SDK 58, native tabs, toolbars, data loaders and the custom navigator API are stable. The navigation core was rewritten to make state deterministic.

Rules:

- **Do** keep route files in `src/app/` small. A route file imports a screen from `src/features/` and renders it.
- **Do** keep `experiments.typedRoutes: true` (on in the template). Use typed `href` objects for dynamic routes, like `{ pathname: '/match/[id]', params: { id } }`.
- **Do** use `Stack.Protected` ([protected routes](https://docs.expo.dev/router/advanced/protected/)) to guard screens that need login.
- **Do** use one invite URL shape, for example `https://tavli.app/invite/<code>`. Map it to `src/app/invite/[code].tsx`.
- **Do** set up both **iOS Universal Links** (`apple-app-site-association` file plus `ios.associatedDomains`) and **Android App Links** (`android.intentFilters` with `autoVerify: true` plus `assetlinks.json`). Host both files under `/.well-known/` on our domain.
- **Do** set a custom `scheme` (for example `tavli://`) too. Dev builds and some flows need it.
- **Do** use [`+native-intent`](https://docs.expo.dev/router/advanced/native-intent/) to rewrite odd incoming links (old formats, third-party links) before routing.
- **Do** treat every link param as untrusted input. Validate invite codes with zod and check them on the server.
- **Do** make the invite page on the web useful when the app is not installed: show store buttons.
- **Do not** mix `@react-navigation/*` imports with Expo Router. `expo-doctor` warns about this since SDK 56.
- **Do not** put game state in route params. Pass an id. Load the state from the store or server.

Note: links that start with `__expo_` are now reserved for the dev launcher (SDK 58). Do not use that prefix in our own params.

---

## 4. Rendering and animation for the board

The board is the heart of the app. It must feel smooth at 60–120 fps while the player drags checkers and dice roll.

Building blocks (all from Software Mansion or Shopify, all in the SDK 58 bundled list):

- **Reanimated 4** (4.7.1): runs animation code on the UI thread. Needs the New Architecture. Needs `react-native-worklets`. Supports CSS-style animations and transitions too.
- **Worklets** (0.13.0): the threading layer. Use `scheduleOnRN` to call JS from the UI thread. `runOnUI` is deprecated in favor of `scheduleOnUI`.
- **Gesture Handler 3** (~3.3.0): new hook API (`usePanGesture`, `useTapGesture`, `useExclusiveGestures`, `useSimultaneousGestures`). `onStart`/`onEnd` are now `onActivate`/`onDeactivate`. v3 needs RN 0.82+ and the New Architecture.
- **React Native Skia** (`@shopify/react-native-skia` 2.14.0): a GPU 2D canvas. It accepts Reanimated shared values as props, so a checker can move with no React re-render.

Recommended approach:

1. Draw the static board (frame, 24 points, bar, home areas) in one Skia `<Canvas>`.
2. Draw checkers as Skia shapes or images. Their positions are Reanimated shared values.
3. Wrap the canvas in one `GestureDetector` with a `usePanGesture`. Do hit-testing in a worklet: find the checker under the finger, move its shared value with the finger, find the nearest legal point on release.
4. Ask the game engine for legal moves **once** when the turn starts. Keep them in a shared value so the worklet can check drops without crossing to JS.
5. On drop, snap with `withSpring`/`withTiming`, then `scheduleOnRN` to send the move to the game state machine.
6. Dice: start with 2D. Use Skia or Reanimated sprite/rotation animations. Put dice behind a `DiceView` component so a 3D version can replace it later.

Rules:

- **Do** keep per-frame work on the UI thread. Use `useSharedValue`, `useDerivedValue`, `useAnimatedStyle`.
- **Do** keep React state changes for real game events only (move made, turn ended). Never per frame.
- **Do** compute board geometry (point x/y, checker size) once per layout. Use `onLayout` or `useWindowDimensions`. Support phones, tablets and the iPhone Duo / foldable size changes in SDK 58.
- **Do** respect "Reduce Motion". Reanimated has `useReducedMotion()`. Shorten or skip animations when it is on.
- **Do** test animation smoothness on a real low-end Android phone with a release build. Dev builds are slower.
- **Do** use the Perf Monitor and React Native DevTools to find dropped frames.
- **Do not** use React Native `Animated` or `LayoutAnimation` for the board.
- **Do not** use one `View` per checker with `PanResponder`. It runs on the JS thread and stutters.
- **Do not** mix Gesture Handler hook gestures and old builder gestures (`Gesture.Pan()`) in one detector. Use hooks for new code.
- **Do not** add 3D (`@react-three/fiber` + `expo-gl`) for v1. It adds bundle size, memory use and battery drain. Consider it only for a "3D dice" feature, isolated in one component.

Watch list: Skia v3 now ships as a new npm package, `react-native-skia` (3.8.0), with the Graphite GPU backend and WebGPU/three.js interop. Expo SDK 58 still bundles `@shopify/react-native-skia` 2.x. Stay on the Expo-pinned 2.x until Expo bundles v3.

---

## 5. State management

Three kinds of state. Use one tool for each.

| Kind | Tool | Example |
| --- | --- | --- |
| Game flow | XState 5 machine (in `game-engine` or a thin layer in the app) | `rolling → moving → confirming → opponentTurn → gameOver` |
| App and UI state | Zustand 5 store(s) | settings, sound on/off, selected theme, current match id |
| Server state | TanStack Query 5 | profile, friends list, match history, invites |
| Real-time match | `MatchTransport` interface (WebSocket or backend SDK) feeding the XState machine | opponent moves, dice from server |
| Animation state | Reanimated shared values | checker x/y while dragging |

Rules:

- **Do** keep the rules (legal moves, scoring, win check) as pure functions in `game-engine`. The XState machine calls them. The UI never re-implements rules.
- **Do** make online play **server-authoritative**. The server rolls the dice and checks every move with the same `game-engine` package. The client shows the result.
- **Do** use the same machine for pass-and-play, vs-bot and online. Only the "opponent" adapter changes: `LocalPlayer`, `BotPlayer`, `RemotePlayer`.
- **Do** run the bot off the UI thread if it gets slow. Options: a worklet runtime from `react-native-worklets`, or chunking work with `requestIdleCallback`. Keep the bot API async (`chooseMove(state): Promise<Move>`) from day one so this change is easy.
- **Do** persist only small things with Zustand `persist` + the `KeyValueStore` adapter (MMKV).
- **Do** save an in-progress local game as a list of moves plus the seed. Rebuild the board from that.
- **Do not** put server data in Zustand. TanStack Query owns it.
- **Do not** use Redux, MobX or Context-as-a-store for this app. They add code without benefit here.
- Forms: we need very few. Use plain controlled inputs plus zod. Add `@tanstack/react-form` only if forms grow.

---

## 6. Styling

Options checked on 2026-10-26:

| Option | Status | Notes |
| --- | --- | --- |
| `StyleSheet` (built-in) | Stable | Zero deps. No themes. |
| Unistyles 3 (3.6.0) | Stable | Superset of `StyleSheet`. C++ core with Nitro Modules. Themes, breakpoints, variants. No re-renders on theme change. Needs a dev build. |
| NativeWind | v4.2.7 stable, **v5 still RC** (`5.0.0-rc.0`) | Tailwind classes. v5 moves to Tailwind 4 and `react-native-css`. A big migration is coming. |
| Uniwind (1.13.0) | Stable | Tailwind 4 for React Native, from the Unistyles team. Claims 2× faster than NativeWind. Obytes starter uses it now. |
| Tamagui | Stable | Full UI kit + compiler. Heavy for a game. |

Recommendation: **Unistyles 3** with design tokens in `packages/ui`.

Why:

- The board is drawn in Skia, so we need styling only for menus, lobby and settings.
- Unistyles looks like `StyleSheet`. Moving away later is cheap. This fits "plug and play".
- Light/dark themes and tablet breakpoints are built in. Theme changes do not re-render the tree.
- No Tailwind version churn (NativeWind v4 → v5).

Rules:

- **Do** define colors, spacing, radii, fonts and z-index as tokens in `packages/ui/theme`. Never hard-code a hex color in a screen.
- **Do** ship light and dark themes. Respect the system setting (`userInterfaceStyle: "automatic"`).
- **Do** give Skia drawing code the same tokens (pass the theme to the board).
- **Do not** mix two styling systems in one app.
- If the owner prefers Tailwind class names (many AI agents write them well), pick **Uniwind** instead. Do not start on NativeWind v4 now, because v5 is close.

---

## 7. Tooling

### TypeScript

- **Do** use `strict: true` (template default). Also turn on `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` in `packages/game-engine` and `packages/bot`. Board arrays are index-heavy; these flags catch bugs.
- **Do** extend `expo/tsconfig.base` in the app. Use one shared base config from `packages/config` for pure TS packages.
- **Do** run `tsc --noEmit` for every package in CI. For typed routes in CI, run `npx expo customize tsconfig.json` first (Expo docs).
- **Do not** use `any`. Use `unknown` and narrow it.

### Lint and format

- **Do** use ESLint flat config (`eslint.config.js`) with `eslint-config-expo/flat`. Set it up with `npx expo lint`. It includes React Compiler rules since SDK 55.
- **Do** add Prettier with `eslint-config-prettier` (Expo guide). Prettier formats; ESLint finds bugs.
- **Do** add `no-restricted-imports` rules to keep pure packages pure.
- **Do not** add Biome as well. One linter, one formatter. Biome (2.6.3) is fast, but it lacks the Expo and React Compiler rules. We could revisit Biome or Oxlint later for pure TS packages only.

### Tests

- **Game engine and bot:** Vitest 5. Aim for very high coverage. Add property-based tests (for example `fast-check`) for "every legal move keeps 15 checkers per side".
- **App components:** Jest + `jest-expo` preset + React Native Testing Library 14. Use the pnpm `transformIgnorePatterns` from the Expo guide.
- **E2E:** Maestro flows in `.maestro/`. Run them locally on a simulator and on EAS Workflows (`type: maestro` job).
- **Do** test every rule variant (Portes, Plakoto, Fevga, Asodio) with fixed seeds and known positions.
- **Do** add `testID` props to key UI (board, dice, roll button) for Maestro.
- **Do not** snapshot-test whole screens. Snapshots break often and catch little.

### CI and automation

- **GitHub Actions** on every pull request: install, `tsc`, ESLint, Prettier check, Vitest, Jest, `expo-doctor`. These are fast and free on public/low-usage plans.
- **EAS Workflows** (`.eas/workflows/*.yml`) for native work: dev builds, preview builds on PR label, Maestro tests, production build + submit, and OTA updates. The `deploy` template uses a **fingerprint** job: it builds when native code changed, and publishes an update when it did not.
- **Do** link the GitHub repo to EAS so `on.push` and `on.pull_request` triggers work.
- **Do** use Conventional Commits (`feat:`, `fix:`, `chore:` …). Enforce with `commitlint` (21.x) and a git hook (`lefthook` or `husky`).
- **Do** use **Renovate** for dependency PRs. Group updates. **Exclude** packages that the Expo SDK pins (`expo`, `expo-*`, `react`, `react-native`, `react-native-reanimated`, `react-native-gesture-handler`, `react-native-worklets`, `@shopify/react-native-skia`, `typescript`, `jest-expo`). Update those only through an SDK upgrade with `npx expo install --fix`.
- **Do** add an `AGENTS.md` at the root (create-expo-app writes one) and keep project rules there.

---

## 8. Builds and releases

### EAS Build profiles

Our real file is [`apps/mobile/eas.json`](../../apps/mobile/eas.json) (#39). It follows the Expo default three profiles plus an iOS simulator profile. Until v1.0 we have **no paid Apple or Google account**, so every profile except iOS `development` and `production` works with only the Expo account:

| Profile | Android | iOS | Channel |
| --- | --- | --- | --- |
| `development` | Dev client APK | Dev client, ad hoc (needs paid Apple account) | `development` |
| `development-simulator` | (same as `development`) | Dev client for the simulator | `development` |
| `preview` | Release **APK** for direct install | Release build for the **simulator** | `preview` |
| `production` | Store AAB, `autoIncrement` | App Store build, `autoIncrement` | `production` |

`cli.version` is pinned to `>= 25.0.0` and `cli.appVersionSource` is `remote`. A `base` profile pins pnpm 12. There is no `projectId` in the repo yet: the owner links it once with `eas init` (see [Running the app](../process/running-the-app.md), part 4).

Rules:

- **Do** use **app variants** so dev, preview and production can be installed side by side ([app variants](https://docs.expo.dev/build-reference/variants/)). Done in `apps/mobile/app.config.ts`: `APP_VARIANT` picks `com.tavlaki.dev`, `com.tavlaki.preview` or `com.tavlaki`. The default is `development`, so a local build signed with a free Apple ID never reserves `com.tavlaki` (a bundle id used by a free Personal Team can block the paid team later).
- **Do** keep `app.json` as the base config and make `app.config.ts` a function of `config`. Then `eas init` and `eas update:configure` can still write to `app.json`.
- **Do** use the `remote` version source with `autoIncrement` on production. EAS then manages `buildNumber` and `versionCode`. Duplicate build numbers are a common store rejection. Do not put build numbers in `app.json`.
- **Do** set the user-facing `version` (for example `1.2.0`) by hand for each store release.
- **Do** let EAS manage signing credentials (`eas credentials`).
- **Do not** commit `ios/` or `android/`. We use **CNG** (Continuous Native Generation); `apps/mobile/.gitignore` ignores both. SDK 57+ `expo prebuild` cleans and regenerates them by default.
- **Do** write a config plugin for any native change instead of editing native files. This includes the future iMessage extension.

### EAS Update (OTA)

`expo-updates` is installed, but **no update is published yet**. `updates.url` is added by `eas update:configure` when the owner links the project.

- **Do** use the simple flow from Expo docs: one **channel** per build profile: `development`, `preview`, `production`. Ignore branches.
- **Do** use `runtimeVersion: { policy: "fingerprint" }` (set in `app.json`). The hash covers all native code, so an update never reaches a build that lacks a native module. Expo's SDK 58 docs no longer call it experimental (checked 2026-10-26). The cost: any native change needs a new build before updates reach it.
- **Do** roll out production updates in steps: `eas update --channel production --rollout-percentage 10`, then raise it.
- **Do** test an update on `preview` first, then promote with `eas update:republish --destination-channel production`. **Not yet possible:** the fingerprint includes the app name and app id, so each variant has its own runtime version, and a preview update does not reach production builds. Fix this (for example, skip names and ids in a `fingerprint.config.js`) before the first OTA update.
- **Do not** ship native changes or new permissions in an OTA update. Those need a store build.
- **Do not** use OTA to change the app's main purpose. Both stores forbid it.

### EAS Submit

- **Do** submit with `eas submit` (or the `submit` / `testflight` workflow jobs).
- Use TestFlight for iOS testers. Use Play "internal testing" first, then "closed testing".

### Store rules that affect Tavli

- **Apple, build SDK:** since April 28, 2026, uploads must be built with **Xcode 26+ and the iOS 26 SDK**. SDK 58 needs Xcode 26.4+, so we are fine. SDK 58 is already ready for the iOS 27 scene-based life cycle.
- **Apple, login (4.8):** if we offer Google (or another third-party) login for the main account, we **must** also offer an equal private option. Sign in with Apple meets it. Email/password of our own does not trigger 4.8.
- **Apple, accounts (5.1.1(v)):** if users can create accounts, they must be able to **delete the account inside the app**. Also: let people play offline (bot, pass-and-play) **without login**. Only online play needs an account.
- **Apple, privacy manifest:** we must declare "required reason" APIs. Set `ios.privacyManifests` in app config. Expo libraries ship their own manifests. Check third-party SDKs (Sentry, PostHog) too.
- **Apple, age rating:** answer the new age rating questions in App Store Connect (required since Jan 31, 2026).
- **Apple, EU:** we need DSA trader status to stay in the EU App Store. Greece is in the EU.
- **Google, target SDK:** since **August 31, 2026**, new apps and updates must target **Android 16 (API 36)**. SDK 58 targets 36. Good.
- **Google, new personal accounts:** must run a **closed test with at least 12 testers for 14 days** before production access. Plan this early.
- **Gambling:** Tavli has dice but no real money. Do not add real-money betting or paid random rewards without legal review (App Store guideline 5.3).

### Costs (checked 2026-10-26)

| Item | Cost | Notes |
| --- | --- | --- |
| Apple Developer Program | **99 USD / year** | Local currency where available. |
| Google Play developer account | **25 USD one time** | |
| EAS Free | 0 USD | Up to 15 Android + 15 iOS builds per month, low-priority queue, 45-min build timeout, 1 macOS concurrency, 1,000 update MAUs, 60 Workflows minutes, 100K Observe events. Limits reset monthly. No overage. |
| EAS Starter | 19 USD / month + usage | 45 USD build credit, high-priority queue, 2-hour timeout, 3,000 update MAUs. |
| EAS Production | 199 USD / month + usage | 225 USD build credit, 50,000 update MAUs, more concurrency. |
| Sentry | Free tier | 5,000 errors per month (per Expo's Sentry guide). |
| PostHog | Free tier | Generous free events per month. |

Advice: start on **EAS Free**. Build dev clients rarely (only when native deps change). Use OTA updates for JS changes. Move to **Starter** when the free queue is too slow or near launch.

---

## 9. Observability

- **Do** use **Sentry** for JS errors and native crashes. Run `npx @sentry/wizard@latest -i reactNative`. Upload source maps for both EAS Build and EAS Update (Expo guide covers both). Link Sentry to the EAS dashboard.
- **Do** use **PostHog** for product analytics. Set it up with `eas integrations:posthog:connect` (new in SDK 58). Events then carry `eas/update_id`, `eas/channel` and `eas/runtime_version`.
- **Do** consider **EAS Observe** (`expo-observe`) for startup and screen performance per release. It is free up to 100K events per month. Since SDK 58 it also records JS errors and native crashes. If we want one vendor fewer, Observe could replace Sentry later.
- **Do** hide all of this behind `CrashReporter` and `Analytics` interfaces. A no-op adapter (`createNoopAnalytics`) is used when there is no PostHog key, and a recording one in tests. Event plan: [analytics-events.md](analytics-events.md).
- **Do** define a small event list (for example `match_started`, `match_finished`, `invite_sent`, `invite_opened`, `bot_level_chosen`). Use snake_case names.
- **Do** ask for consent before analytics where the law needs it (GDPR, we are in the EU). Offer an opt-out in settings.
- **Do not** send personal data (email, names) in analytics events or error messages.
- **Do not** log full game states in production. Log the match id and move number instead.

---

## 10. Haptics, sound, i18n and accessibility

### Haptics

- **Do** use `expo-haptics`: light impact when picking up a checker, selection tick when hovering a legal point, success on bearing off, warning on illegal drop.
- **Do** put haptics behind a `Haptics` interface with an on/off setting.
- **Do not** fire haptics every frame during a drag. Fire on state changes only.

### Sound

- **Do** use `expo-audio`. Preload short sounds (dice, checker click, win) once at start.
- **Do** keep sounds short and small (AAC/M4A or WAV for tiny clips).
- **Do** respect the silent switch and a mute setting.
- **Do not** use `expo-av`. It is deprecated and no longer gets patches.
- If we ever need low-latency mixing or effects, Expo points to [React Native Audio API](https://docs.swmansion.com/react-native-audio-api/).

### i18n (Greek + English)

- **Do** use `expo-localization` to read the device language (`getLocales()`), and `i18next` + `react-i18next` for strings.
- **Do** keep translations as JSON in `apps/mobile/src/i18n/{el,en}.json`. Use keys like `game.roll_dice`.
- **Do** use i18next plural forms. Greek has `one` and `other` forms, like English, but word forms change. Do not build sentences by joining strings.
- **Do** support per-app language on iOS and Android (Expo docs: newer OSes let users pick an app language in system settings). Also offer an in-app switch.
- **Do** keep game names as proper nouns: Πόρτες (Portes), Πλακωτό (Plakoto), Φεύγα (Fevga), Ασόδιο (Asodio).
- **Do** test long Greek strings. Greek words are often longer than English ones. Allow text to wrap.
- **Do** format numbers and dates with `Intl` (Hermes supports it).
- Lingui (6.x) is a fine smaller alternative with compile-time extraction. Pick one and keep it.

### Accessibility

- **Do** give every button an `accessibilityLabel` and `accessibilityRole`.
- **Do** make the board usable without dragging: tap a checker, then tap a target point. This also helps players with motor issues, and it makes Maestro tests easier.
- **Do** announce dice results and moves with `AccessibilityInfo.announceForAccessibility`.
- **Do** support Dynamic Type / font scale in menus. Keep the board size based on layout, not font size.
- **Do** make sure checker colors differ by more than color. Add a ring or pattern for color-blind players. Check contrast in both themes.
- **Do** respect "Reduce Motion" (see section 4).

---

## 11. Security

- **Do** store auth tokens in `expo-secure-store` (Keychain / Keystore). In SDK 58 Android can also require user confirmation for reads/writes.
- **Do** keep only **public** config in `EXPO_PUBLIC_*` env vars (API URL, Sentry DSN, PostHog key). Expo inlines them into the bundle as plain text.
- **Do not** put private keys, server secrets, service-account JSON or database passwords in the app, in `EXPO_PUBLIC_*` vars, or in git.
- **Do** keep build-time secrets in **EAS environment variables** (`eas env:*`) with "secret" visibility. Pull them locally with `eas env:pull`.
- **Do** read env vars as `process.env.EXPO_PUBLIC_X` only. Destructuring or `process.env['X']` is not inlined.
- **Do** note the SDK 58 change: Expo CLI forces `NODE_ENV` to `development` or `production`. Only `.env`, `.env.local`, `.env.development(.local)` and `.env.production(.local)` load. `.env.staging` no longer loads. Use EAS environments for staging.
- **Do** add `.env*.local` to `.gitignore`.
- **Do** validate everything on the server: moves, dice, invite codes, friend requests. Never trust the client.
- **Do** use HTTPS/WSS only. Use short-lived access tokens with refresh tokens.
- **Do** keep `android.allowBackup` off for sensitive data, or exclude the token store.
- **Do** run a secret scanner (GitHub secret scanning or `gitleaks`) in CI.
- **Do not** log tokens, even in dev builds.

---

## 12. Working with AI agents

Expo now has first-party agent support. Use it.

- **Do** connect the **Expo MCP Server** (`https://mcp.expo.dev/mcp`, OAuth). Agents can search current Expo docs, install SDK-matching packages, read EAS build logs, run workflows and read TestFlight crashes.
- **Do** install **Expo Skills**. In Claude Code: `claude plugin install expo@claude-plugins-official`. Skills include `expo-upgrade` and `eas-observe`.
- **Do** keep `AGENTS.md` (written by create-expo-app) as the single source of project rules for all agents.
- **Do** try `@expo/agent-cli` (experimental, SDK 58). It tells an agent if Expo Go works, starts the app, and takes smoke-test screenshots.
- **Do** add the `expo-mcp` dev dependency later if we want agents to tap and screenshot the running app.
- **Do not** let agents run `npm install` for native packages. They must use `npx expo install`.

---

## Later: iMessage extension

- An iMessage app is a separate native iOS target. With CNG it must be added by a **config plugin**.
- `@bacons/apple-targets` (5.0.0) adds many iOS targets (widgets, App Clips, share extensions), but its iMessage type is **not listed as supported** yet. Expect to write our own config plugin, or contribute to that one.
- iMessage extensions have tight memory limits. A small SwiftUI extension that shows a game card and opens the main app with a Universal Link is the safest first step.
- Keep the invite link format stable now, so the extension can reuse it later.

---

## Decisions for the owner

1. **Package manager:** pnpm (recommended) or Bun. Both are supported by Expo.
2. **Styling:** Unistyles 3 (recommended) or Uniwind (if you prefer Tailwind classes).
3. **Crash reporting:** Sentry now (recommended), or try EAS Observe alone to save one vendor.
4. **Analytics vendor and region:** PostHog EU cloud (recommended for GDPR) or none at first.
5. **Login options:** email/magic link only, or also Google + Apple. Adding Google means Sign in with Apple is required too.
6. **Backend:** not covered here. It must sit behind `AuthService` and `MatchTransport` interfaces either way.
7. **EAS plan:** stay on Free until launch, then Starter (19 USD/month)?
8. **Google Play account type:** a personal account needs the 12-tester / 14-day closed test. An organization account needs a D-U-N-S number but skips that test.
9. **Domain for invite links** (for example `tavli.app`). Needed early for Universal Links and App Links.

---

## Versions verified on 2026-10-26

Expo SDK 58 pins (from `expo@58` `bundledNativeModules.json` and the `default@sdk-58` template):

- `expo` 58.0.19 (latest on npm); SDK 58 released 2026-10-15
- `react-native` 0.88.0 (npm latest, published 2026-10-15)
- `react` 19.3.0, `react-dom` 19.3.0, `react-native-web` ~0.21.4
- `expo-router` ~58.0.26
- `react-native-reanimated` 4.7.1
- `react-native-worklets` 0.13.0
- `react-native-gesture-handler` ~3.3.0 (npm latest is 3.4.0; use the SDK pin)
- `@shopify/react-native-skia` 2.14.0
- `react-native-screens` ~4.30.0, `react-native-safe-area-context` ~5.10.1
- `expo-audio` ~58.0.10, `expo-haptics` ~58.0.7, `expo-localization` ~58.0.5
- `expo-secure-store` ~58.0.2, `expo-notifications` ~58.1.6, `expo-apple-authentication` ~58.0.2
- `expo-updates` ~58.0.18, `expo-dev-client` ~58.0.15, `expo-observe` ~58.0.16
- `@sentry/react-native` ~8.28.0 (npm latest 8.32.0)
- `jest-expo` ~58.0.12 (supports Jest 29 or 30)
- `typescript` ~6.0.3 (template); npm latest is 7.0.2
- `@types/react` ~19.3.0
- `eslint-config-expo` 58.0.4

Platform targets for SDK 58: Android 7+, compileSdk 37, targetSdk 36; iOS 16.4+, Xcode 26.4+; Node 22.13+ / 24.3+ / 26+.

Other libraries (npm latest on 2026-10-26):

- `zustand` 5.0.16, `xstate` 5.33.3, `jotai` 3.0.1
- `@tanstack/react-query` 5.104.5
- `react-native-mmkv` 4.3.2
- `react-native-unistyles` 3.6.0, `uniwind` 1.13.0, `nativewind` 4.2.7 (v5 is `5.0.0-rc.0`), `tamagui` 3.1.4
- `i18next` 26.5.11, `react-i18next` 17.1.9, `@lingui/core` 6.10.1
- `eslint` 10.13.0, `prettier` 3.9.10, `@biomejs/biome` 2.6.3
- `vitest` 5.0.5, `jest` 30.5.2, `@testing-library/react-native` 14.1.0
- `posthog-react-native` 4.83.0
- `eas-cli` 25.3.0, `@expo/agent-cli` 1.0.20
- `babel-plugin-react-compiler` 1.0.0
- `@react-three/fiber` 9.8.2
- `react-native-skia` (v3, new package) 3.8.0
- `@bacons/apple-targets` 5.0.0
- `@commitlint/cli` 21.2.4, `lefthook` 2.2.2
- `pnpm` 12.15.0, `bun` 1.4.4
- Node.js 24.22.1 (LTS "Krypton"), Node.js 22.23.4 (LTS "Jod"), Node.js 26.12.1 (Current, not LTS yet)

Store facts:

- Apple: Xcode 26 / iOS 26 SDK required for uploads since 2026-04-28.
- Google Play: target API 36 for new apps and updates since 2026-08-31 (extension possible to 2026-11-01).
- Apple Developer Program 99 USD/year. Google Play 25 USD one time.

---

## Sources

Expo (official):

- Expo SDK 58 release notes — https://expo.dev/changelog/sdk-58
- Expo SDK 57 release notes — https://expo.dev/changelog/sdk-57
- Expo SDK 56 release notes — https://expo.dev/changelog/sdk-56
- Expo SDK 55 release notes (expo-av removed from Expo Go) — https://expo.dev/changelog/sdk-55
- Expo changelog index — https://expo.dev/changelog
- SDK reference and version tables — https://docs.expo.dev/versions/latest/
- New Architecture guide — https://docs.expo.dev/guides/new-architecture/
- React Compiler guide — https://docs.expo.dev/guides/react-compiler/
- Monorepos guide — https://docs.expo.dev/guides/monorepos/
- Continuous Native Generation — https://docs.expo.dev/workflow/continuous-native-generation/
- Config plugins — https://docs.expo.dev/config-plugins/introduction/
- Development builds — https://docs.expo.dev/develop/development-builds/introduction/
- Using libraries — https://docs.expo.dev/workflow/using-libraries/
- TypeScript guide — https://docs.expo.dev/guides/typescript/
- ESLint and Prettier guide — https://docs.expo.dev/guides/using-eslint/
- Unit testing with Jest — https://docs.expo.dev/develop/unit-testing/
- Environment variables — https://docs.expo.dev/guides/environment-variables/
- EAS environment variables — https://docs.expo.dev/eas/environment-variables/manage/
- eas.json / build profiles — https://docs.expo.dev/build/eas-json/
- App version management — https://docs.expo.dev/build-reference/app-versions/
- App variants — https://docs.expo.dev/build-reference/variants/
- EAS Update deployment — https://docs.expo.dev/eas-update/deployment/
- EAS Workflows get started — https://docs.expo.dev/eas/workflows/get-started/
- EAS Workflows syntax — https://docs.expo.dev/eas/workflows/syntax/
- E2E tests with Maestro on EAS Workflows — https://docs.expo.dev/eas/workflows/examples/e2e-tests/
- Expo Router introduction — https://docs.expo.dev/router/introduction/
- Typed routes — https://docs.expo.dev/router/reference/typed-routes/
- Protected routes — https://docs.expo.dev/router/advanced/protected/
- Native intent (customizing links) — https://docs.expo.dev/router/advanced/native-intent/
- iOS Universal Links — https://docs.expo.dev/linking/ios-universal-links/
- Android App Links — https://docs.expo.dev/linking/android-app-links/
- Authentication overview — https://docs.expo.dev/develop/authentication/
- Store data — https://docs.expo.dev/develop/user-interface/store-data/
- Localization guide — https://docs.expo.dev/guides/localization/
- Apple privacy manifests — https://docs.expo.dev/guides/apple-privacy/
- expo-audio — https://docs.expo.dev/versions/latest/sdk/audio/
- Using Sentry — https://docs.expo.dev/guides/using-sentry/
- Using PostHog — https://docs.expo.dev/guides/using-posthog/
- EAS Observe — https://docs.expo.dev/eas/observe/introduction/
- Push notifications overview — https://docs.expo.dev/push-notifications/overview/
- Billing plans — https://docs.expo.dev/billing/plans/
- Pricing — https://expo.dev/pricing
- Expo MCP Server — https://docs.expo.dev/mcp/
- Expo for AI agents — https://docs.expo.dev/agents/
- Expo Skills — https://docs.expo.dev/skills/
- Expo docs index for LLMs — https://docs.expo.dev/llms.txt
- Default template package — https://www.npmjs.com/package/expo-template-default
- Bundled native module versions — https://unpkg.com/expo@58/bundledNativeModules.json

React Native (official):

- Versions page — https://reactnative.dev/versions
- React Native 0.87 release blog — https://reactnative.dev/blog/2026/08/11/react-native-0.87
- React Native 0.88.0-rc.0 notes — https://github.com/react/react-native/releases/tag/v0.88.0-rc.0
- React Native 0.82 "A New Era" (New Architecture only) — https://reactnative.dev/blog/2025/10/08/react-native-0.82
- Strict TypeScript API — https://reactnative.dev/docs/strict-typescript-api
- React Native Directory — https://reactnative.directory/

Software Mansion and Shopify:

- Reanimated getting started — https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/getting-started/
- Reanimated CSS animations — https://docs.swmansion.com/react-native-reanimated/docs/css-animations/animation-name/
- Worklets — https://docs.swmansion.com/react-native-worklets/
- Gesture Handler 3 upgrade guide — https://docs.swmansion.com/react-native-gesture-handler/docs/guides/upgrading-to-3/
- React Native Skia — https://shopify.github.io/react-native-skia/
- React Native Skia v3 repo (Graphite) — https://github.com/wcandillon/react-native-skia
- React Native Audio API — https://docs.swmansion.com/react-native-audio-api/

Styling and libraries:

- NativeWind — https://www.nativewind.dev/
- Unistyles 3 — https://www.unistyl.es/v3/start/introduction
- Uniwind — https://docs.uniwind.dev/
- Zustand — https://zustand.docs.pmnd.rs/
- XState — https://stately.ai/docs/xstate
- TanStack Query — https://tanstack.com/query/latest
- react-native-mmkv — https://github.com/mrousavy/react-native-mmkv
- Expo Apple Targets — https://github.com/EvanBacon/expo-apple-targets

Community starters (used as pattern references only; both lag behind SDK 58):

- Obytes starter (SDK 54, pnpm, Uniwind, Zustand, TanStack Query, MMKV, i18next) — https://github.com/obytes/react-native-template-obytes
- Ignite by Infinite Red (SDK 55, MMKV, i18next, Reactotron) — https://github.com/infinitered/ignite

Stores:

- Apple upcoming requirements — https://developer.apple.com/news/upcoming-requirements/
- App Review Guidelines (4.8, 5.1.1(v), 5.3) — https://developer.apple.com/app-store/review/guidelines/
- Apple Developer Program fee — https://developer.apple.com/help/account/membership/program-enrollment/
- Google Play target API requirements — https://developer.android.com/google/play/requirements/target-sdk
- Google Play registration fee — https://support.google.com/googleplay/android-developer/answer/6112435
- Google Play testing requirements for new personal accounts — https://support.google.com/googleplay/android-developer/answer/14151465

Version numbers for npm packages were read from https://registry.npmjs.org on 2026-10-26.

## Notes from the monorepo setup (#10, 2026-10-26)

- **ESLint stays on 9.x.** `eslint-config-expo` 58 crashes on ESLint 10. Move to 10 when Expo supports it.
- **pnpm 12** is pinned in `package.json` (`packageManager`). Corepack cannot run pnpm 12; pnpm 9.7+ switches to the pinned version by itself.
- **Node 22** in `.nvmrc` (SDK 58 supports 22.13+, 24.3+, 26+). We may move to 24 later.
- **Web is off.** `platforms` is iOS and Android only.
- Shared config lives at the root (`tsconfig.base.json`, `eslint.config.mjs`, `.prettierrc.json`), not in a `packages/config` package.
- Reanimated, Worklets, and Gesture Handler come with the SDK 58 template and stay installed.

## Notes from the settings and i18n setup (#37, 2026-10-26)

- **Unistyles 3.6.0** with `react-native-nitro-modules` **0.37.1** (pinned; Unistyles 3.4+ needs Nitro 0.37.1 or newer). We use the Babel plugin (`root: 'src'`), not the experimental Metro config. `react-native-edge-to-edge` is optional since Unistyles 3.1, and SDK 54+ turns edge-to-edge on, so we do not install it.
- **Themes are data** in `packages/ui/src/themes`. The app registers them in `apps/mobile/src/theme/unistyles.ts`. Today there is one theme, `walnut-kafeneio` (Concept B, #13). It is a dark warm-brown UI, so `adaptiveThemes` is off and the saved theme id picks the theme.
- **MMKV 4.3.2** (a Nitro module, no config plugin) sits behind the `Storage` port in `@tavli/contracts`. The adapter is `packages/adapters/storage-mmkv`. The port is synchronous, so settings load before the first frame.
- **i18n:** `i18next` 26.5.10, `react-i18next` 17.1.9, `expo-localization` ~58.0.5 with `supportedLocales: ["el", "en"]` (per-app language in iOS and Android system settings). Keys are typed from `en.json`.
- **Zustand 5.0.16** `persist` with a `version`, a `migrate` stub and a `merge` that cleans bad saved values.
- **Jest:** `jest` 30.5, `jest-expo` ~58.0.12, `@testing-library/react-native` 14.1 (async `render` and events). Unistyles mocks come from `react-native-unistyles/mocks`.
- Unistyles and MMKV need a **development build**. Expo Go cannot run them.

## Notes from crash reporting (#43, 2026-10-26)

- **`@sentry/react-native` ~8.28.0** (the SDK 58 pin from `expo install`) sits behind the `CrashReporter` port. The adapter is `packages/adapters/crash-sentry`; its README has the owner setup (DSN, org, project, auth token).
- We set Sentry up by hand, not with `@sentry/wizard`: the wizard would put `Sentry.init` and `Sentry.wrap` in app code, which ADR-0002 forbids.
- `apps/mobile/app.config.ts` adds the `@sentry/react-native/expo` plugin on top of `app.json`. It reads `SENTRY_ORG` and `SENTRY_PROJECT` from the build env, and sets `disableAutoUpload` while `SENTRY_AUTH_TOKEN` is missing, so EAS builds pass before the token exists. `expo config` warns about the missing org and project until they are set.
- `apps/mobile/metro.config.js` uses `getSentryExpoConfig` (Debug IDs for source maps).
- `app.json` has `ios.privacyManifests` with the "required reason" APIs Sentry uses (UserDefaults, SystemBootTime, FileTimestamp) and the data it collects (crash, performance, diagnostics). #61 added PostHog's data: product interaction and the install ID (device ID), for analytics. All five are **linked** and none is used for tracking (#139): after "Allow", analytics and crash reports carry the persistent install ID, so Apple counts them as linked to the user.
- `@sentry/cli` is in `allowBuilds: false`: its postinstall only downloads a binary the optional deps already ship.
- Dev builds use the no-op reporter. Release builds send only when `EXPO_PUBLIC_SENTRY_DSN` is set. The anonymous install id (`features/install-id`) is the only user id, shared with analytics (#61). Crash reports carry it only after "Allow usage data".
