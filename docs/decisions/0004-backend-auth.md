# ADR-0004: Backend, realtime, auth, and push vendors

- **Status:** Accepted (owner chose Convex on 2026-10-26; accepted by merging the PR that adds it)
- **Date:** 2026-10-26
- **Issue:** #7

## Context

Online play needs server-rolled dice, server move checks, live updates, async turns with push, friends, and invites. The owner's top concern: **keep two phones in sync with no bugs**. Low cost and the ability to switch later also matter. Research: [`docs/architecture/backend-options.md`](../architecture/backend-options.md).

## Options (short)

| Option | Fit | Cost at launch | Lock-in |
|--------|-----|----------------|---------|
| **Convex** (reactive TypeScript backend) | **Best for sync:** each move is one transaction; screens update live by themselves; built-in scheduler for timers | Free plan (1M function calls/month); Pro $25 per developer/month | Medium (Convex-only API; self-hostable, FSL → Apache-2.0) |
| Supabase (Postgres, Auth, Realtime, Edge Functions) | Good; we must handle realtime channels and move races ourselves | $0 dev; ~$25/mo Pro at launch (free projects pause after 7 idle days) | Low (Postgres, open source) |
| Cloudflare Durable Objects | Best for live rooms; cheapest at scale | ~$5/mo | Medium; needs separate auth + DB |
| Firebase | Good; mature | Free tier, then usage-based | High |
| Colyseus / Nakama | Game-focused | Self-host or paid cloud | Medium; more ops work |

## Decision

1. **Convex** for the database, server logic, live updates, and timers.
2. **Moves flow:** the app calls a `makeMove` **mutation**. Inside one transaction it loads the game, checks the move with `packages/engine`, rolls the next dice on the server, and saves. Both phones watch the game with a reactive **query**, so they update at once. Live and async play use the same path.
3. **Dice:** rolled only on the server, inside the mutation, through the engine's injected `Rng`. Clients never see the next roll early.
4. **Turn timers:** Convex scheduler (`runAfter` / `runAt`) plus a deadline check on every move.
5. **Presence:** Convex presence component (who is online).
6. **Auth:** **Better Auth** through the official Convex component (`@convex-dev/better-auth`, Expo guide). Sign in with Apple, Google, email magic link, and **anonymous** (guest) users that can upgrade to a full account. Better Auth is open source (MIT), so our user accounts are not tied to one vendor. Convex Auth was skipped because it is still in beta.
7. **Push:** Expo Push Service (free), sent from a Convex action, behind a `PushProvider` port.
8. **Email:** a transactional email provider for magic links, behind a port (pick in MVP2).
9. All vendor code stays in `packages/adapters/*-convex`, `packages/adapters/auth-better-auth`, and the `apps/server` Convex functions (ADR-0002).
10. **Fallback:** Supabase. Switching means rewriting the Convex adapter and server functions. The engine, UI, and contracts stay the same.

## Consequences

- Less code for sync, races, and timers than the Supabase plan. Fewer sync bugs.
- Likely **$0 at launch** on the free plan for a small player base. Pro is $25 per developer per month when we need it.
- Convex functions run in Convex's own runtime: the engine must stay pure TypeScript with no Node-only APIs (already a rule).
- Leaderboards and stats need Convex indexes or the aggregate component instead of SQL.
- To verify early in MVP2 (#46): native Sign in with Apple through Better Auth on Expo, free-plan pausing rules, and function-call use per game.
