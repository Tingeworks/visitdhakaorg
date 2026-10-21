# 0004: Cloudflare D1 for contribution records

- Status: Proposed, deferred to phase 2
- Date: 2026-09-20

## Context

Frontmatter and git (0003) already record credit. D1 (Cloudflare's SQLite database) could add a durable record of submissions independent of git: who submitted what, its state, and moderation data.

## Decision

Do not use D1 in phase 1. Add it in phase 2, when there is a concrete need, with these tables:

- `contributions`: id, page, display name, GitHub user (nullable), pull request number, state (open, merged, closed), timestamps, hashed IP.
- `blocked`: hashed IP or GitHub user, reason, created.
- `users` (only if sign-in is added): verified GitHub identity and trust level.

A GitHub webhook (`pull_request` closed events, verified with the webhook secret) updates `contributions.state`. A scheduled reconcile job compares D1 against open and merged pull requests, because a missed webhook otherwise leaves the two out of sync.

Git stays the only source of truth for content. D1 never holds page text.

## Triggers to build it

Any one of: a leaderboard or "recent changes" page is wanted, credit must survive squash merges, per-user trust levels or bans are needed, or Cloudflare's built-in rate limiting is no longer enough.

## Consequences

- Adds a second source of truth and a webhook to keep it consistent. This is the main cost.
- Site credits fed from D1 would require the build to fetch from the Worker. A failed fetch must fall back to the last good copy and not fail the build.
- Only a hashed IP is stored, never a raw IP or an email.
- Platform limits on the free plan are far above expected volume (see feasibility review), so cost is not the reason to defer. Complexity is.

## Update (decision 0006, #56)

The `users` table is built ahead of phase 2, for optional Google sign-in (0006, #54). It lives in the `visitdhaka-edit`
D1 database (`worker/migrations/0001_users.sql`) and holds a stable ID, Google's subject ID, the display name, the join
date and a ban flag with a reason. It holds no email, picture or other Google profile data, and its checks refuse an
email address in any column. Queries are in `worker/src/users.ts`. The `contributions` and `blocked` tables, the webhook
and the reconcile job are still deferred to phase 2. A ban on a signed-in account is the `banned_at` column rather than a
`blocked` row.
