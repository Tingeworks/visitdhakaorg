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
