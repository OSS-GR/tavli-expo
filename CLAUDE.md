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
3. **Vendors only in adapters.** Vendor SDKs (Supabase, Firebase, Sentry, etc.) are imported only in `packages/adapters/*`. Everything else uses interfaces from `packages/contracts`.
4. **Rules come from `docs/rules/`.** If code and the rules doc disagree, raise it in the issue. Every numbered edge case in a rules doc needs a unit test.
5. **Conventional Commits** (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`).
6. **Simple English** in docs and comments: short sentences, active voice.
7. Do not add secrets to the repo. Public client config uses `EXPO_PUBLIC_*` env vars only.

## When you finish a task

- Update the docs the change touches.
- If you learned something future agents need, add it here or to the right doc.
