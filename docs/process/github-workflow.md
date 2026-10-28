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
| **Actions** | CI (lint, typecheck, tests), the server deploy, and label/milestone sync. |
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
- [ ] The Claude review check passes: no blocking findings
- [ ] Docs updated if behavior or a decision changed
- [ ] PR reviewed and merged; issue closed

## Branches and commits

- Branch name: `<type>/<issue-number>-<short-name>`, for example `feat/12-portes-move-gen`.
- Commit style: **Conventional Commits** (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`).
- `main` is protected: merge only through PRs with green CI and a passing Claude review.

## CI

The workflow is `.github/workflows/ci.yml`. Its jobs run at the same time (#248). The last job is called **`checks`**: it passes only when every other job passed or was skipped. Only `checks` is a required check, so the other jobs can change names freely. The Claude review is a second workflow (see below).

**When it runs:** on every pull request (any base branch: opened, new pushes, reopened, and marked ready for review) and on every push to `main`.

**What it runs:**

| Job | What it does |
| --- | --- |
| `changes` | Looks for a docs-only change (see below). |
| `static` | `expo install --check`, `pnpm lint`, `pnpm typecheck`, `pnpm format:check` |
| `test-packages` | `pnpm -r --filter '!@tavli/mobile' --filter '!@tavli/bot' test` (Vitest) |
| `test-bot` | `pnpm --filter @tavli/bot test`, the longest package, on its own runner (#287) |
| `test-app (1/2)`, `test-app (2/2)` | `jest --shard=i/2` in `apps/mobile`. `apps/mobile/test/shardSequencer.js` splits the files by size, so both halves take about the same time. |
| `checks` | Fails if any job above failed or was cancelled. |

Each job runs `pnpm install --frozen-lockfile` first (`.github/actions/setup`).

Node comes from `.nvmrc`. pnpm comes from `packageManager` in `package.json`. The pnpm store is cached between runs.

**Before you push (#287):** run `pnpm lint`, `pnpm typecheck`, `pnpm format:check` and `pnpm test:changed`. CI runs every test on every push, so do not wait for a full local `pnpm test` each time.

- `pnpm test:changed` runs Vitest in the packages changed since `origin/main` and in the packages that depend on them, then the app's Jest tests related to the changed app files (`jest --changedSince=origin/main`). Run `git fetch origin main` first.
- The app's Jest does not follow changes in other packages. When you change something many tests use (engine rules, the bot, `packages/contracts`, `apps/mobile/test/*`, `jest.setup.ts`), run the app's tests too (`pnpm --filter @tavli/mobile test`) or the full `pnpm test`.
- When CI fails, run the failing file locally, fix it, and push again.

**Docs-only changes:** if a PR only changes files in `docs/` or Markdown in `.github/`, the `changes` job skips the other jobs and `checks` passes. Other Markdown files (like `README.md` and `CLAUDE.md`) still run all checks, because Prettier checks them. We do not use `paths-ignore`: it would skip the workflow, so a required check would never report and the PR would wait forever.

**Saving minutes:** the repo is private, so we get 2,000 free Actions minutes a month. To keep runs cheap, the jobs cache the pnpm store, stop after 15 minutes, and an older run is cancelled when you push again to the same PR. GitHub bills each job in whole minutes, so the parallel jobs cost about 3 more minutes per run than one long job, but the wait is about 3 minutes instead of 7.

**Dependency updates:** Dependabot (`.github/dependabot.yml`) opens grouped PRs every Monday: one for Expo packages, one for dev tooling, one for GitHub Actions. It does not propose Expo SDK, React or React Native upgrades. Do those by hand in `apps/mobile`: run `npx expo install expo@^<sdk> --fix` (for example `expo@^59.0.0`). Expo then picks the React, React Native and native library versions that match the SDK.

### Claude review (`claude-review`)

The workflow `.github/workflows/claude-review.yml` has one job, **`claude-review`**. On every pull request, Claude Code reviews the PR at **high** effort (`/code-review high`), at the same time as `checks`. It follows `CLAUDE.md`.

- **Read-only:** Claude cannot edit files or post. It returns its findings as JSON.
- **One comment:** the job posts the findings as one PR comment and updates it on each push.
- **Severity:** a finding is **blocking** when it is a correctness bug, a crash, data loss, a security problem, a test that fails or tests nothing, or a break of a hard rule in `CLAUDE.md`. Everything else is **optional**.
- **Gate:** the job fails when there is a blocking finding, or when the review does not finish. Fix the blocking findings and push again. Optional findings do not block.
- **Skipped** (a skipped job counts as passed): drafts, Dependabot PRs (they get no secrets), and PRs from forks. A draft is reviewed when you mark it ready for review.
- **Token:** the action uses the workflow's own `GITHUB_TOKEN` (read-only for code), not the Claude app. So a PR that changes `claude-review.yml` is reviewed too.
- **Debug:** the run log shows Claude's full output (`show_full_output`; the repo is private).
- **Cost:** each push to a PR runs one review. A newer push cancels the older run. With `CLAUDE_CODE_OAUTH_TOKEN` the review uses the owner's Claude plan, not API billing.

**Secret (owner, one time).** Add one repository secret (Settings → Secrets and variables → Actions):

- `CLAUDE_CODE_OAUTH_TOKEN`: run `claude setup-token` on your computer and paste the token. It uses your Claude plan. Recommended.
- or `ANTHROPIC_API_KEY`: a key from the Claude Console, billed per use.

Without a secret, the job fails with a clear error. The Claude GitHub App must also be installed on the repo (it is).

### Server deploy (`deploy-server`)

The workflow `.github/workflows/deploy-server.yml` deploys the Convex functions in `apps/server` (#257). It is **not** a required check: it never runs on a pull request.

- **Dev:** on each push to `main` that changes `apps/server/**`, `packages/engine/**`, `packages/contracts/**`, `packages/online/**`, `packages/adapters/push-expo/**`, the lockfile, the root config or the workflow itself. You can also start it by hand (Actions → **Deploy server** → **Run workflow**, target `dev`).
- **Prod:** only by hand, with target `prod`, from `main`. The job uses the GitHub environment `production`.
- **Steps:** check the deploy key, install, server typecheck and tests, then `convex deploy --typecheck enable` in `apps/server`.
- **Never on PRs:** it has no `pull_request` or `pull_request_target` trigger, so PR code never sees the deploy keys. Keep it that way.
- **Secrets:** `CONVEX_DEPLOY_KEY_DEV` (repo secret) and `CONVEX_DEPLOY_KEY_PROD` (secret of the environment `production`, `main` only). The first step fails with a clear error when the key is missing or is for another deployment.

How a deploy works, and how to roll back: [online game service](../architecture/online-game-service.md#deploy).

### Require the checks on `main` (owner, one time)

The check only shows in the list after CI has run once. Open any PR first.

1. Repo → **Settings** → **Rules** → **Rulesets** → open the ruleset for `main` (or create one that targets the default branch).
2. Turn on **Require status checks to pass**.
3. Click **Add checks**, type `checks`, and pick the one from **GitHub Actions**. Do the same for `claude-review`.
4. Optional: turn on **Require branches to be up to date before merging**.
5. Click **Save changes**.

## One-time setup the owner does by hand

The GitHub API we use cannot create Projects for a personal account. Do this once:

1. **Create the board:** GitHub → your profile → **Projects** → **New project** → *Board* → name it **Tavli Roadmap**.
2. **Link the repo:** Project → **⋯** → **Settings** → **Manage access / Linked repositories** → add `OSS-GR/tavli-expo`.
3. **Auto-add issues:** Project → **⋯** → **Workflows** → **Auto-add to project** → filter `repo:OSS-GR/tavli-expo is:issue,pr is:open` → turn it on.
4. **Columns:** rename the Status options to *Backlog, Ready, In progress, In review, Done*.
5. **Add fields (optional):** `Milestone` and `Labels` are built in; add a *Roadmap* view grouped by Milestone.
