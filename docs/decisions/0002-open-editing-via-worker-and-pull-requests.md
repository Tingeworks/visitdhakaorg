# 0002: Public editing through a Worker that opens pull requests

- Status: Proposed
- Date: 2026-09-20

## Context

Open editing by the public is the main purpose of the site. Constraints:

- The site is fully static and deploys from `main` to Cloudflare. `CLAUDE.md` says not to add `@astrojs/cloudflare` or `wrangler` to the site.
- Content is markdown in git. Git already provides history, diff and revert.
- The maintainers want minimal running cost and no server to patch.
- Anonymous editing of a public, search-facing site attracts spam and vandalism. Some content (safety, health, visa) is close to YMYL, so unreviewed changes carry real risk.

## Options considered

| Option | Verdict |
| :--- | :--- |
| MediaWiki | Most complete, least custom code. Needs a PHP and database server, ongoing patching and spam fighting, and replaces the Astro site. Rejected for resource cost. |
| Wiki.js | Lighter than MediaWiki but still a server and a database, and loses the current design and content model. Rejected. |
| Worker + D1 as the content store | Instant edits with no rebuild, but means building a wiki from scratch (history, diff, revert, search index). Rejected. |
| Worker commits straight to `main` | Instant publish, cheapest moderation path to build, but vandalism goes live and every edit triggers a production build. Rejected as the default. Possible later for trusted contributors. |
| **Worker opens pull requests** | Chosen. |

## Decision

A separate Cloudflare Worker accepts edits from an in-page editor, validates them, and opens a pull request through a GitHub App. A maintainer merges. Merging publishes, because Cloudflare already rebuilds on push to `main`.

- The Worker lives in its own `worker/` folder with its own `package.json`. The site build and `wrangler.jsonc` at the root are untouched.
- The Worker is deployed as a separate Cloudflare project and served on `visitdhaka.org/api/*` through a Worker route, so browser requests are same-origin (no CORS, first-party cookies if sign-in is added).
- Bot identity is a GitHub App, not a personal access token.
- Abuse controls: Cloudflare Turnstile on submit, per-IP rate limiting, a global daily cap on pull requests, input validation (see architecture doc).
- v1 scope: text edits to the body of existing `.md` pages only. No new pages, no renames, no deletes, no uploads, no MDX, no frontmatter edits.

## Consequences

- Positive: running cost near zero at low volume, no server, full history and revert from git, human review before anything is public.
- Negative: this is moderated editing, not instant editing. The reviewer is a bottleneck. If the primary goal is instant public edits, this design does not meet it (see the feasibility review).
- New surface to maintain: Worker code, a GitHub App and its secrets, a Turnstile widget, a second Cloudflare project.
- `CLAUDE.md` currently says not to add `wrangler` as a dependency. The Worker needs it as a `devDependency` inside `worker/` only. That rule should be amended to say so.
- Two Cloudflare build triggers must be configured with care: the site project should not run preview builds for `edit/*` branches, or every pull request consumes build minutes.
