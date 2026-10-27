# CLAUDE.md — rules for AI agents in this repo

## Read first

- `docs/README.md` — index of all project docs
- `docs/vision.md` — goals and principles
- `docs/roadmap.md` — milestones
- `docs/process/github-workflow.md` — labels, Definition of Done, branch and commit rules
- `docs/decisions/` — accepted decisions (ADRs). Do not go against an accepted ADR. Propose a new ADR instead.

## Hard rules

1. **One issue, one PR.** Put `Closes #NN` in the PR body.
2. **Engine is pure.** `packages/engine` has no React, no network, no vendor imports, no `Math.random` (dice come from an injected RNG).
3. **Vendors only in adapters.** Vendor SDKs (Convex, Better Auth, Sentry, PostHog, etc.) are imported only in `packages/adapters/*` and in the Convex functions in `apps/server`. Everything else uses interfaces from `packages/contracts`.
4. **Rules come from `docs/rules/`.** If code and the rules doc disagree, raise it in the issue. Every numbered edge case in a rules doc needs a unit test.
5. **Conventional Commits** (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`).
6. **Simple English** in docs and comments: short sentences, active voice.
7. Do not add secrets to the repo. Public client config uses `EXPO_PUBLIC_*` env vars only.

## When you finish a task

- Update the docs the change touches.
- If you learned something future agents need, add it here or to the right doc.

## Tooling notes

- Run `pnpm install`, `pnpm lint`, `pnpm typecheck` and `pnpm test` from the repo root.
- pnpm is pinned in `package.json` (`packageManager`). pnpm switches to that version by itself. Corepack 0.34 cannot run pnpm 12, so do not rely on Corepack.
- ESLint stays on 9.x for now. `eslint-config-expo` 58 uses `eslint-plugin-react` 7.x, which crashes on ESLint 10.
- The lint config is one file: `eslint.config.mjs`. It blocks vendor SDKs (including `expo-haptics` and `expo-audio`) outside `packages/adapters/**` and `apps/server/**`, React/Expo in `engine`, `bot` and `contracts`, and `Math.random` in `engine`.
- CI (`.github/workflows/ci.yml`) runs `lint`, `typecheck`, `test` and `format:check` in the job `checks`. Do not add `paths-ignore` to it: a skipped required check blocks the PR. See the CI section in `docs/process/github-workflow.md`.
- Two required checks: `checks` (`.github/workflows/ci.yml`) and `claude-review` (`.github/workflows/claude-review.yml`). `claude-review` runs `/code-review high` on each PR and fails on a blocking finding (see `docs/process/github-workflow.md`). Fix blocking findings before you ask the owner to merge.
- Analytics go through the `Analytics` port (`@tavli/analytics-posthog`). It drops every call until `optIn()`; the user's answer lives in `features/privacy/` (`consent.ts`, `consentStore.ts`), not in Settings. It is the one privacy switch: crash reports follow it too (`features/crash/consent.ts`). New events go in `AnalyticsEvents` (contracts) **and** `docs/architecture/analytics-events.md` (a test checks). Never send names, emails or setting values.
- The first-launch gate (language, then consent) is in `apps/mobile/src/app/_layout.tsx` (`Stack.Protected` on the consent answer), not on Home. List every new route in its app group, or a deep link skips consent (`welcomeFlow.test.tsx` checks). Raise `CONSENT_VERSION` (`features/privacy/consent.ts`) only when the consent text changes so much that users must answer again.
- Analytics calls from the game store go through `quietly()`: an analytics error must never fail or undo a move.
- `@tavli/contracts/testing` holds port contract checks. The analytics checks are plain functions, so Vitest and Jest can both run them.
- App tests that need navigation use `renderRouter` from `expo-router/testing-library`. Render it once per test: a second `renderRouter` in the same test leaves the next test with an empty tree.
- In Asodio a turn can keep the same player to move (extra rolls, the chosen double after a 1-2 in the Acey-Deucey presets). Code that drives turns (bot scoring, `simulate`, the app) must follow `state.toMove`, play `state.dice` when the state already holds dice, and never assume the players alternate.
- Workspace packages export TypeScript source (`"main": "./src/index.ts"`). There is no build step. Metro and Vitest read the source.
- `apps/server` holds the Convex functions (`convex/`). Its tests use `convex-test` in Vitest's `edge-runtime` environment and need no Convex account. `convex/_generated/` is committed. After you add or rename a file in `convex/`, run `pnpm --filter @tavli/server codegen` (works offline, see `docs/architecture/online-game-service.md`). Files with two dots (`*.test.ts`, `test.setup.ts`) are not deployed. Lint blocks `Math.random` and React there; dice use `createCryptoRng`. Every save schedules a turn-timer check (`checkTimeout`), so `games.test.ts` runs on fake timers (`vi.useFakeTimers()`, then `vi.advanceTimersByTime` + `t.finishInProgressScheduledFunctions()`). A Convex mutation that throws rolls back everything, so a call that must save something and still report an error returns the error as a value (`makeMove` → `TIMED_OUT`).
- pnpm build scripts: `esbuild` (from `convex`) is listed as `false` in `pnpm-workspace.yaml` `allowBuilds`. A new dependency with a build script fails `pnpm install` until you list it there.
- pnpm refuses packages published less than 24 hours ago (`minimumReleaseAge`). Pick the previous version. Do not add an exclusion.
- Pure packages test with Vitest. The app tests with Jest (`jest-expo` + React Native Testing Library 14, where `render` and events are `async`). `apps/mobile/jest.setup.ts` loads the Unistyles mocks first, then swaps `@/services` for in-memory fakes and fixes the phone language to English.
- Adapters are picked in one file: `apps/mobile/src/services.ts` (ADR-0002). `react-native-mmkv` is on the vendor list, so only `packages/adapters/storage-mmkv` may import it.
- Crash reports go through the `CrashReporter` port (`@tavli/crash-sentry`, setup in its `README.md`). Report render errors through `CrashBoundary`; never put names or emails in reports. New adapters of a port with a shared contract test (`@tavli/contracts/testing`, Vitest only) must run it. Build tooling (`apps/mobile/metro.config.js`, `app.config.ts`) may use Sentry's build helpers directly.
- `pnpm-workspace.yaml` `allowBuilds` lists packages whose install scripts we skip. Add a new one there (with a reason) when `pnpm add` fails with `ERR_PNPM_IGNORED_BUILDS`.
- Styling is Unistyles 3. Its Babel plugin processes `apps/mobile/src` only. `apps/mobile/index.ts` configures Unistyles before Expo Router loads. Metro warns "invalid package.json configuration" for `react-native-unistyles/components/native/*`; it is harmless.
- ESLint does not resolve the `@/` alias (`import/no-unresolved` ignores it). `tsc` checks those imports.
- UI strings: see "Add a UI string" in `README.md`. Settings: see "Add a setting".
- The board is drawn with Skia (`apps/mobile/src/features/board/`, see `docs/architecture/board-screen.md`). Jest mocks Skia with `apps/mobile/test/skiaMock.tsx`. Add any new Skia component you use to that mock. Reanimated is faked with `apps/mobile/test/reanimatedMock.ts` (the official mock crashes under jest-expo); add what you use. Use `sv.get()` / `sv.set()` on shared values (React Compiler). Gesture Handler is faked with `apps/mobile/test/gestureHandlerMock.tsx` (`touch()` drives a pan by its `testID`); wrap screens in `renderWithRoot` (`apps/mobile/test/render.tsx`).
- Theme images need a literal `require` in `apps/mobile/src/features/board/themeImages.ts`. A test fails if one is missing.
- `pnpm --filter @tavli/mobile screenshots` renders board PNGs headless (CanvasKit) into `apps/mobile/docs/screenshots/`. Node-only tools in `apps/mobile/tools/` have their own `tsconfig.json`; the app tsconfig leaves them out.
- Never put tests (or any non-route file) in `apps/mobile/src/app/`: Expo Router treats every file there as a route. Route tests live in `apps/mobile/src/navigation.test.tsx` and use `renderRouter('./src/app')`. That file mocks `expo-router/build/testing-library/mocks`, because the library's own Reanimated mock replaces ours.
- The app config is `apps/mobile/app.json` (base) plus `app.config.ts` (app variants by `APP_VARIANT`; default `development` = `com.tavlaki.dev`). Only `APP_VARIANT=production` uses `com.tavlaki`. Keep `app.config.ts` a function of `config` so EAS CLI can still write to `app.json`. EAS CLI rewrites `app.json` in its own style, so run `pnpm format` after `eas init` or `eas update:configure`.
- We use CNG: `apps/mobile/ios` and `android` are generated and ignored. Never commit them. Build profiles live in `apps/mobile/eas.json`; how to run the app is in `docs/process/running-the-app.md`.
- The tutorial (`apps/mobile/src/features/tutorial/`, #128) plays fixed positions with fixed dice and only filters the engine's legal moves per lesson (`lessonMoves`). Never add a rule check there. `apps/mobile/test/tutorialTaps.ts` plays a lesson with taps in screen tests.
- Screen reader users play through the move list (`apps/mobile/src/features/accessibility/`, #134), not the Skia board. A new board action needs a button there too. Announce game events with `useAnnouncement` (both platforms), not `accessibilityLiveRegion` (Android only), and check `features/game/announcements.ts` first so nothing is read twice. Text must not get `numberOfLines` or a fixed-height box: `textScaling.test.tsx` checks Home, New game, the game screen, the end screens and History.
- React Native Testing Library skips views hidden from screen readers (`importantForAccessibility="no-hide-descendants"`, e.g. the win `Celebration`). Pass `{ includeHiddenElements: true }` to find them.
- Board themes live in `packages/themes` (one folder each, built by `pnpm --filter @tavli/themes build:assets -- <id>`, which needs Playwright Chromium). The board choice is the `boardTheme` setting, separate from `theme` (app colors). A new theme also needs `exports` in `packages/themes/package.json`, its images in `apps/mobile/src/features/board/themeImages.ts` and its sounds in `apps/mobile/src/features/feedback/themeSounds.ts`. Every theme shares the Walnut Kafeneio geometry (`themes.test.ts` checks it); new art imports it and the SVG helpers in `packages/themes/tools/lib/svg.mjs`. After a change to shared tool code, run `build:assets` for all themes and check that the other themes' images did not change.
- Match history (#142) lives in `apps/mobile/src/features/history/`. `sessions.ts` adds a record when a match is over or is replaced after it started (`history` dep). Do not put history in the save slot (`savedMatch.ts`). Tests that finish matches through `matchSessions` add records to the shared `historyStore`; clear it in `beforeEach` when a test counts them.
