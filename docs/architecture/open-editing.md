# Open editing architecture

Status: proposed (decisions 0002, 0003, 0004). Nothing here is built yet except the "Edit page" link (0001).

## Goals and non-goals

Goals: let the public improve existing pages, keep full history and revert, credit contributors, cost close to nothing, and keep the static site as it is.

Non-goals for v1: instant publishing, new pages, renames, deletes, image uploads, MDX pages, frontmatter edits, real-time collaboration, user accounts.

## Components

```
Reader's browser
  |  1. "Edit" button on a docs page (Starlight component override)
  |  2. markdown editor with the page body, name field, licence notice, Turnstile
  v
Worker  (visitdhaka.org/api/*, separate Cloudflare project, folder worker/)
  |  3. verify Turnstile, rate limit, validate input
  |  4. authenticate as a GitHub App (short-lived installation token)
  v
GitHub repo Tingeworks/visitdhakaorg
  |  5. branch edit/<page-slug>, commit (author = contributor, committer = bot)
  |  6. pull request with contributor name and change summary
  v
Maintainer reviews the diff and merges  (merge commit or rebase, not squash)
  v
Cloudflare Workers Builds rebuilds the site from main and publishes
  (phase 2 only: GitHub webhook -> Worker -> D1 records the outcome)
```

The existing site (Astro + Starlight, `wrangler.jsonc` at the root, static assets from `dist/`) is not changed by the Worker. The only site changes are the editor component, the `contributors` field and the footer list.

## Edit request

`POST /api/edit`

| Field | Rules |
| :--- | :--- |
| `path` | Must match an existing `src/content/docs/**/*.md`. `.mdx`, other folders and paths with `..` are rejected. |
| `body` | Replacement markdown body. Frontmatter is never accepted from the client. |
| `baseSha` | Blob SHA of the file the editor loaded. Used to detect edits made on stale content. |
| `name` | Optional. 1 to 40 characters, plain text, no markup. Empty becomes "Anonymous". |
| `summary` | Optional short edit summary, length-limited, used in the pull request. |
| `turnstile` | Token, verified server side on every request. |
| `licence` | Must be true. Text: contributions are released under CC BY-SA 4.0. |

`GET /api/source?path=...` returns the current body and blob SHA for the editor. Responses are cached at the edge briefly to avoid spending GitHub API calls on reads.

## Validation and abuse controls

These matter more than the hosting choice.

- **Frontmatter is server-owned.** The Worker parses the existing file, replaces only the body, and rewrites frontmatter itself. On any edit it sets `verified: false` and appends the contributor to `contributors:`. A client can never set `verified: true`.
- **Reject executable and unsafe content.** No MDX, no `<script>`, `<iframe>`, event-handler attributes or `javascript:` links. Raw HTML in markdown is rejected in v1 rather than sanitised.
- **Link spam.** Edits that add external links are flagged in the pull request and never auto-merged. Rendered user-added links should carry `rel="nofollow ugc"`.
- **Size limits.** Cap body length and the size of the diff versus the base.
- **Turnstile** on every submit (free, no verification cap).
- **Rate limits.** Per-IP limit through a Cloudflare rate limiting rule, plus a global daily cap on pull requests as a circuit breaker. When the cap is hit, the editor asks the reader to try later. This also protects the GitHub secondary rate limit.
- **Name hygiene.** Names are stripped of markup and control characters and length-limited, and are reviewed as part of the pull request diff.
- **Branch hygiene.** One open branch per page (`edit/<slug>`). A second edit to the same page adds a commit to the existing pull request. Enable "automatically delete head branches" on the repo.

## Identity and secrets

- A GitHub App installed on this one repo with only Contents and Pull requests write. It produces short-lived installation tokens and is not tied to a person's account, which a personal access token would be.
- App private key and Turnstile secret are Worker secrets. Nothing secret is in the repo or the browser.
- Anonymous author email is always `anonymous@visitdhaka.org` (see 0003).

## Data model changes

- `src/content.config.ts`: add `contributors` (array of strings, optional) to the docs schema.
- `public/admin/config.yml`: add the same field to every pillar collection (schema and CMS config are separate, per `CLAUDE.md`), and test that saving a page in Sveltia keeps the list.
- Footer: a component (Starlight override) that renders the list under each page.

## Deployment topology

| Piece | Where | Deploys from |
| :--- | :--- | :--- |
| Static site | Existing Cloudflare project, `wrangler.jsonc` at repo root | `main`, root directory |
| Edit Worker | New Cloudflare project, `worker/wrangler.jsonc` | `main`, root directory `worker/` |
| Route | `visitdhaka.org/api/*` mapped to the Worker | Cloudflare zone (requires the domain on Cloudflare, already on the roadmap) |

Cloudflare's branch controls for the site project should be set so `edit/*` branches do not trigger preview builds.

## Phases

1. **Phase 1, MVP (no D1):** editor, Worker, GitHub App, Turnstile, rate limiting, frontmatter rules, `contributors` credit, one branch per page. Recommended to test the credit and merge behaviour with a handful of real pull requests before public launch.
2. **Phase 2, records:** D1 `contributions` table and webhook, reconcile job, recent-changes page.
3. **Phase 3, identity and trust:** optional GitHub sign-in, verified credit, per-user trust levels, auto-merge for trusted users.
4. **Later:** new-page creation, image uploads, a reviewer UI outside GitHub.

## Open questions

- Does a squash merge preserve or replace the commit author? Test on the first real pull request and record the answer in 0003.
- Does the free Worker plan's CPU limit per request cover frontmatter parsing and validation, or is the $5 paid plan needed?
- Where does the editor read the current source from: the Worker (GitHub API, cached) or raw GitHub (may lag)?
- Who reviews, how quickly, and is GitHub's pull request UI acceptable for them?
- Licence and terms wording, and a takedown process (see feasibility review).
