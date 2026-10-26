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
- CI (`.github/workflows/ci.yml`) runs `lint`, `typecheck`, `test` and `format:check`. The required check is the job `checks`. Do not add `paths-ignore` to it: a skipped required check blocks the PR. See the CI section in `docs/process/github-workflow.md`.
- Workspace packages export TypeScript source (`"main": "./src/index.ts"`). There is no build step. Metro and Vitest read the source.
- pnpm refuses packages published less than 24 hours ago (`minimumReleaseAge`). Pick the previous version. Do not add an exclusion.
- Pure packages test with Vitest. The app tests with Jest (`jest-expo` + React Native Testing Library 14, where `render` and events are `async`). `apps/mobile/jest.setup.ts` loads the Unistyles mocks first, then swaps `@/services` for in-memory fakes and fixes the phone language to English.
- Adapters are picked in one file: `apps/mobile/src/services.ts` (ADR-0002). `react-native-mmkv` is on the vendor list, so only `packages/adapters/storage-mmkv` may import it.
- Styling is Unistyles 3. Its Babel plugin processes `apps/mobile/src` only. `apps/mobile/index.ts` configures Unistyles before Expo Router loads. Metro warns "invalid package.json configuration" for `react-native-unistyles/components/native/*`; it is harmless.
- ESLint does not resolve the `@/` alias (`import/no-unresolved` ignores it). `tsc` checks those imports.
- UI strings: see "Add a UI string" in `README.md`. Settings: see "Add a setting".
- The board is drawn with Skia (`apps/mobile/src/features/board/`, see `docs/architecture/board-screen.md`). Jest mocks Skia with `apps/mobile/test/skiaMock.tsx`. Add any new Skia component you use to that mock. Reanimated is faked with `apps/mobile/test/reanimatedMock.ts` (the official mock crashes under jest-expo); add what you use. Use `sv.get()` / `sv.set()` on shared values (React Compiler).
- Theme images need a literal `require` in `apps/mobile/src/features/board/themeImages.ts`. A test fails if one is missing.
- `pnpm --filter @tavli/mobile screenshots` renders board PNGs headless (CanvasKit) into `apps/mobile/docs/screenshots/`. Node-only tools in `apps/mobile/tools/` have their own `tsconfig.json`; the app tsconfig leaves them out.
