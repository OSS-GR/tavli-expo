# How We Work on GitHub

> Living document. Last review: 2026-10-26.

## Roles

- **Owner** (Orestis): makes product decisions, accepts ADRs, does tasks that need a human (accounts, payments, testing on real phones, art taste).
- **PM agent** (Claude): keeps docs and the backlog up to date, splits work into issues, sends tasks to sub-agents, reviews their output.
- **Worker agents**: do one issue each and open one pull request.

## The pieces

| GitHub feature | What we use it for |
|----------------|--------------------|
| **Milestones** | One per release stage: `M0`, `MVP1`, `MVP2`, `MVP3`, `v1.0`, `MVP4`. See `docs/roadmap.md`. |
| **Issue types** | `Feature` = user story or epic. `Task` = technical work. `Bug` = defect. |
| **Sub-issues** | An epic (Feature) holds its stories and tasks as sub-issues. |
| **Labels** | Area, game, priority, size, and who can do it. Source of truth: `.github/labels.json`. |
| **Project board** | "Tavli Roadmap" board with columns *Backlog → Ready → In progress → In review → Done*. |
| **Pull requests** | One issue per PR. PR text says `Closes #NN`. |
| **Actions** | CI (lint, typecheck, tests) and label/milestone sync. |
| **Discussions** (optional) | Open questions and ideas that are not tasks yet. |

## Labels

- **area:** `area:engine`, `area:bot`, `area:ui`, `area:art`, `area:backend`, `area:auth`, `area:multiplayer`, `area:infra`, `area:docs`, `area:imessage`
- **game:** `game:portes`, `game:plakoto`, `game:fevga`, `game:asodio`
- **priority:** `P0` (blocks the milestone), `P1` (should have), `P2` (nice to have)
- **size:** `size:S` (< 2 h), `size:M` (half day), `size:L` (1–2 days; split it if bigger)
- **who:** `owner-task` (needs the owner), `agent-ready` (an agent can do it with no questions)
- **flow:** `decision` (needs an ADR), `needs-research`, `blocked`

## User story format

```
As a <player type>, I want <goal>, so that <reason>.

Acceptance criteria
- [ ] Given ..., when ..., then ...
```

## Definition of Ready (before an agent picks it up)

- [ ] Clear goal and acceptance criteria
- [ ] Links to the docs it depends on
- [ ] Size is S, M, or L
- [ ] No open `decision` it depends on

## Definition of Done

- [ ] Acceptance criteria met
- [ ] Tests added (engine and bot: unit tests are required)
- [ ] Lint, typecheck, and tests pass in CI
- [ ] Docs updated if behavior or a decision changed
- [ ] PR reviewed and merged; issue closed

## Branches and commits

- Branch name: `<type>/<issue-number>-<short-name>`, for example `feat/12-portes-move-gen`.
- Commit style: **Conventional Commits** (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`).
- `main` is protected: merge only through PRs with green CI.

## CI

The workflow is `.github/workflows/ci.yml`. It has one job, called **`checks`**.

**When it runs:** on every pull request (any base branch) and on every push to `main`.

**What it runs**, in this order:

1. `pnpm install --frozen-lockfile`
2. `pnpm lint`
3. `pnpm typecheck`
4. `pnpm test`
5. `pnpm format:check`

Node comes from `.nvmrc`. pnpm comes from `packageManager` in `package.json`. The pnpm store is cached between runs.

Run the same commands on your machine before you push. If they pass locally, they should pass in CI.

**Docs-only changes:** if a PR only changes files in `docs/` or Markdown in `.github/`, the first step skips the rest and the job passes. Other Markdown files (like `README.md` and `CLAUDE.md`) still run all checks, because Prettier checks them. We do not use `paths-ignore`: it would skip the workflow, so a required check would never report and the PR would wait forever.

**Saving minutes:** the repo is private, so we get 2,000 free Actions minutes a month. To keep runs cheap, CI uses one job, caches the pnpm store, stops after 15 minutes, and cancels an older run when you push again to the same PR.

**Dependency updates:** Dependabot (`.github/dependabot.yml`) opens grouped PRs every Monday: one for Expo packages, one for dev tooling, one for GitHub Actions. It does not propose Expo SDK, React or React Native upgrades. Do those by hand in `apps/mobile`: run `npx expo install expo@^<sdk> --fix` (for example `expo@^59.0.0`). Expo then picks the React, React Native and native library versions that match the SDK.

### Require the check on `main` (owner, one time)

The check only shows in the list after CI has run once. Open any PR first.

1. Repo → **Settings** → **Rules** → **Rulesets** → open the ruleset for `main` (or create one that targets the default branch).
2. Turn on **Require status checks to pass**.
3. Click **Add checks**, type `checks`, and pick the one from **GitHub Actions**.
4. Optional: turn on **Require branches to be up to date before merging**.
5. Click **Save changes**.

## One-time setup the owner does by hand

The GitHub API we use cannot create Projects for a personal account. Do this once:

1. **Create the board:** GitHub → your profile → **Projects** → **New project** → *Board* → name it **Tavli Roadmap**.
2. **Link the repo:** Project → **⋯** → **Settings** → **Manage access / Linked repositories** → add `OSS-GR/tavli-expo`.
3. **Auto-add issues:** Project → **⋯** → **Workflows** → **Auto-add to project** → filter `repo:OSS-GR/tavli-expo is:issue,pr is:open` → turn it on.
4. **Columns:** rename the Status options to *Backlog, Ready, In progress, In review, Done*.
5. **Add fields (optional):** `Milestone` and `Labels` are built in; add a *Roadmap* view grouped by Milestone.
