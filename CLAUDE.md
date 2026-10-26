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
- The lint config is one file: `eslint.config.mjs`. It blocks vendor SDKs outside `packages/adapters/**` and `apps/server/**`, React/Expo in `engine`, `bot` and `contracts`, and `Math.random` in `engine`.
- Workspace packages export TypeScript source (`"main": "./src/index.ts"`). There is no build step. Metro and Vitest read the source.
