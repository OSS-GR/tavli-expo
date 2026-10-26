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

## One-time setup the owner does by hand

The GitHub API we use cannot create Projects for a personal account. Do this once:

1. **Create the board:** GitHub → your profile → **Projects** → **New project** → *Board* → name it **Tavli Roadmap**.
2. **Link the repo:** Project → **⋯** → **Settings** → **Manage access / Linked repositories** → add `OSS-GR/tavli-expo`.
3. **Auto-add issues:** Project → **⋯** → **Workflows** → **Auto-add to project** → filter `repo:OSS-GR/tavli-expo is:issue,pr is:open` → turn it on.
4. **Columns:** rename the Status options to *Backlog, Ready, In progress, In review, Done*.
5. **Add fields (optional):** `Milestone` and `Labels` are built in; add a *Roadmap* view grouped by Milestone.
